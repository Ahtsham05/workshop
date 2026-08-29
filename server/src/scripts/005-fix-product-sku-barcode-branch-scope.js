/**
 * Migration Script 005: fix Product/ProductVariant sku+barcode uniqueness to be
 * per-(organizationId, branchId) instead of global, deeply and once.
 *
 * Background: `barcode` originally had a single-field, collection-wide unique index —
 * one org's product in one branch could permanently block a *different* org/branch from
 * ever using the same barcode. `sku` had no uniqueness at all. product.model.js /
 * productVariant.model.js now declare the correct scoped indexes, and
 * product.service.js#ensureProductIndexes / productVariant.service.js#ensureProductVariantIndexes
 * lazily migrate to them on the next write in a running server process.
 *
 * That lazy, in-process migration has real gaps this script closes directly:
 *
 *   1. It's guarded by an in-memory flag that's set once per PROCESS LIFETIME. If an
 *      older build of that function already ran successfully earlier in a long-running
 *      process (before a later code fix landed), the flag stays true and the newer
 *      cleanup/rebuild logic never runs again until the process restarts — so the old
 *      global unique index (or leftover duplicate sku/barcode values) can keep silently
 *      blocking writes indefinitely, exactly as "barcode already exists" even though it
 *      only exists in a *different* branch. Confirmed live in production data: the old
 *      single-field unique `barcode_1` index was still present on `products` alongside
 *      the new scoped one.
 *   2. Building a *new* unique index over data that predates any sku uniqueness check
 *      can fail outright if real duplicate sku values already exist within the same
 *      branch — also confirmed live: dozens of exact-duplicate product rows (same name,
 *      same sku, same branch), almost certainly from a catalog having been imported/
 *      seeded more than once before sku had any validation at all.
 *   3. It only ever runs opportunistically, as a side effect of someone happening to
 *      create/update a product — never proactively, and never with visibility into what
 *      it actually did.
 *
 * This script does the following directly against the database, with full before/after
 * visibility, independent of any server process's state:
 *   a) Drop the legacy single-field unique `barcode` index on `products` (and
 *      `productvariants`, which also gets its `sku` index rebuilt from non-unique to
 *      unique — see productVariant.model.js).
 *   b) Normalize every existing `sku: ""` / `sku: null` / `barcode: ""` / `barcode: null`
 *      to a genuinely *absent* field — a unique index can't be built at all over
 *      existing literal-empty-string duplicates (every product that ever left SKU/
 *      barcode blank has the exact same stored value).
 *   c) Disambiguate real (non-empty) duplicate sku/barcode values within the same
 *      branch: for each duplicate group, the oldest document keeps its value; every
 *      later one is renamed to `<value>-DUP2`, `-DUP3`, etc. (falling back to a random
 *      suffix on the rare chance that exact string is *also* already taken). Nothing is
 *      merged or deleted — every product, its stock, price, and name are untouched;
 *      only the sku/barcode text on the later duplicates changes, so the unique index
 *      can be built without losing any record. Search for "-DUP" afterwards to find and
 *      manually review/merge candidates at your own pace.
 *   d) Rebuild indexes from the current schema (Model.syncIndexes()).
 *
 * Usage:
 *   NODE_ENV=development node src/scripts/005-fix-product-sku-barcode-branch-scope.js            # dry-run, reports only
 *   NODE_ENV=development node src/scripts/005-fix-product-sku-barcode-branch-scope.js --apply     # writes the fix
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const logger = require('../config/logger');
const { Product, ProductVariant } = require('../models');

const args = process.argv.slice(2);
const apply = args.includes('--apply');

/** True for a single-field (not compound), unique index on exactly `field`. */
const isLegacyGlobalUniqueIndex = (idx, field) =>
  idx.unique && Object.keys(idx.key).length === 1 && idx.key[field] === 1;

