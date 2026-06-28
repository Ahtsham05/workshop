/**
 * Rollback for Migration Script 001 (src/scripts/001-backfill-product-variants.js).
 *
 * Safe because script 001 only ever creates new ProductVariant/Inventory/SerialNumber
 * documents and flips Product.schemaVersion — it never mutates any pre-existing field
 * on Product or any other collection. Rolling back is therefore a pure delete of the
 * rows script 001 created, plus resetting schemaVersion back to 1, scoped to one org.
 *
 * Identifies migration-created rows the same way script 001 creates them:
 *   - ProductVariant: isDefault === true, for products in the target org.
 *   - Inventory / SerialNumber: linked to those variants.
 * Hand-created variants (from real variant-UI usage) are never isDefault === true for
 * a product that still has hasVariants === false, so they are not touched. If an org
 * has already started using variants for real, do not roll back script 001 for it —
 * the audit step below will warn before deleting anything.
 *
 * Usage:
 *   NODE_ENV=development node src/scripts/rollback-001-backfill-product-variants.js --org=<organizationId>            # dry-run
 *   NODE_ENV=development node src/scripts/rollback-001-backfill-product-variants.js --org=<organizationId> --apply    # write
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const logger = require('../config/logger');
const { Product, ProductVariant, Inventory, SerialNumber } = require('../models');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const orgArg = args.find((a) => a.startsWith('--org='));
const organizationId = orgArg ? orgArg.split('=')[1] : null;

async function run() {
  if (!organizationId) {
    logger.error('[rollback-001] --org=<organizationId> is required — rollback is always scoped to one org.');
    process.exit(1);
  }

  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('[rollback-001] Connected to MongoDB');
    logger.info(`[rollback-001] mode=${apply ? 'APPLY' : 'DRY-RUN'} org=${organizationId}`);

    const variants = await ProductVariant.find({ organizationId, isDefault: true }).select('_id productId').lean();
    const variantIds = variants.map((v) => v._id);

    const productsUsingRealVariants = await Product.countDocuments({ organizationId, hasVariants: true });
    if (productsUsingRealVariants > 0) {
      logger.warn(
        `[rollback-001] WARNING: ${productsUsingRealVariants} product(s) in this org have hasVariants=true. ` +
          'This rollback only removes isDefault variants and will not touch real variant data, but double-check ' +
          'before proceeding if this org has started using variants for real.'
      );
    }

    const inventoryCount = await Inventory.countDocuments({ variantId: { $in: variantIds } });
    const serialCount = await SerialNumber.countDocuments({ variantId: { $in: variantIds } });
    const productCount = await Product.countDocuments({ organizationId, schemaVersion: 2 });

    logger.info(
      `[rollback-001] Will remove: ${variantIds.length} ProductVariant, ${inventoryCount} Inventory, ` +
        `${serialCount} SerialNumber, and reset schemaVersion on ${productCount} Product document(s).`
    );

    if (!apply) {
      logger.info('[rollback-001] Dry-run only — pass --apply to write changes. No data was modified.');
      return;
    }

    await SerialNumber.deleteMany({ variantId: { $in: variantIds } });
    await Inventory.deleteMany({ variantId: { $in: variantIds } });
    await ProductVariant.deleteMany({ _id: { $in: variantIds } });
    await Product.updateMany({ organizationId, schemaVersion: 2 }, { $set: { schemaVersion: 1 } });

    logger.info('[rollback-001] Rollback complete.');
  } catch (err) {
    logger.error('[rollback-001] Rollback failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
