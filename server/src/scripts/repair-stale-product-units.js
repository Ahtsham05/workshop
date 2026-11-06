/**
 * Repair: relabels units copied from a product before product edits started carrying a
 * unit change along (product.service.js#updateProductById → productUnitSync.service.js).
 * A product changed from "pcs" to "kg" still showed "pcs" on its BOM lines, production
 * orders, manufacturing vouchers and stock ledger. Quantities are untouched — only the label.
 *
 * Every record type in UNIT_COPIES is covered: manufacturing, the stock ledger, stock counts,
 * sales + purchases (lines at conversion factor 1). Only products on those records are
 * checked. A dry-run does the same writes inside a transaction and aborts it, so the counts
 * are exact and nothing is kept.
 *
 * Usage:
 *   NODE_ENV=development node src/scripts/repair-stale-product-units.js                  # dry-run, all orgs
 *   NODE_ENV=development node src/scripts/repair-stale-product-units.js --org=<id>       # dry-run, one org
 *   NODE_ENV=development node src/scripts/repair-stale-product-units.js --apply [--org=<id>]
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const logger = require('../config/logger');
const models = require('../models');
const { syncProductUnit, UNIT_COPIES } = require('../services/productUnitSync.service');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const orgArg = args.find((a) => a.startsWith('--org='));
const organizationId = orgArg ? orgArg.split('=')[1] : null;

class DryRun extends Error {}

/** Ids of every product named on a record that copies units (UNIT_COPIES). */
const productsOnRecords = async () => {
  const filter = organizationId ? { organizationId: new mongoose.Types.ObjectId(organizationId) } : {};
  const ids = new Set();
  // eslint-disable-next-line no-restricted-syntax
  for (const { model, header, arrays = [], key = 'productId' } of UNIT_COPIES) {
    const paths = [...(header ? [key] : []), ...arrays.map((p) => `${p}.${key}`)];
    // eslint-disable-next-line no-restricted-syntax
    for (const p of paths) {
      // eslint-disable-next-line no-await-in-loop
      (await models[model].distinct(p, filter)).forEach((id) => id && ids.add(String(id)));
    }
  }
  return [...ids];
};

async function run() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info(`[unit-repair] mode=${apply ? 'APPLY' : 'DRY-RUN'} org=${organizationId || 'ALL'}`);

    const ids = await productsOnRecords();
    const products = await models.Product.find({ _id: { $in: ids } })
      .select('name unit hasVariants organizationId branchId')
      .lean();
    logger.info(`[unit-repair] ${products.length} product(s) on records`);

    let total = 0;
    // eslint-disable-next-line no-restricted-syntax
    for (const product of products) {
      let changed = 0;
      // eslint-disable-next-line no-await-in-loop
      const session = await mongoose.startSession();
      try {
        // eslint-disable-next-line no-await-in-loop
        await session.withTransaction(async () => {
          changed = await syncProductUnit(product, { session });
          if (!apply) throw new DryRun();
        });
      } catch (err) {
        if (!(err instanceof DryRun)) throw err;
      } finally {
        // eslint-disable-next-line no-await-in-loop
        await session.endSession();
      }
      if (changed) logger.info(`[unit-repair] ${product.name} (${product.unit}): ${changed} record(s)`);
      total += changed;
    }

    logger.info(
      `[unit-repair] Done. ${total} record(s) ${
        apply ? 'relabelled' : 'would be relabelled — pass --apply to write. No data was modified.'
      }`
    );
  } catch (err) {
    logger.error('[unit-repair] Repair failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
