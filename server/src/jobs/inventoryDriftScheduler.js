const logger = require('../config/logger');
const { ProductVariant, Product, Inventory } = require('../models');

/**
 * Same setInterval + "already ran today" guard pattern as the other schedulers in this
 * directory (no cron library installed in this project).
 *
 * Read-only watchdog for the Universal Product Architecture dual-write (Phase 2) —
 * see docs/architecture/universal-product-migration.md section 13. Only orgs piloting
 * DUAL_WRITE_INVENTORY_ORGS/DUAL_WRITE_INVENTORY have variants to check, so this is a
 * no-op everywhere else. A mismatch never corrupts customer data — Product.stockQuantity
 * stays untouched — it only means the new ledger has drifted and needs investigation.
 */
const RUN_INTERVAL_MS = 60 * 60 * 1000; // check hourly, only actually run once per day
const DAILY_RUN_HOUR_UTC = 4;

let lastRunDateKey = null;
let isRunning = false;

const getDateKey = (date = new Date()) => date.toISOString().slice(0, 10);

const checkInventoryDrift = async () => {
  const variants = await ProductVariant.find({ isDefault: true }).select('_id productId').lean();

  let checked = 0;
  const mismatches = [];

  for (const variant of variants) {
    const [product, inventory] = await Promise.all([
      Product.findById(variant.productId).select('stockQuantity name organizationId').lean(),
      Inventory.findOne({ variantId: variant._id }).select('quantity').lean(),
    ]);
    if (!product || !inventory) continue;
    checked++;

    if (product.stockQuantity !== inventory.quantity) {
      mismatches.push({
        productId: variant.productId.toString(),
        organizationId: product.organizationId.toString(),
        name: product.name,
        stockQuantity: product.stockQuantity,
        inventoryQuantity: inventory.quantity,
      });
    }
  }

  return { checked, mismatches };
};

const runDailyInventoryDriftCheck = async () => {
  const now = new Date();
  const dateKey = getDateKey(now);

  if (lastRunDateKey === dateKey || isRunning) return;
  if (now.getUTCHours() < DAILY_RUN_HOUR_UTC) return;

  isRunning = true;
  try {
    const { checked, mismatches } = await checkInventoryDrift();
    lastRunDateKey = dateKey;
    if (mismatches.length > 0) {
      logger.warn(
        `[inventory-drift] Checked ${checked} variant(s). ${mismatches.length} mismatch(es) found: ` +
          JSON.stringify(mismatches)
      );
    } else {
      logger.info(`[inventory-drift] Checked ${checked} variant(s). No drift detected.`);
    }
  } catch (error) {
    logger.error('[inventory-drift] Daily drift check failed:', error.message);
  } finally {
    isRunning = false;
  }
};

const startInventoryDriftScheduler = () => {
  runDailyInventoryDriftCheck();
  setInterval(runDailyInventoryDriftCheck, RUN_INTERVAL_MS);
  logger.info('Inventory drift scheduler started (runs once daily, ~04:00 UTC).');
};

module.exports = { startInventoryDriftScheduler, runDailyInventoryDriftCheck, checkInventoryDrift };
