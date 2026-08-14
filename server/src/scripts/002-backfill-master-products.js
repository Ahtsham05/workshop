/**
 * Migration Script 002: backfill MasterProduct linkage for every existing Product.
 *
 * Part of the Master Product Catalog migration —
 * see docs/architecture/master-product-migration.md.
 *
 * For each Product with no masterProductId (optionally scoped to one org):
 *   Calls masterProduct.service.js#linkProductToMasterProduct, which:
 *     1. Finds an existing MasterProduct in this org matching by barcode-or-exact-name
 *        (server/src/utils/productMatchKey.js) — products across different branches
 *        that share an exact barcode/name end up linked to the SAME MasterProduct.
 *     2. Creates a new MasterProduct from this product's template fields if no match
 *        exists — so every product ends up linked, ready to be discovered/imported by
 *        other branches later, even a genuinely one-of-a-kind item.
 *     3. For hasVariants products, does the same at the variant level (sku, else exact
 *        attribute match) against MasterProductVariant.
 *   Never throws (see that function's docblock) — a failure just leaves
 *   masterProductId unset, so the product is retried on the next run.
 *
 * This script never touches Product.stockQuantity, price, cost, or any other
 * pre-existing field — it only ever creates new MasterProduct/MasterProductVariant
 * documents and sets the two new nullable link fields.
 *
 * Usage:
 *   NODE_ENV=development node src/scripts/002-backfill-master-products.js                       # dry-run, all orgs
 *   NODE_ENV=development node src/scripts/002-backfill-master-products.js --org=<organizationId> # dry-run, one org
 *   NODE_ENV=development node src/scripts/002-backfill-master-products.js --apply                # write, all orgs
 *   NODE_ENV=development node src/scripts/002-backfill-master-products.js --apply --org=<id> --batchSize=200
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const logger = require('../config/logger');
const { Product } = require('../models');
const { linkProductToMasterProduct } = require('../services/masterProduct.service');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const orgArg = args.find((a) => a.startsWith('--org='));
const organizationId = orgArg ? orgArg.split('=')[1] : null;
const batchSizeArg = args.find((a) => a.startsWith('--batchSize='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 200;

async function run() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('[002-backfill] Connected to MongoDB');
    logger.info(`[002-backfill] mode=${apply ? 'APPLY' : 'DRY-RUN'} org=${organizationId || 'ALL'} batchSize=${batchSize}`);

    // { field: null } matches both explicit nulls and documents where the field is
    // entirely absent (every pre-migration Product) — standard MongoDB equality
    // semantics, same reasoning 001 uses for its schemaVersion filter.
    const filter = { masterProductId: null };
    if (organizationId) filter.organizationId = organizationId;

    const totalPending = await Product.countDocuments(filter);
    logger.info(`[002-backfill] ${totalPending} product(s) pending master-product linkage`);

    if (!apply) {
      logger.info('[002-backfill] Dry-run only — pass --apply to write changes. No data was modified.');
      return;
    }

    let linked = 0;
    let failed = 0;
    let processed = 0;

    // Cursor-based, batched so this can run against a live, traffic-serving database.
    const cursor = Product.find(filter).cursor();
    let batch = [];
    const flush = async () => {
      for (const product of batch) {
        await linkProductToMasterProduct(product);
        // linkProductToMasterProduct mutates+saves `product` in place and never throws
        // (logs + leaves masterProductId unset on failure) — the field itself is the
        // signal of success.
        if (product.masterProductId) linked++;
        else failed++;
        processed++;
      }
      logger.info(`[002-backfill] Progress: ${processed}/${totalPending} (linked=${linked}, failed=${failed})`);
      batch = [];
    };

    for await (const product of cursor) {
      batch.push(product);
      if (batch.length >= batchSize) {
        await flush();
      }
    }
    if (batch.length) await flush();

    logger.info(`[002-backfill] Done. linked=${linked} failed=${failed} (failed products will be retried on next run)`);
  } catch (err) {
    logger.error('[002-backfill] Migration failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
