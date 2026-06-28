/**
 * Drift check for the Universal Product Architecture dual-write (Phase 2) —
 * see docs/architecture/universal-product-migration.md, section 13 (deployment strategy).
 *
 * Compares Inventory.quantity against the legacy Product.stockQuantity for every
 * product that has a default ProductVariant + Inventory row, and reports mismatches.
 * Read-only — never writes anything. Intended to be run on a schedule (or by hand)
 * while piloting DUAL_WRITE_INVENTORY_ORGS, to confirm the new ledger is staying in
 * sync with the legacy field before expanding the flag to more orgs.
 *
 * A mismatch here does NOT corrupt any customer-facing data — Product.stockQuantity
 * remains untouched and correct. It only means the new Inventory/InventoryTransaction
 * ledger has drifted and needs investigation (e.g. a code path that mutates
 * stockQuantity without going through inventorySync.service.js yet).
 *
 * Usage:
 *   NODE_ENV=development node src/scripts/check-inventory-drift.js                     # all orgs
 *   NODE_ENV=development node src/scripts/check-inventory-drift.js --org=<organizationId>
 *   NODE_ENV=development node src/scripts/check-inventory-drift.js --limit=50           # cap reported mismatches
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const logger = require('../config/logger');
const { Product, ProductVariant, Inventory } = require('../models');

const args = process.argv.slice(2);
const orgArg = args.find((a) => a.startsWith('--org='));
const organizationId = orgArg ? orgArg.split('=')[1] : null;
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : 100;

async function run() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('[drift-check] Connected to MongoDB');

    const variantFilter = { isDefault: true };
    if (organizationId) variantFilter.organizationId = organizationId;

    const variants = await ProductVariant.find(variantFilter).select('_id productId organizationId').lean();
    logger.info(`[drift-check] Checking ${variants.length} default variant(s) for drift`);

    let checked = 0;
    let mismatches = 0;
    const examples = [];

    for (const variant of variants) {
      const [product, inventory] = await Promise.all([
        Product.findById(variant.productId).select('stockQuantity name').lean(),
        Inventory.findOne({ variantId: variant._id }).select('quantity').lean(),
      ]);
      checked++;

      if (!product || !inventory) continue;

      if (product.stockQuantity !== inventory.quantity) {
        mismatches++;
        if (examples.length < limit) {
          examples.push({
            productId: variant.productId.toString(),
            organizationId: variant.organizationId.toString(),
            name: product.name,
            stockQuantity: product.stockQuantity,
            inventoryQuantity: inventory.quantity,
            delta: inventory.quantity - product.stockQuantity,
          });
        }
      }
    }

    logger.info(`[drift-check] Checked ${checked} product(s). Mismatches: ${mismatches}`);
    if (examples.length) {
      logger.warn(`[drift-check] Showing up to ${limit} mismatch(es):`);
      for (const ex of examples) {
        logger.warn(
          `  product=${ex.productId} org=${ex.organizationId} name="${ex.name}" ` +
            `stockQuantity=${ex.stockQuantity} inventory.quantity=${ex.inventoryQuantity} delta=${ex.delta}`
        );
      }
    } else {
      logger.info('[drift-check] No drift detected.');
    }
  } catch (err) {
    logger.error('[drift-check] Failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
