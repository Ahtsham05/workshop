/**
 * One-off (re-runnable) reconciliation for the default-variant stock drift bug:
 * batch/expiry-tracked simple products (hasVariants=false) deduct/restore stock on
 * Inventory.quantity via batch.service.js/inventory.service.js, but until this fix
 * that never mirrored back onto Product.stockQuantity — the field every legacy read
 * path (Products List, low/critical-stock widgets, dashboard) still treats as
 * authoritative for non-hasVariants products. Going forward the write paths keep the
 * two in sync; this script corrects any drift that already accumulated before the fix.
 *
 * Usage:
 *   node server/scripts/reconcile-default-variant-stock.js            (dry run, reports only)
 *   node server/scripts/reconcile-default-variant-stock.js --apply    (writes corrections)
 */
const mongoose = require('mongoose');
const path = require('path');
const config = require(path.join(__dirname, '../src/config/config'));
const { Product, ProductVariant, Inventory } = require(path.join(__dirname, '../src/models'));

const apply = process.argv.includes('--apply');

const run = async () => {
  await mongoose.connect(config.mongoose.url, config.mongoose.options);
  console.log(`Connected. Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);

  const trackedDefaultVariants = await ProductVariant.find({
    isDefault: true,
    $or: [{ trackBatch: true }, { trackExpiry: true }],
  }).lean();

  console.log(`Found ${trackedDefaultVariants.length} batch/expiry-tracked default variant(s).`);

  let mismatches = 0;
  let fixed = 0;

  for (const variant of trackedDefaultVariants) {
    const [product, inventory] = await Promise.all([
      Product.findById(variant.productId),
      Inventory.findOne({ variantId: variant._id }),
    ]);

    if (!product || !inventory) {
      console.log(`  SKIP variant ${variant._id}: missing ${!product ? 'product' : 'inventory'} doc`);
      continue;
    }

    if (Number(product.stockQuantity) === Number(inventory.quantity)) continue;

    mismatches += 1;
    console.log(
      `  MISMATCH product "${product.name}" (${product._id}): Product.stockQuantity=${product.stockQuantity} vs Inventory.quantity=${inventory.quantity}`
    );

    if (apply) {
      await Product.updateOne({ _id: product._id }, { $set: { stockQuantity: inventory.quantity } });
      fixed += 1;
    }
  }

  console.log(`\nDone. ${mismatches} mismatch(es) found${apply ? `, ${fixed} fixed.` : '. Re-run with --apply to fix.'}`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