/** True for the old org+branch-scoped `sku` index built as non-unique (pre-fix ProductVariant only). */
const isLegacyNonUniqueScopedSkuIndex = (idx) =>
  !idx.unique && idx.key?.organizationId === 1 && idx.key?.branchId === 1 && idx.key?.sku === 1 && Object.keys(idx.key).length === 3;

const RENAME_BATCH_SIZE = 1000;

/**
 * Finds every (organizationId, branchId, <field>) group with more than one document —
 * a real, pre-existing duplicate the new unique index can't be built over. In apply
 * mode, renames every member after the first (sorted oldest-first by _id, which encodes
 * creation time) to `<value>-DUP2`, `-DUP3`, ... Collisions against a candidate that's
 * already taken by some other, non-grouped document are checked once per (org, branch)
 * scope against an in-memory set built from a single query — not a round trip per
 * candidate — and all renames are sent as chunked bulkWrite batches. On a catalog with
 * thousands of duplicates, a query (or even a connection) per rename is what actually
 * timed out the first pass of this script; this version does the same disambiguation
 * in a small constant number of round trips instead. Returns { groups, renamed }.
 */
async function disambiguateDuplicates(collection, field, label) {
  const groups = await collection
    .aggregate([
      { $match: { [field]: { $type: 'string', $ne: '' } } },
      {
        $group: {
          _id: { organizationId: '$organizationId', branchId: '$branchId', value: `$${field}` },
          count: { $sum: 1 },
          ids: { $push: '$_id' },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  if (groups.length === 0) return { groups: 0, renamed: 0 };

  logger.info(`[005] ${label}: ${groups.length} duplicate ${field} group(s) found (same branch, real value, more than one product)`);

  if (!apply) {
    groups.forEach((group) => {
      const sortedIds = [...group.ids].sort((a, b) => a.toString().localeCompare(b.toString()));
      logger.info(`[005] ${label}: "${group._id.value}" used by ${group.count} products in this branch — would keep it on ${sortedIds[0]}`);
    });
    return { groups: groups.length, renamed: 0 };
  }

  // One query per distinct (org, branch) scope to know every value already in use
  // there — cheap (a handful of scopes even across thousands of duplicate groups) and
  // lets every candidate be checked in-memory instead of hitting the database again.
  const scopeOf = (organizationId, branchId) => `${organizationId}::${branchId}`;
  const existingByScope = new Map();
  const scopes = [...new Map(groups.map((g) => [scopeOf(g._id.organizationId, g._id.branchId), g._id])).values()];
  for (const scope of scopes) {
    // eslint-disable-next-line no-await-in-loop
    const values = await collection.distinct(field, { organizationId: scope.organizationId, branchId: scope.branchId });
    existingByScope.set(scopeOf(scope.organizationId, scope.branchId), new Set(values));
  }

  const operations = [];
  let renamed = 0;
  for (const group of groups) {
    const { organizationId, branchId, value } = group._id;
    const takenValues = existingByScope.get(scopeOf(organizationId, branchId));
    // _id sort = creation order, no dependency on createdAt actually being set.
    const sortedIds = [...group.ids].sort((a, b) => a.toString().localeCompare(b.toString()));
    logger.info(`[005] ${label}: "${value}" used by ${group.count} products in this branch — keeping it on ${sortedIds[0]}`);

    for (let i = 1; i < sortedIds.length; i += 1) {
      let candidate = `${value}-DUP${i + 1}`;
      while (takenValues.has(candidate)) {
        candidate = `${value}-DUP${i + 1}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      }
      takenValues.add(candidate);
      operations.push({ updateOne: { filter: { _id: sortedIds[i] }, update: { $set: { [field]: candidate } } } });
      renamed += 1;
    }
  }

  for (let i = 0; i < operations.length; i += RENAME_BATCH_SIZE) {
    const batch = operations.slice(i, i + RENAME_BATCH_SIZE);
    // eslint-disable-next-line no-await-in-loop
    await collection.bulkWrite(batch, { ordered: false });
    logger.info(`[005] ${label}: renamed batch ${i + 1}-${i + batch.length} of ${operations.length}`);
  }

  return { groups: groups.length, renamed };
}

async function fixCollection({ label, collectionName, Model, checkLegacySkuIndex }) {
  const collection = mongoose.connection.collection(collectionName);

  const indexesBefore = await collection.indexes();
  logger.info(`[005] ${label}: ${indexesBefore.length} index(es) currently on disk:`);
  indexesBefore.forEach((idx) => logger.info(`[005]   - ${idx.name} ${JSON.stringify(idx.key)}${idx.unique ? ' (unique)' : ''}`));

  const legacyBarcodeIndex = indexesBefore.find((idx) => isLegacyGlobalUniqueIndex(idx, 'barcode'));
  const legacySkuIndex = checkLegacySkuIndex ? indexesBefore.find(isLegacyNonUniqueScopedSkuIndex) : null;

  const emptySkuCount = await collection.countDocuments({ sku: { $in: ['', null] } });
  const emptyBarcodeCount = await collection.countDocuments({ barcode: { $in: ['', null] } });

  logger.info(
    `[005] ${label}: legacy global barcode index=${legacyBarcodeIndex ? legacyBarcodeIndex.name : 'none'}, ` +
      `legacy non-unique sku index=${legacySkuIndex ? legacySkuIndex.name : 'none'}, ` +
      `docs with empty sku=${emptySkuCount}, docs with empty barcode=${emptyBarcodeCount}`
  );

  const skuDupes = await disambiguateDuplicates(collection, 'sku', label);
  const barcodeDupes = await disambiguateDuplicates(collection, 'barcode', label);
  logger.info(
    `[005] ${label}: sku duplicate groups=${skuDupes.groups} (renamed ${skuDupes.renamed}), ` +
      `barcode duplicate groups=${barcodeDupes.groups} (renamed ${barcodeDupes.renamed})`
  );

  if (!apply) return;

  if (legacyBarcodeIndex) {
    await collection.dropIndex(legacyBarcodeIndex.name);
    logger.info(`[005] ${label}: dropped legacy index ${legacyBarcodeIndex.name}`);
  }
  if (legacySkuIndex) {
    await collection.dropIndex(legacySkuIndex.name);
    logger.info(`[005] ${label}: dropped legacy index ${legacySkuIndex.name}`);
  }

  const skuResult = await collection.updateMany({ sku: { $in: ['', null] } }, { $unset: { sku: '' } });
  const barcodeResult = await collection.updateMany({ barcode: { $in: ['', null] } }, { $unset: { barcode: '' } });
  logger.info(
    `[005] ${label}: normalized ${skuResult.modifiedCount} empty sku value(s), ${barcodeResult.modifiedCount} empty barcode value(s)`
  );

  await Model.syncIndexes();
  const indexesAfter = await collection.indexes();
  logger.info(`[005] ${label}: ${indexesAfter.length} index(es) on disk after rebuild:`);
  indexesAfter.forEach((idx) => logger.info(`[005]   - ${idx.name} ${JSON.stringify(idx.key)}${idx.unique ? ' (unique)' : ''}`));
}

async function run() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('[005] Connected to MongoDB');
    logger.info(`[005] mode=${apply ? 'APPLY' : 'DRY-RUN'}`);

    await fixCollection({ label: 'products', collectionName: 'products', Model: Product, checkLegacySkuIndex: false });
    await fixCollection({
      label: 'productvariants',
      collectionName: 'productvariants',
      Model: ProductVariant,
      checkLegacySkuIndex: true,
    });

    logger.info(apply ? '[005] Done — sku/barcode uniqueness is now scoped per branch.' : '[005] Dry run complete — pass --apply to write the fix. No data was modified.');
  } catch (err) {
    logger.error('[005] Migration failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
