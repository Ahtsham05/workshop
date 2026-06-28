/**
 * Migration Script 001: backfill ProductVariant + Inventory for every legacy Product.
 *
 * Part of the Universal Product Architecture migration —
 * see docs/architecture/universal-product-migration.md, section 8.
 *
 * For each Product with schemaVersion !== 2 (optionally scoped to one org):
 *   1. Skip (resumable) if a default ProductVariant already exists for this product.
 *   2. Create ProductVariant { isDefault: true, sku, price, cost, unit,
 *      trackSerial: product.trackImei, ... }.
 *   3. Create Inventory { quantity: product.stockQuantity, averageCost: product.cost }
 *      for the same (org, branch, variant) — skipped if one already exists.
 *   4. If product.trackImei, shadow-copy existing Imei docs for this product into
 *      SerialNumber rows linked to the new Inventory/variant. The Imei collection
 *      itself is never modified or deleted — it remains the read-only legacy source.
 *   5. Verify Inventory.quantity === Product.stockQuantity, then set
 *      Product.schemaVersion = 2. On verification failure: log + skip, leave
 *      schemaVersion untouched so the product is retried on the next run.
 *
 * This script never touches Product.stockQuantity or any other pre-existing field —
 * it only ever creates new ProductVariant/Inventory/SerialNumber documents and flips
 * Product.schemaVersion once those are confirmed correct.
 *
 * Usage:
 *   NODE_ENV=development node src/scripts/001-backfill-product-variants.js                       # dry-run, all orgs
 *   NODE_ENV=development node src/scripts/001-backfill-product-variants.js --org=<organizationId> # dry-run, one org
 *   NODE_ENV=development node src/scripts/001-backfill-product-variants.js --apply                # write, all orgs
 *   NODE_ENV=development node src/scripts/001-backfill-product-variants.js --apply --org=<id> --batchSize=200
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const config = require('../config/config');
const logger = require('../config/logger');
const { Product, ProductVariant, Inventory, Imei, SerialNumber } = require('../models');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const orgArg = args.find((a) => a.startsWith('--org='));
const organizationId = orgArg ? orgArg.split('=')[1] : null;
const batchSizeArg = args.find((a) => a.startsWith('--batchSize='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1], 10) : 500;

async function backfillOne(product) {
  // Step 1: find-or-create the default variant (resumable).
  let variant = await ProductVariant.findOne({ productId: product._id, isDefault: true });
  if (!variant) {
    variant = await ProductVariant.create({
      organizationId: product.organizationId,
      branchId: product.branchId,
      productId: product._id,
      isDefault: true,
      sku: product.sku || undefined,
      attributes: {},
      price: product.price,
      cost: product.cost,
      unit: product.unit,
      trackSerial: !!product.trackImei,
      isActive: true,
    });
  }

  // Step 2: find-or-create the matching Inventory row.
  let inventory = await Inventory.findOne({ variantId: variant._id });
  if (!inventory) {
    inventory = await Inventory.create({
      organizationId: product.organizationId,
      branchId: product.branchId,
      productId: product._id,
      variantId: variant._id,
      quantity: product.stockQuantity,
      averageCost: product.cost,
    });
  }

  // Step 3: shadow-copy IMEI rows into SerialNumber, skipping ones already copied.
  if (product.trackImei) {
    const imeis = await Imei.find({ productId: product._id }).lean();
    for (const imeiDoc of imeis) {
      const exists = await SerialNumber.findOne({
        organizationId: product.organizationId,
        serial: imeiDoc.imei,
      });
      if (exists) continue;
      await SerialNumber.create({
        organizationId: product.organizationId,
        inventoryId: inventory._id,
        variantId: variant._id,
        serial: imeiDoc.imei,
        secondarySerial: imeiDoc.imei2 || '',
        status: imeiDoc.status,
        purchaseId: imeiDoc.purchaseId || undefined,
        invoiceId: imeiDoc.invoiceId || undefined,
        warrantyMonths: imeiDoc.warrantyMonths || 0,
        warrantyEndDate: imeiDoc.warrantyEndDate || undefined,
      });
    }
  }

  // Step 4: verify before flipping schemaVersion.
  const fresh = await Inventory.findById(inventory._id);
  if (fresh.quantity !== product.stockQuantity) {
    logger.warn(
      `[001-backfill] Product ${product._id}: Inventory.quantity (${fresh.quantity}) !== ` +
        `Product.stockQuantity (${product.stockQuantity}) — leaving schemaVersion untouched, will retry next run.`
    );
    return 'mismatch';
  }

  await Product.updateOne({ _id: product._id }, { $set: { schemaVersion: 2 } });
  return 'migrated';
}

async function run() {
  try {
    await mongoose.connect(config.mongoose.url, config.mongoose.options);
    logger.info('[001-backfill] Connected to MongoDB');
    logger.info(`[001-backfill] mode=${apply ? 'APPLY' : 'DRY-RUN'} org=${organizationId || 'ALL'} batchSize=${batchSize}`);

    const filter = { schemaVersion: { $ne: 2 } };
    if (organizationId) filter.organizationId = organizationId;

    const totalPending = await Product.countDocuments(filter);
    logger.info(`[001-backfill] ${totalPending} product(s) pending migration`);

    if (!apply) {
      logger.info('[001-backfill] Dry-run only — pass --apply to write changes. No data was modified.');
      return;
    }

    let migrated = 0;
    let mismatched = 0;
    let processed = 0;

    // Cursor-based, batched so this can run against a live, traffic-serving database.
    const cursor = Product.find(filter).cursor();
    let batch = [];
    const flush = async () => {
      for (const product of batch) {
        const result = await backfillOne(product);
        if (result === 'migrated') migrated++;
        else mismatched++;
        processed++;
      }
      logger.info(`[001-backfill] Progress: ${processed}/${totalPending} (migrated=${migrated}, mismatched=${mismatched})`);
      batch = [];
    };

    for await (const product of cursor) {
      batch.push(product);
      if (batch.length >= batchSize) {
        await flush();
      }
    }
    if (batch.length) await flush();

    logger.info(`[001-backfill] Done. migrated=${migrated} mismatched=${mismatched} (mismatched products will be retried on next run)`);
  } catch (err) {
    logger.error('[001-backfill] Migration failed:', err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

run();
