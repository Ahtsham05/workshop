/**
 * Repair Script 003: creates a catch-up Batch for tracked variants whose
 * Inventory.quantity exceeds the sum of their active Batch.quantity — the "stranded
 * opening stock" bug (see docs/architecture/master-product-migration.md and the
 * transactional fix in product.service.js#updateProductById). Before that fix, turning
 * on trackBatch/trackExpiry via product edit could fail partway (or a Purchase line for
 * an already-tracked variant could be entered without a batchNumber — a related but
 * separate gap in purchase.service.js, left out of scope here), leaving
 * Inventory.quantity ahead of what any Batch document accounts for. That gap is
 * invisible/unsellable on Invoice: product.service.js#getPurchasableCatalog's batch
 * list comes straight from Batch documents, and the Invoice batch-picker only renders
 * when at least one exists — so that stock shows in the "N left" total but has no batch
 * to actually sell against.
 *
 * For every trackBatch/trackExpiry ProductVariant where
 *   Inventory.quantity > sum(active Batch.quantity for that inventory)
 * creates one catch-up Batch (direct Batch.create, NOT batch.service.js#createBatch —
 * that function $incs Inventory.quantity to match whatever it creates, which would
 * double-count here: the gap is already reflected in Inventory.quantity, this only
 * needs a Batch document to explain it) for the difference, plus a zero-delta
 * InventoryTransaction for audit visibility. Never touches Inventory.quantity or
 * Product.stockQuantity — it only backfills the missing Batch record.
 *
 * A NEGATIVE gap (Inventory.quantity below the batch total) is NOT auto-fixed — that
 * shouldn't happen from this bug, and guessing which batch is wrong risks corrupting
 * real data — it's only logged for manual review.
 *
 * Usage:
 *   NODE_ENV=development node src/scripts/003-repair-untracked-batch-stock.js                        # dry-run, all orgs
 *   NODE_ENV=development node src/scripts/003-repair-untracked-batch-stock.js --org=<organizationId>  # dry-run, one org
 *   NODE_ENV=development node src/scripts/003-repair-untracked-batch-stock.js --apply                 # write, all orgs
 *   NODE_ENV=development node src/scripts/003-repair-untracked-batch-stock.js --apply --org=<id> --batchPrefix=OPENING
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const logger = require('../config/logger');
const { ProductVariant, Inventory, Batch, InventoryTransaction } = require('../models');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const orgArg = args.find((a) => a.startsWith('--org='));
const organizationId = orgArg ? orgArg.split('=')[1] : null;
const prefixArg = args.find((a) => a.startsWith('--batchPrefix='));
const batchPrefix = prefixArg ? prefixArg.split('=')[1] : 'OPENING';

async function run() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('[003-repair] Connected to MongoDB');
    logger.info(`[003-repair] mode=${apply ? 'APPLY' : 'DRY-RUN'} org=${organizationId || 'ALL'} batchPrefix=${batchPrefix}`);

    const variantFilter = { $or: [{ trackBatch: true }, { trackExpiry: true }] };
    if (organizationId) variantFilter.organizationId = organizationId;

    const variants = await ProductVariant.find(variantFilter).lean();
    logger.info(`[003-repair] ${variants.length} batch/expiry-tracked variant(s) to check`);

    let checked = 0;
    let gapsFound = 0;
    let fixed = 0;
    let negativeGaps = 0;

    for (const variant of variants) {
      checked += 1;
      const inventory = await Inventory.findOne({ variantId: variant._id }).lean();
      if (!inventory) continue;

      const activeBatches = await Batch.find({ inventoryId: inventory._id, status: 'active' }).lean();
      const batchTotal = activeBatches.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
      const gap = Number(inventory.quantity || 0) - batchTotal;

      if (gap === 0) continue;

      if (gap < 0) {
        negativeGaps += 1;
        logger.warn(
          `[003-repair] Variant ${variant._id} (product ${variant.productId}): Inventory.quantity ` +
            `(${inventory.quantity}) is BELOW its active batch total (${batchTotal}), gap=${gap} — ` +
            'not auto-fixed, needs manual review.'
        );
        continue;
      }

      gapsFound += 1;
      logger.info(
        `[003-repair] Variant ${variant._id} (product ${variant.productId}): Inventory.quantity=${inventory.quantity}, ` +
          `active batch total=${batchTotal}, gap=${gap}`
      );

      if (apply) {
        // Deliberately NOT batchService.createBatch — that function is for *adding new*
        // stock (it $incs Inventory.quantity to match the batch it creates), which would
        // double-count here: the gap quantity is already reflected in Inventory.quantity,
        // this only needs a Batch document to explain it. A direct Batch.create (+ an
        // audit InventoryTransaction with quantityDelta: 0, since no real stock moved)
        // is the correct "explain existing stock" operation, mirroring how
        // product.service.js#syncDefaultVariantTracking's skipProductMirror achieves the
        // same "don't touch the total" intent for the analogous opening-batch case.
        const batch = await Batch.create({
          organizationId: variant.organizationId,
          inventoryId: inventory._id,
          batchNumber: `${batchPrefix}-${Date.now()}-${String(gapsFound).padStart(3, '0')}`,
          quantity: gap,
          costPerUnit: Number(variant.cost) || 0,
          sellingPrice: Number(variant.price) || undefined,
          status: 'active',
        });
        await InventoryTransaction.create({
          organizationId: variant.organizationId,
          branchId: variant.branchId,
          inventoryId: inventory._id,
          variantId: variant._id,
          type: 'adjustment',
          quantityDelta: 0,
          balanceAfter: inventory.quantity,
          unitCost: batch.costPerUnit,
          refType: 'Batch',
          refId: batch._id,
        });
        fixed += 1;
      }
    }

    logger.info(
      `[003-repair] Done. checked=${checked} gapsFound=${gapsFound} negativeGaps=${negativeGaps}` +
        (apply ? ` fixed=${fixed}` : ' — pass --apply to write catch-up batches. No data was modified.')
    );
  } catch (err) {
    logger.error('[003-repair] Repair failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
