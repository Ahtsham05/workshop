/**
 * Migration Script 006: backfill the barcode on Product documents that were created by
 * an earlier stock transfer (or master-catalog import) before inventoryTransfer.service.js
 * was fixed to copy it — see server/src/services/inventoryTransfer.service.js#findOrCreateDestinationProduct.
 *
 * Before that fix, transferring a product to a branch that didn't yet have it created a
 * brand-new, barcode-less Product doc there, even when the source branch's copy had a
 * real barcode. Going forward, that same item being transferred again will self-heal
 * (see findOrCreateDestinationProduct's "needsHeal" block) — this script is only for
 * products that are barcode-less *right now* and won't necessarily ever be transferred
 * again.
 *
 * Matching rule (deliberately conservative — this only ever ADDS a barcode, never
 * changes or removes one, and never guesses):
 *   For each barcode-less product, look at every OTHER product in the same organization
 *   (any branch) with the exact same name (case-insensitive, trimmed). If every one of
 *   those that DOES have a barcode agrees on a single value, backfill that value onto
 *   the barcode-less product. If two same-named products in the org disagree on barcode
 *   (a real, if rare, case of two different items happening to share a name), the match
 *   is ambiguous and is skipped — reported, not guessed at.
 *
 * A final per-write safety check (the same protection the model's own unique index
 * would give at runtime) skips a candidate outright if another product already sitting
 * in that exact (organizationId, branchId) already owns the barcode being assigned —
 * this can only happen from data entered independently of any transfer, and this script
 * must never silently paper over a genuine conflict.
 *
 * Usage:
 *   NODE_ENV=development node src/scripts/006-backfill-transferred-product-barcodes.js            # dry-run, reports only
 *   NODE_ENV=development node src/scripts/006-backfill-transferred-product-barcodes.js --apply     # writes the fix
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const logger = require('../config/logger');
const { Product } = require('../models');

const args = process.argv.slice(2);
const apply = args.includes('--apply');

const normalizeName = (name) => String(name || '').trim().toLowerCase();

async function run() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('[006] Connected to MongoDB');
    logger.info(`[006] mode=${apply ? 'APPLY' : 'DRY-RUN'}`);

    const collection = mongoose.connection.collection('products');

    // One barcode per (organizationId, normalized name) — only kept when every barcoded
    // product sharing that name in that org agrees on the same value.
    const barcodeGroups = await collection
      .aggregate([
        { $match: { barcode: { $type: 'string' } } },
        { $addFields: { normalizedName: { $toLower: { $trim: { input: '$name' } } } } },
        { $group: { _id: { organizationId: '$organizationId', normalizedName: '$normalizedName' }, barcodes: { $addToSet: '$barcode' } } },
      ])
      .toArray();

    const barcodeByKey = new Map();
    let ambiguousGroups = 0;
    for (const group of barcodeGroups) {
      const key = `${group._id.organizationId}::${group._id.normalizedName}`;
      if (group.barcodes.length === 1) {
        barcodeByKey.set(key, group.barcodes[0]);
      } else {
        ambiguousGroups += 1;
        logger.info(
          `[006] Ambiguous — org ${group._id.organizationId}, name "${group._id.normalizedName}" has ${group.barcodes.length} different barcodes across branches (${group.barcodes.join(', ')}); skipping any backfill for this name`
        );
      }
    }
    logger.info(`[006] ${barcodeByKey.size} unambiguous (org, name) → barcode mapping(s) found; ${ambiguousGroups} ambiguous group(s) skipped`);

    const candidates = await collection
      .find(
        { $or: [{ barcode: { $exists: false } }, { barcode: null }, { barcode: '' }] },
        { projection: { organizationId: 1, branchId: 1, name: 1 } }
      )
      .toArray();
    logger.info(`[006] ${candidates.length} barcode-less product(s) found across all organizations`);

    const planned = [];
    for (const doc of candidates) {
      const key = `${doc.organizationId}::${normalizeName(doc.name)}`;
      const barcode = barcodeByKey.get(key);
      if (barcode) planned.push({ _id: doc._id, organizationId: doc.organizationId, branchId: doc.branchId, name: doc.name, barcode });
    }
    logger.info(`[006] ${planned.length} product(s) have an unambiguous barcode to backfill`);

    if (planned.length === 0) {
      logger.info('[006] Nothing to do.');
      return;
    }

    if (!apply) {
      planned.slice(0, 50).forEach((p) => {
        logger.info(`[006]   would set barcode "${p.barcode}" on "${p.name}" (branch ${p.branchId}, product ${p._id})`);
      });
      if (planned.length > 50) logger.info(`[006]   ...and ${planned.length - 50} more`);
      logger.info('[006] Dry run complete — pass --apply to write these changes. No data was modified.');
      return;
    }

    // Final per-write safety check — skip (don't crash the batch on) any candidate whose
    // own branch already independently owns that exact barcode on a different product;
    // ordered:false so one such conflict never blocks the rest of the batch.
    const ops = planned.map((p) => ({
      updateOne: {
        filter: { _id: p._id, $or: [{ barcode: { $exists: false } }, { barcode: null }, { barcode: '' }] },
        update: { $set: { barcode: p.barcode } },
      },
    }));

    const BATCH_SIZE = 500;
    let modified = 0;
    let conflicts = 0;
    for (let i = 0; i < ops.length; i += BATCH_SIZE) {
      const batch = ops.slice(i, i + BATCH_SIZE);
      try {
        // eslint-disable-next-line no-await-in-loop
        const result = await collection.bulkWrite(batch, { ordered: false });
        modified += result.modifiedCount || 0;
      } catch (err) {
        const writeErrors = err.writeErrors || [];
        conflicts += writeErrors.length;
        modified += batch.length - writeErrors.length;
        writeErrors.forEach((we) => {
          const failed = planned[i + we.index];
          logger.info(`[006]   skipped "${failed?.name}" (branch ${failed?.branchId}) — barcode "${failed?.barcode}" already used by another product in that branch`);
        });
      }
      logger.info(`[006] backfilled batch ${i + 1}-${Math.min(i + BATCH_SIZE, ops.length)} of ${ops.length}`);
    }

    logger.info(`[006] Done — ${modified} product(s) backfilled, ${conflicts} skipped due to a real conflict in their own branch.`);
  } catch (err) {
    logger.error('[006] Migration failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
