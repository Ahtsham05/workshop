/**
 * Rollback for Migration Script 002 (src/scripts/002-backfill-master-products.js).
 *
 * Safe because script 002 (and the always-on auto-link hook in
 * product.service.js#createProduct / #bulkAddProducts) only ever creates new
 * MasterProduct/MasterProductVariant documents and sets Product.masterProductId /
 * ProductVariant.masterVariantId — it never mutates any pre-existing field on Product,
 * ProductVariant, or any other collection. Rolling back is therefore a pure delete of
 * this org's MasterProduct/MasterProductVariant documents plus unsetting the two link
 * fields, scoped to one org.
 *
 * Usage:
 *   NODE_ENV=development node src/scripts/rollback-002-backfill-master-products.js --org=<organizationId>            # dry-run
 *   NODE_ENV=development node src/scripts/rollback-002-backfill-master-products.js --org=<organizationId> --apply    # write
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const logger = require('../config/logger');
const { Product, ProductVariant, MasterProduct, MasterProductVariant } = require('../models');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const orgArg = args.find((a) => a.startsWith('--org='));
const organizationId = orgArg ? orgArg.split('=')[1] : null;

async function run() {
  if (!organizationId) {
    logger.error('[rollback-002] --org=<organizationId> is required — rollback is always scoped to one org.');
    process.exit(1);
  }

  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('[rollback-002] Connected to MongoDB');
    logger.info(`[rollback-002] mode=${apply ? 'APPLY' : 'DRY-RUN'} org=${organizationId}`);

    const masterProductCount = await MasterProduct.countDocuments({ organizationId });
    const masterVariantCount = await MasterProductVariant.countDocuments({ organizationId });
    const linkedProductCount = await Product.countDocuments({ organizationId, masterProductId: { $ne: null } });
    const linkedVariantCount = await ProductVariant.countDocuments({ organizationId, masterVariantId: { $ne: null } });

    // Imported (zero-stock) products aren't deleted by this rollback — only their
    // master-catalog link is removed, same "never touch pre-existing Product data"
    // guarantee as everything else in this migration. Soft warning, not a hard block —
    // mirrors rollback-001's hasVariants warning.
    const importedProductCount = await Product.countDocuments({ organizationId, masterProductId: { $ne: null }, stockQuantity: 0 });
    if (importedProductCount > 0) {
      logger.warn(
        `[rollback-002] WARNING: up to ${importedProductCount} product(s) in this org may have been created via ` +
          'the "Import from other branches" feature. Rolling back only removes the master-catalog link — those ' +
          'products themselves are NOT deleted and will remain as regular branch products.'
      );
    }

    logger.info(
      `[rollback-002] Will remove: ${masterProductCount} MasterProduct, ${masterVariantCount} MasterProductVariant, ` +
        `and unset the link field on ${linkedProductCount} Product / ${linkedVariantCount} ProductVariant document(s).`
    );

    if (!apply) {
      logger.info('[rollback-002] Dry-run only — pass --apply to write changes. No data was modified.');
      return;
    }

    await ProductVariant.updateMany({ organizationId, masterVariantId: { $ne: null } }, { $set: { masterVariantId: null } });
    await Product.updateMany({ organizationId, masterProductId: { $ne: null } }, { $set: { masterProductId: null } });
    await MasterProductVariant.deleteMany({ organizationId });
    await MasterProduct.deleteMany({ organizationId });

    logger.info('[rollback-002] Rollback complete.');
  } catch (err) {
    logger.error('[rollback-002] Rollback failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
