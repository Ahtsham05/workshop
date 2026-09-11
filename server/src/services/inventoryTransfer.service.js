const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { Product, Branch, ProductVariant, Inventory, Batch, InventoryTransaction, InventoryTransfer, Imei, User } = require('../models');
const inventorySyncService = require('./inventorySync.service');
const { matchesEitherImei, collectImeiNumbers } = require('./imei.service');
const masterProductService = require('./masterProduct.service');
const { findBestMatch } = require('../utils/productMatchKey');

/**
 * Generates a human-readable, org-scoped, gap-tolerant transfer number ("TRF-1001",
 * "TRF-1002", ...) via an atomic counter in the shared `_sequences` collection — the same
 * pattern purchaseOrder.service.js#generateOrderNumber uses for order numbers, chosen over
 * Invoice's max+1-then-retry scheme because a bulk transfer can mint several numbers per
 * request, which is exactly the high-concurrency case that scheme is weakest at.
 */
const generateTransferNumber = async (organizationId) => {
  if (!organizationId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Organization is required to create a transfer');
  }

  const db = mongoose.connection.db;
  const seqKey = `inventoryTransfer_${organizationId}`;

  const existingCounter = await db.collection('_sequences').findOne({ _id: seqKey });
  if (!existingCounter) {
    const transfers = await InventoryTransfer.find({ organizationId, transferNumber: { $exists: true } })
      .select('transferNumber')
      .lean();
    let maxSeq = 1000;
    for (const tr of transfers) {
      const n = parseInt(String(tr.transferNumber || '').replace('TRF-', ''), 10);
      if (Number.isFinite(n)) maxSeq = Math.max(maxSeq, n);
    }
    await db.collection('_sequences').updateOne({ _id: seqKey }, { $setOnInsert: { seq: maxSeq } }, { upsert: true });
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await db.collection('_sequences').findOneAndUpdate(
      { _id: seqKey },
      { $inc: { seq: 1 } },
      { returnDocument: 'after' }
    );
    const seq = Number(result?.seq ?? result?.value?.seq);
    if (!Number.isFinite(seq) || seq <= 0) continue;

    const candidate = `TRF-${seq}`;
    const exists = await InventoryTransfer.exists({ organizationId, transferNumber: candidate });
    if (!exists) return candidate;
  }

  return `TRF-${Date.now()}`;
};

/**
 * Products are branch-scoped documents (no shared catalog id across branches), so
 * the destination branch may not yet carry the item being transferred. Find a match by
 * barcode first — authoritative, exactly like a real scan (productMatchKey.js#findBestMatch)
 * — falling back to a case-insensitive exact name match only when there's no barcode, or
 * nothing at the destination carries it yet; if neither exists, spin up a new Product doc
 * for the destination branch with zero stock so the transfer has somewhere to land.
 * Barcode/SKU uniqueness is enforced per (organizationId, branchId) — see
 * product.model.js — not globally, so the same physical item's barcode is copied onto
 * the new doc too: it's the same barcode printed on the same box, and scanning it at the
 * destination branch should find this product, not come up empty.
 */
const findOrCreateDestinationProduct = async ({ sourceProduct, organizationId, toBranchId, session }) => {
  // Master Product Catalog migration (see docs/architecture/master-product-migration.md):
  // an exact masterProductId match is strictly more reliable than the barcode/name
  // heuristic below, but stays gated per-org during rollout like every other
  // behavior-changing use of masterProductId.
  if (sourceProduct.masterProductId && masterProductService.isMasterProductRolloutEnabledForOrg(organizationId)) {
    const existingByMaster = await Product.findOne({ organizationId, branchId: toBranchId, masterProductId: sourceProduct.masterProductId }).session(session || null);
    if (existingByMaster) return existingByMaster;
  }

  const existing = await findBestMatch({ Model: Product, scope: { organizationId, branchId: toBranchId }, product: sourceProduct, session });
  if (existing) {
    // Heals a destination product created by an earlier transfer before trackImei/
    // trackSerial were copied below — without them, units landing here show up as plain
    // untracked stock (no Serial #/IMEI badge anywhere) even though the source product,
    // and the actual Imei records now pointing at this product, are tracked. Only ever
    // turns tracking *on* to match the source, never off, so this can't silently undo a
    // deliberate per-branch choice to stop tracking. Also backfills masterProductId for a
    // destination product created before the master-catalog migration ran.
    // Also backfills barcode/taxCategoryId onto a destination product created by an
    // earlier transfer before this fix copied them — a barcode is only ever ADDED here,
    // never overwritten, so it can't collide with one the destination branch staff
    // deliberately entered by hand in the meantime (existing.barcode already wins).
    const needsHeal =
      (sourceProduct.trackImei && !existing.trackImei) ||
      (sourceProduct.trackSerial && !existing.trackSerial) ||
      (sourceProduct.warrantyMonths && !existing.warrantyMonths) ||
      (sourceProduct.masterProductId && !existing.masterProductId) ||
      (sourceProduct.barcode && !existing.barcode) ||
      (sourceProduct.taxCategoryId && !existing.taxCategoryId);
    if (needsHeal) {
      existing.trackImei = existing.trackImei || sourceProduct.trackImei;
      existing.trackSerial = existing.trackSerial || sourceProduct.trackSerial;
      existing.warrantyMonths = existing.warrantyMonths || sourceProduct.warrantyMonths;
      existing.masterProductId = existing.masterProductId || sourceProduct.masterProductId;
      existing.barcode = existing.barcode || sourceProduct.barcode;
      existing.taxCategoryId = existing.taxCategoryId || sourceProduct.taxCategoryId;
      await existing.save({ session });
    }
    return existing;
  }

  const [created] = await Product.create(
    [{
      organizationId,
      branchId: toBranchId,
      createdBy: sourceProduct.createdBy,
      name: sourceProduct.name,
      nameUrdu: sourceProduct.nameUrdu,
      description: sourceProduct.description,
      barcode: sourceProduct.barcode || undefined,
      price: sourceProduct.price,
      cost: sourceProduct.cost,
      taxCategoryId: sourceProduct.taxCategoryId,
      stockQuantity: 0,
      unit: sourceProduct.unit,
      sku: sourceProduct.sku,
      category: sourceProduct.category,
      categories: sourceProduct.categories,
      subCategories: sourceProduct.subCategories,
      tags: sourceProduct.tags,
      color: sourceProduct.color,
      unitConversions: sourceProduct.unitConversions,
      supplier: sourceProduct.supplier,
      brandId: sourceProduct.brandId,
      image: sourceProduct.image,
      hasVariants: sourceProduct.hasVariants,
      schemaVersion: sourceProduct.schemaVersion,
      trackImei: sourceProduct.trackImei,
      trackSerial: sourceProduct.trackSerial,
      warrantyMonths: sourceProduct.warrantyMonths,
      masterProductId: sourceProduct.masterProductId || undefined,
    }],
    { session }
  );
  return created;
};

/**
 * Real (non-default) variants are matched across branches by sku, falling back to an
 * exact attribute-map match. Barcode/SKU uniqueness is per (organizationId, branchId) —
 * same as Product — so the source variant's barcode is copied onto the destination
 * variant too instead of being dropped.
 */
const findOrCreateDestinationVariant = async ({ sourceVariant, toProduct, organizationId, toBranchId, session }) => {
  if (sourceVariant.isDefault) {
    const existingDefault = await ProductVariant.findOne({ productId: toProduct._id, isDefault: true }).session(session || null);
    if (existingDefault) return existingDefault;
    const [created] = await ProductVariant.create(
      [{
        organizationId,
        branchId: toBranchId,
        productId: toProduct._id,
        isDefault: true,
        sku: sourceVariant.sku,
        barcode: sourceVariant.barcode || undefined,
        attributes: {},
        price: sourceVariant.price,
        cost: sourceVariant.cost,
        taxCategoryId: sourceVariant.taxCategoryId,
        unit: sourceVariant.unit,
        trackBatch: sourceVariant.trackBatch,
        trackExpiry: sourceVariant.trackExpiry,
        trackSerial: sourceVariant.trackSerial,
        isActive: true,
      }],
      { session }
    );
    return created;
  }

  if (sourceVariant.masterVariantId && masterProductService.isMasterProductRolloutEnabledForOrg(organizationId)) {
    const existingByMaster = await ProductVariant.findOne({ productId: toProduct._id, masterVariantId: sourceVariant.masterVariantId }).session(session || null);
    if (existingByMaster) return existingByMaster;
  }

  const candidates = await ProductVariant.find({ productId: toProduct._id, isDefault: false }).session(session || null);
  const sourceAttrs = JSON.stringify(Object.fromEntries(sourceVariant.attributes || []));
  const match =
    (sourceVariant.sku && candidates.find((v) => v.sku === sourceVariant.sku)) ||
    candidates.find((v) => JSON.stringify(Object.fromEntries(v.attributes || [])) === sourceAttrs);
  if (match) {
    if (sourceVariant.masterVariantId && !match.masterVariantId) {
      match.masterVariantId = sourceVariant.masterVariantId;
      await match.save({ session });
    }
    return match;
  }

  const [created] = await ProductVariant.create(
    [{
      organizationId,
      branchId: toBranchId,
      productId: toProduct._id,
      isDefault: false,
      sku: sourceVariant.sku,
      barcode: sourceVariant.barcode || undefined,
      attributes: sourceVariant.attributes,
      price: sourceVariant.price,
      cost: sourceVariant.cost,
      taxCategoryId: sourceVariant.taxCategoryId,
      unit: sourceVariant.unit,
      trackBatch: sourceVariant.trackBatch,
      trackExpiry: sourceVariant.trackExpiry,
      trackSerial: sourceVariant.trackSerial,
      image: sourceVariant.image,
      isActive: true,
      masterVariantId: sourceVariant.masterVariantId || undefined,
    }],
    { session }
  );
  return created;
};

const findOrCreateInventory = async ({ variant, organizationId, branchId, session }) => {
  const existing = await Inventory.findOne({ variantId: variant._id }).session(session || null);
  if (existing) return existing;
  const [created] = await Inventory.create(
    [{
      organizationId,
      branchId,
      productId: variant.productId,
      variantId: variant._id,
      quantity: 0,
      averageCost: variant.cost,
    }],
    { session }
  );
  return created;
};

/**
 * Resolves the source side of an IMEI/serial-tracked transfer — a specific, named set
 * of in-stock units at the source branch, rather than a bulk number. Each unit still
 * ultimately backs the same Product.stockQuantity/Inventory.quantity ledger as a bulk
 * transfer (see applySerializedSourceDelta) — only *which* units back that count
 * differs, and that identity has to be tracked so the destination branch receives the
 * exact same physical units (with their own history/warranty) instead of an
 * indistinguishable quantity bump.
 */
const resolveSerializedSource = async ({ organizationId, fromBranchId, fromProduct, fromVariantId, imeis, session }) => {
  if (!imeis || imeis.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Select at least one IMEI/serial number to transfer');
  }
  const normalized = [...new Set(imeis.map((n) => String(n).trim()).filter(Boolean))];

  const records = await Imei.find({
    organizationId,
    branchId: fromBranchId,
    productId: fromProduct._id,
    ...matchesEitherImei(normalized),
    status: 'in_stock',
  }).session(session || null);
  if (records.length !== normalized.length) {
    const found = collectImeiNumbers(records);
    const missing = normalized.filter((n) => !found.has(n));
    throw new ApiError(httpStatus.BAD_REQUEST, `Not available for transfer: ${missing.join(', ')}`);
  }

  // Imei records aren't linked to a variant directly (see imei.model.js) — this is only
  // needed to route the numeric ledger through Inventory instead of Product.stockQuantity
  // when the product has real variants, same as the bulk path.
  const fromVariant = fromVariantId ? await ProductVariant.findOne({ _id: fromVariantId, organizationId }).session(session || null) : null;
  if (fromVariantId && !fromVariant) throw new ApiError(httpStatus.NOT_FOUND, 'Variant not found in the source branch');

  return { kind: 'serialized', fromProduct, fromVariant, imeiRecords: records, available: records.length };
};

/**
 * Resolves what's actually being moved — a plain product (legacy Product.stockQuantity),
 * a real/tracked variant (Inventory-backed), a specific batch within one, or (for
 * IMEI/serial-tracked products) a named set of individual units — and how much of it is
 * available at the source. See docs/architecture/universal-product-migration.md.
 */
const resolveSource = async ({ organizationId, fromBranchId, fromProductId, fromVariantId, fromBatchId, imeis, session }) => {
  const fromProduct = await Product.findOne({ _id: fromProductId, organizationId, branchId: fromBranchId }).session(session || null);
  if (!fromProduct) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found in the source branch');

  if (fromProduct.trackImei || fromProduct.trackSerial) {
    return resolveSerializedSource({ organizationId, fromBranchId, fromProduct, fromVariantId, imeis, session });
  }

  if (!fromVariantId) {
    return { kind: 'product', fromProduct, available: fromProduct.stockQuantity };
  }

  const fromVariant = await ProductVariant.findOne({ _id: fromVariantId, organizationId }).session(session || null);
  if (!fromVariant) throw new ApiError(httpStatus.NOT_FOUND, 'Variant not found in the source branch');

  if (fromBatchId) {
    const fromBatch = await Batch.findOne({ _id: fromBatchId, organizationId }).session(session || null);
    if (!fromBatch) throw new ApiError(httpStatus.NOT_FOUND, 'Batch not found');
    return { kind: 'batch', fromProduct, fromVariant, fromBatch, available: fromBatch.quantity };
  }

  const inventory = await Inventory.findOne({ variantId: fromVariant._id }).session(session || null);
  return { kind: 'variant', fromProduct, fromVariant, available: inventory?.quantity || 0 };
};

/**
 * Applies a signed stock change at the source location for whatever resolveSource()
 * found — negative `delta` debits it (normal transfer-out), positive `delta` credits
 * it back (cancelling a transfer that already left the branch). The ledger entry type
 * follows the sign so reversals are never mislabeled as outbound transfers.
 */
const applySourceDelta = async (source, { organizationId, delta, refId, createdBy, session }) => {
  const type = delta < 0 ? 'transfer_out' : 'transfer_in';

  if (source.kind === 'product') {
    source.fromProduct.stockQuantity += delta;
    await source.fromProduct.save({ session });
    await inventorySyncService.recordStockChange({
      organizationId,
      productId: source.fromProduct._id,
      quantityDelta: delta,
      type,
      refType: 'InventoryTransfer',
      refId,
      createdBy,
    });
    return;
  }

  const inventory = await Inventory.findOne({ variantId: source.fromVariant._id }).session(session || null);
  const updatedInventory = await Inventory.findOneAndUpdate(
    { _id: inventory._id },
    { $inc: { quantity: delta } },
    { new: true, session }
  );

  if (source.kind === 'batch') {
    const nextQty = source.fromBatch.quantity + delta;
    // $inc and a plain field can't share one update document (MongoDB rejects a mix of
    // operator and non-operator keys) — status must go through $set alongside it.
    await Batch.updateOne(
      { _id: source.fromBatch._id },
      { $inc: { quantity: delta }, $set: { status: nextQty <= 0 ? 'depleted' : 'active' } },
      { session }
    );
  }

  await InventoryTransaction.create(
    [{
      organizationId,
      branchId: source.fromVariant.branchId,
      inventoryId: inventory._id,
      variantId: source.fromVariant._id,
      type,
      quantityDelta: delta,
      balanceAfter: updatedInventory.quantity,
      refType: 'InventoryTransfer',
      refId,
      createdBy,
    }],
    { session }
  );

  // A simple product's hidden default variant (batch/expiry tracking on) keeps
  // Inventory authoritative at the source branch, but Product.stockQuantity must still
  // mirror it for the legacy read paths (Products List, low-stock widgets, dashboard).
  if (source.fromVariant.isDefault) {
    await Product.findByIdAndUpdate(source.fromProduct._id, { $inc: { stockQuantity: delta } }, { session });
  }
};

/**
 * Same numeric ledger writes as applySourceDelta (Product.stockQuantity or
 * Inventory.quantity, whichever backs this product), plus flips the specific IMEI
 * records' status so they can't be picked for a sale — or another transfer — anywhere
 * while they're mid-transfer. `toStatus` is 'in_transit' when stock is leaving the
 * source (create/approve) or 'in_stock' when a transfer is cancelled and the units
 * never actually left (they're still physically at the source branch).
 */
const applySerializedSourceDelta = async (source, { organizationId, delta, refId, createdBy, toStatus, session }) => {
  const type = delta < 0 ? 'transfer_out' : 'transfer_in';

  if (source.fromVariant) {
    const inventory = await Inventory.findOne({ variantId: source.fromVariant._id }).session(session || null);
    const updatedInventory = await Inventory.findOneAndUpdate(
      { _id: inventory._id },
      { $inc: { quantity: delta } },
      { new: true, session }
    );
    await InventoryTransaction.create(
      [{
        organizationId,
        branchId: source.fromVariant.branchId,
        inventoryId: inventory._id,
        variantId: source.fromVariant._id,
        type,
        quantityDelta: delta,
        balanceAfter: updatedInventory.quantity,
        refType: 'InventoryTransfer',
        refId,
        createdBy,
      }],
      { session }
    );
    if (source.fromVariant.isDefault) {
      await Product.findByIdAndUpdate(source.fromProduct._id, { $inc: { stockQuantity: delta } }, { session });
    }
  } else {
    await Product.findByIdAndUpdate(source.fromProduct._id, { $inc: { stockQuantity: delta } }, { session });
    await inventorySyncService.recordStockChange({
      organizationId,
      productId: source.fromProduct._id,
      quantityDelta: delta,
      type,
      refType: 'InventoryTransfer',
      refId,
      createdBy,
    });
  }

  await Imei.updateMany(
    { _id: { $in: source.imeiRecords.map((r) => r._id) } },
    {
      $set: { status: toStatus, transferId: toStatus === 'in_transit' ? refId : null },
      $push: {
        history: {
          status: toStatus,
          at: new Date(),
          note: toStatus === 'in_transit' ? 'Left branch on inventory transfer' : 'Inventory transfer cancelled',
          byUserId: createdBy || null,
        },
      },
    },
    { session }
  );
};

/** Resolves (find-or-create) the destination product/variant for a transfer's source. */
const resolveDestination = async (source, { organizationId, toBranchId, session }) => {
  const toProduct = await findOrCreateDestinationProduct({ sourceProduct: source.fromProduct, organizationId, toBranchId, session });
  if (!source.fromVariant) return { toProduct, toVariant: null };

  const toVariant = await findOrCreateDestinationVariant({
    sourceVariant: source.fromVariant,
    toProduct,
    organizationId,
    toBranchId,
    session,
  });
  return { toProduct, toVariant };
};

/** Credits stock at the destination once a transfer is received, logging the ledger. */
const creditDestination = async (transfer, { organizationId, createdBy }) => {
  const toProduct = await Product.findOne({ _id: transfer.toProductId, organizationId });
  if (!toProduct) throw new ApiError(httpStatus.NOT_FOUND, 'Destination product no longer exists');

  if (!transfer.toVariantId) {
    toProduct.stockQuantity += transfer.quantity;
    await toProduct.save();
    await inventorySyncService.recordStockChange({
      organizationId,
      productId: toProduct._id,
      quantityDelta: transfer.quantity,
      type: 'transfer_in',
      refType: 'InventoryTransfer',
      refId: transfer._id,
      createdBy,
    });
    return;
  }

  const toVariant = await ProductVariant.findOne({ _id: transfer.toVariantId, organizationId });
  if (!toVariant) throw new ApiError(httpStatus.NOT_FOUND, 'Destination variant no longer exists');
  const inventory = await findOrCreateInventory({ variant: toVariant, organizationId, branchId: transfer.toBranchId });

  if (transfer.batchSnapshot?.batchNumber) {
    const existingBatch = await Batch.findOne({
      inventoryId: inventory._id,
      batchNumber: transfer.batchSnapshot.batchNumber,
      status: 'active',
    });
    if (existingBatch) {
      await Batch.updateOne({ _id: existingBatch._id }, { $inc: { quantity: transfer.quantity } });
    } else {
      await Batch.create({
        organizationId,
        inventoryId: inventory._id,
        batchNumber: transfer.batchSnapshot.batchNumber,
        quantity: transfer.quantity,
        costPerUnit: transfer.batchSnapshot.costPerUnit ?? toVariant.cost,
        sellingPrice: transfer.batchSnapshot.sellingPrice,
        expiryDate: transfer.batchSnapshot.expiryDate,
        status: 'active',
      });
    }
  }

  const updatedInventory = await Inventory.findOneAndUpdate(
    { _id: inventory._id },
    { $inc: { quantity: transfer.quantity } },
    { new: true }
  );

  await InventoryTransaction.create({
    organizationId,
    branchId: transfer.toBranchId,
    inventoryId: inventory._id,
    variantId: toVariant._id,
    type: 'transfer_in',
    quantityDelta: transfer.quantity,
    balanceAfter: updatedInventory.quantity,
    refType: 'InventoryTransfer',
    refId: transfer._id,
    createdBy,
  });

  if (toVariant.isDefault) {
    await Product.findByIdAndUpdate(toProduct._id, { $inc: { stockQuantity: transfer.quantity } });
  }
};

/**
 * Same ledger writes as creditDestination, plus re-homes the specific IMEI records that
 * were mid-transfer (found by transferId, set when they left the source — see
 * applySerializedSourceDelta) onto the destination product/variant/batch/branch, and
 * flips them back to 'in_stock'. The units keep their own history/warranty/customer
 * fields untouched — only where they live changes.
 */
const creditSerializedDestination = async (transfer, { organizationId, createdBy }) => {
  const toProduct = await Product.findOne({ _id: transfer.toProductId, organizationId });
  if (!toProduct) throw new ApiError(httpStatus.NOT_FOUND, 'Destination product no longer exists');

  let toVariant = null;
  let inventory = null;
  if (transfer.toVariantId) {
    toVariant = await ProductVariant.findOne({ _id: transfer.toVariantId, organizationId });
    if (!toVariant) throw new ApiError(httpStatus.NOT_FOUND, 'Destination variant no longer exists');
    inventory = await findOrCreateInventory({ variant: toVariant, organizationId, branchId: transfer.toBranchId });
  }

  // The source batch itself lives at the source branch — find-or-create an equivalent
  // one here by batch number, same as the bulk path, so the units land in a batch that
  // actually belongs to this branch.
  let destBatchId = null;
  if (transfer.batchSnapshot?.batchNumber && inventory) {
    const existingBatch = await Batch.findOne({
      inventoryId: inventory._id,
      batchNumber: transfer.batchSnapshot.batchNumber,
      status: 'active',
    });
    if (existingBatch) {
      destBatchId = existingBatch._id;
      await Batch.updateOne({ _id: existingBatch._id }, { $inc: { quantity: transfer.quantity } });
    } else {
      const createdBatch = await Batch.create({
        organizationId,
        inventoryId: inventory._id,
        batchNumber: transfer.batchSnapshot.batchNumber,
        quantity: transfer.quantity,
        costPerUnit: transfer.batchSnapshot.costPerUnit ?? toVariant?.cost,
        sellingPrice: transfer.batchSnapshot.sellingPrice,
        expiryDate: transfer.batchSnapshot.expiryDate,
        status: 'active',
      });
      destBatchId = createdBatch._id;
    }
  }

  if (inventory) {
    const updatedInventory = await Inventory.findOneAndUpdate(
      { _id: inventory._id },
      { $inc: { quantity: transfer.quantity } },
      { new: true }
    );
    await InventoryTransaction.create({
      organizationId,
      branchId: transfer.toBranchId,
      inventoryId: inventory._id,
      variantId: toVariant._id,
      type: 'transfer_in',
      quantityDelta: transfer.quantity,
      balanceAfter: updatedInventory.quantity,
      refType: 'InventoryTransfer',
      refId: transfer._id,
      createdBy,
    });
    if (toVariant.isDefault) {
      await Product.findByIdAndUpdate(toProduct._id, { $inc: { stockQuantity: transfer.quantity } });
    }
  } else {
    toProduct.stockQuantity += transfer.quantity;
    await toProduct.save();
    await inventorySyncService.recordStockChange({
      organizationId,
      productId: toProduct._id,
      quantityDelta: transfer.quantity,
      type: 'transfer_in',
      refType: 'InventoryTransfer',
      refId: transfer._id,
      createdBy,
    });
  }

  await Imei.updateMany(
    { transferId: transfer._id, status: 'in_transit' },
    {
      $set: {
        status: 'in_stock',
        productId: toProduct._id,
        branchId: transfer.toBranchId,
        batchId: destBatchId,
        transferId: null,
      },
      $push: {
        history: {
          status: 'in_stock',
          at: new Date(),
          note: 'Received at destination branch via inventory transfer',
          byUserId: createdBy || null,
        },
      },
    },
  );
};

/**
 * Creates a transfer and immediately decrements the source branch's stock — the
 * goods are considered "in transit" the moment the sender confirms the handoff.
 * Destination stock is only credited once the receiving branch confirms receipt
 * (see completeTransfer), so on-hand totals never double-count stock that's
 * physically between two locations.
 */
const createTransfer = async ({
  organizationId,
  fromBranchId,
  fromProductId,
  fromVariantId,
  fromBatchId,
  toBranchId,
  quantity,
  imeis,
  reason,
  notes,
  createdBy,
}) => {
  if (String(fromBranchId) === String(toBranchId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Source and destination branch must be different');
  }

  const toBranch = await Branch.findOne({ _id: toBranchId, organizationId });
  if (!toBranch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Destination branch not found');
  }

  const source = await resolveSource({ organizationId, fromBranchId, fromProductId, fromVariantId, fromBatchId, imeis });
  const effectiveQuantity = source.kind === 'serialized' ? source.imeiRecords.length : quantity;
  if (!effectiveQuantity) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Quantity is required');
  }
  if (source.available < effectiveQuantity) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Insufficient stock: only ${source.available} unit(s) available`);
  }

  const { toProduct, toVariant } = await resolveDestination(source, { organizationId, toBranchId });

  const transfer = await InventoryTransfer.create({
    organizationId,
    // Every transfer — single or bulk — gets its own group so the list/detail/print
    // surfaces can treat a "New Transfer" the same way as a one-line bulk transfer.
    groupId: new mongoose.Types.ObjectId(),
    transferNumber: await generateTransferNumber(organizationId),
    fromBranchId,
    toBranchId,
    fromProductId: source.fromProduct._id,
    toProductId: toProduct._id,
    fromVariantId: source.fromVariant?._id,
    toVariantId: toVariant?._id,
    productName: source.fromVariant ? `${source.fromProduct.name}${source.fromVariant.isDefault ? '' : ` — ${source.fromVariant.sku || ''}`}` : source.fromProduct.name,
    batchSnapshot: source.fromBatch
      ? {
          batchId: source.fromBatch._id,
          batchNumber: source.fromBatch.batchNumber,
          costPerUnit: source.fromBatch.costPerUnit,
          sellingPrice: source.fromBatch.sellingPrice,
          expiryDate: source.fromBatch.expiryDate,
        }
      : undefined,
    quantity: effectiveQuantity,
    imeis: source.kind === 'serialized' ? source.imeiRecords.map((r) => r.imei) : undefined,
    reason,
    notes,
    status: 'in_transit',
    decidedBy: createdBy,
    decidedAt: new Date(),
  });

  if (source.kind === 'serialized') {
    await applySerializedSourceDelta(source, {
      organizationId,
      delta: -effectiveQuantity,
      refId: transfer._id,
      createdBy,
      toStatus: 'in_transit',
    });
  } else {
    await applySourceDelta(source, { organizationId, delta: -effectiveQuantity, refId: transfer._id, createdBy });
  }

  return transfer;
};

/**
 * Creates a multi-product ("bulk") transfer — one InventoryTransfer document per line
 * item, all stamped with the same groupId/transferNumber so they display, print, and
 * mostly get acted on together (see getTransferGroup/queryTransfers below), but wrapped
 * in a single Mongo transaction so the whole submission is all-or-nothing: if line 5 of 8
 * fails stock validation, none of the previous 4 debits are left standing either. Receipt
 * and cancellation stay per-line (the existing completeTransfer/cancelTransfer, unchanged)
 * since a destination branch may reasonably receive some products before others.
 */
const createBulkTransfer = async ({ organizationId, fromBranchId, toBranchId, items, reason, notes, createdBy }) => {
  if (String(fromBranchId) === String(toBranchId)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Source and destination branch must be different');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Add at least one product to transfer');
  }

  const toBranch = await Branch.findOne({ _id: toBranchId, organizationId });
  if (!toBranch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Destination branch not found');
  }

  // Defense in depth against duplicate lines — the UI merges same-product rows on add,
  // this just guarantees a stale/hand-built request can't silently double-debit a product.
  // Serialized (IMEI/serial) lines are exempt: each unit can only be picked once anywhere
  // in the app, so two lines for the same product can never actually name the same units.
  const seen = new Set();
  for (const item of items) {
    if (item.imeis && item.imeis.length > 0) continue;
    const key = `${item.fromProductId}:${item.fromVariantId || ''}:${item.fromBatchId || ''}`;
    if (seen.has(key)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'The same product appears more than once in this transfer — combine it into a single line');
    }
    seen.add(key);
  }

  const groupId = new mongoose.Types.ObjectId();
  const transferNumber = await generateTransferNumber(organizationId);

  const session = await mongoose.startSession();
  let createdTransfers = [];
  try {
    await session.withTransaction(async () => {
      // withTransaction retries this whole callback on a transient commit error, so any
      // side effect outside the transaction must be idempotent across retries — a plain
      // reassignment at the end (not a running .push() across attempts) keeps a retried
      // run from leaving stale entries from the earlier, rolled-back attempt.
      const attemptTransfers = [];
      // Sequential, not Promise.all — a ClientSession can't run concurrent operations.
      for (const item of items) {
        const source = await resolveSource({
          organizationId,
          fromBranchId,
          fromProductId: item.fromProductId,
          fromVariantId: item.fromVariantId,
          fromBatchId: item.fromBatchId,
          imeis: item.imeis,
          session,
        });
        const effectiveQuantity = source.kind === 'serialized' ? source.imeiRecords.length : item.quantity;
        if (!effectiveQuantity) {
          throw new ApiError(httpStatus.BAD_REQUEST, `Quantity is required for ${source.fromProduct.name}`);
        }
        if (source.available < effectiveQuantity) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `Insufficient stock for ${source.fromProduct.name}: only ${source.available} unit(s) available`
          );
        }

        const { toProduct, toVariant } = await resolveDestination(source, { organizationId, toBranchId, session });

        const [transfer] = await InventoryTransfer.create(
          [{
            organizationId,
            groupId,
            transferNumber,
            fromBranchId,
            toBranchId,
            fromProductId: source.fromProduct._id,
            toProductId: toProduct._id,
            fromVariantId: source.fromVariant?._id,
            toVariantId: toVariant?._id,
            productName: source.fromVariant
              ? `${source.fromProduct.name}${source.fromVariant.isDefault ? '' : ` — ${source.fromVariant.sku || ''}`}`
              : source.fromProduct.name,
            batchSnapshot: source.fromBatch
              ? {
                  batchId: source.fromBatch._id,
                  batchNumber: source.fromBatch.batchNumber,
                  costPerUnit: source.fromBatch.costPerUnit,
                  sellingPrice: source.fromBatch.sellingPrice,
                  expiryDate: source.fromBatch.expiryDate,
                }
              : undefined,
            quantity: effectiveQuantity,
            imeis: source.kind === 'serialized' ? source.imeiRecords.map((r) => r.imei) : undefined,
            reason,
            notes,
            status: 'in_transit',
            decidedBy: createdBy,
            decidedAt: new Date(),
          }],
          { session }
        );

        if (source.kind === 'serialized') {
          await applySerializedSourceDelta(source, {
            organizationId,
            delta: -effectiveQuantity,
            refId: transfer._id,
            createdBy,
            toStatus: 'in_transit',
            session,
          });
        } else {
          await applySourceDelta(source, { organizationId, delta: -effectiveQuantity, refId: transfer._id, createdBy, session });
        }

        attemptTransfers.push(transfer);
      }
      createdTransfers = attemptTransfers;
    });
  } finally {
    await session.endSession();
  }

  return { groupId, transferNumber, items: createdTransfers };
};

/** Accepts a system-generated "suggested" transfer, sending it the same way a manually created one is sent. */
const approveTransfer = async ({ transferId, organizationId, decidedBy }) => {
  const transfer = await InventoryTransfer.findOne({ _id: transferId, organizationId });
  if (!transfer) throw new ApiError(httpStatus.NOT_FOUND, 'Transfer not found');
  if (transfer.status !== 'suggested') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Only suggested transfers can be approved (current status: ${transfer.status})`
    );
  }

  const source = await resolveSource({
    organizationId,
    fromBranchId: transfer.fromBranchId,
    fromProductId: transfer.fromProductId,
    fromVariantId: transfer.fromVariantId,
    fromBatchId: transfer.batchSnapshot?.batchId,
    imeis: transfer.imeis && transfer.imeis.length > 0 ? transfer.imeis : undefined,
  });
  if (source.available < transfer.quantity) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Insufficient stock: only ${source.available} unit(s) available`);
  }

  if (source.kind === 'serialized') {
    await applySerializedSourceDelta(source, {
      organizationId,
      delta: -transfer.quantity,
      refId: transfer._id,
      createdBy: decidedBy,
      toStatus: 'in_transit',
    });
  } else {
    await applySourceDelta(source, { organizationId, delta: -transfer.quantity, refId: transfer._id, createdBy: decidedBy });
  }

  transfer.status = 'in_transit';
  transfer.decidedBy = decidedBy;
  transfer.decidedAt = new Date();
  await transfer.save();

  return transfer;
};

/** Receiving branch confirms the stock arrived — credits destination stock and closes out the transfer. */
const completeTransfer = async ({ transferId, organizationId, completedBy }) => {
  const transfer = await InventoryTransfer.findOne({ _id: transferId, organizationId });
  if (!transfer) throw new ApiError(httpStatus.NOT_FOUND, 'Transfer not found');
  if (transfer.status !== 'in_transit') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Only in-transit transfers can be completed (current status: ${transfer.status})`
    );
  }

  if (transfer.imeis && transfer.imeis.length > 0) {
    await creditSerializedDestination(transfer, { organizationId, createdBy: completedBy });
  } else {
    await creditDestination(transfer, { organizationId, createdBy: completedBy });
  }

  transfer.status = 'completed';
  transfer.completedAt = new Date();
  await transfer.save();

  return transfer;
};

/** Cancels a transfer. If stock already left the source branch (in_transit), it's returned. */
const cancelTransfer = async ({ transferId, organizationId, cancelledBy }) => {
  const transfer = await InventoryTransfer.findOne({ _id: transferId, organizationId });
  if (!transfer) throw new ApiError(httpStatus.NOT_FOUND, 'Transfer not found');
  if (!['suggested', 'approved', 'in_transit'].includes(transfer.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Transfer cannot be cancelled (current status: ${transfer.status})`);
  }

  if (transfer.status === 'in_transit') {
    // Stock already left the source branch — credit it back the same way it was removed.
    // Falls back toward the simpler kind if a variant/batch doc was since deleted, so a
    // cancellation can never get stuck unable to find where to return the stock to.
    const fromProduct = await Product.findOne({ _id: transfer.fromProductId, organizationId });
    const fromVariant = transfer.fromVariantId
      ? await ProductVariant.findOne({ _id: transfer.fromVariantId, organizationId })
      : null;

    if (transfer.imeis && transfer.imeis.length > 0) {
      // The units never actually left — they're 'in_transit' but still sitting at the
      // source branch (see applySerializedSourceDelta) — so this just flips them back.
      const imeiRecords = await Imei.find({ transferId: transfer._id, status: 'in_transit' });
      if (fromProduct && imeiRecords.length > 0) {
        await applySerializedSourceDelta(
          { fromProduct, fromVariant, imeiRecords },
          { organizationId, delta: transfer.quantity, refId: transfer._id, createdBy: cancelledBy, toStatus: 'in_stock' },
        );
      }
    } else {
      const fromBatch =
        fromVariant && transfer.batchSnapshot?.batchId ? await Batch.findOne({ _id: transfer.batchSnapshot.batchId }) : null;

      if (fromProduct) {
        const source = {
          kind: fromBatch ? 'batch' : fromVariant ? 'variant' : 'product',
          fromProduct,
          fromVariant,
          fromBatch,
        };
        await applySourceDelta(source, { organizationId, delta: transfer.quantity, refId: transfer._id, createdBy: cancelledBy });
      }
    }
  }

  transfer.status = 'cancelled';
  transfer.decidedBy = transfer.decidedBy || cancelledBy;
  transfer.decidedAt = transfer.decidedAt || new Date();
  await transfer.save();

  return transfer;
};

const getTransferById = async (transferId, organizationId) => {
  const transfer = await InventoryTransfer.findOne({ _id: transferId, organizationId })
    .populate('fromBranchId', 'name')
    .populate('toBranchId', 'name')
    .populate('decidedBy', 'name');
  if (!transfer) throw new ApiError(httpStatus.NOT_FOUND, 'Transfer not found');
  return transfer;
};

/**
 * Fetches every line item belonging to one bulk (or single) transfer for the detail/print
 * view. Matches by groupId OR by _id so a legacy transfer created before groupId existed —
 * whose effective group key in the list is its own _id, see queryTransfers below — still
 * resolves correctly when the frontend "opens" it.
 */
const getTransferGroup = async (groupId, organizationId) => {
  const items = await InventoryTransfer.find({ organizationId, $or: [{ groupId }, { _id: groupId }] })
    .populate('fromBranchId', 'name')
    .populate('toBranchId', 'name')
    .populate('decidedBy', 'name')
    .sort({ createdAt: 1 });
  if (items.length === 0) throw new ApiError(httpStatus.NOT_FOUND, 'Transfer not found');
  return items;
};

/**
 * Lists transfers for the org, scoped to the caller's active branch by default (either as
 * sender or receiver) unless explicit fromBranchId/toBranchId filters are given, or
 * `direction` narrows it to just outgoing/incoming. Groups line items belonging to the same
 * bulk transfer into a single row (one InventoryTransfer document per product still backs
 * each line — see createBulkTransfer — this just presents them the way an invoice's list
 * shows one row per invoice, not one per line item). A status/search filter narrows which
 * *lines* are included before grouping, so a filtered view of a partially-received bulk
 * transfer can show a smaller item count than the transfer actually has.
 */
const queryTransfers = async (
  { organizationId, branchId, status, direction, fromBranchId, toBranchId, search },
  options
) => {
  const toOid = (id) => (id ? new mongoose.Types.ObjectId(String(id)) : id);

  const match = { organizationId: toOid(organizationId) };
  if (fromBranchId) match.fromBranchId = toOid(fromBranchId);
  if (toBranchId) match.toBranchId = toOid(toBranchId);
  if (!fromBranchId && !toBranchId && branchId) {
    const bOid = toOid(branchId);
    if (direction === 'outgoing') match.fromBranchId = bOid;
    else if (direction === 'incoming') match.toBranchId = bOid;
    else match.$or = [{ fromBranchId: bOid }, { toBranchId: bOid }];
  }
  // System-generated 'suggested' rows (the daily rebalance job — see
  // purchaseSuggestions.service.js#runTransferSuggestionsForOrganization) are a distinct,
  // separate concept from a real in-flight/completed transfer, and the frontend already
  // surfaces the same insight live (not from these rows) via the "Suggested transfers"
  // panel/GET /transfer-suggestions. Excluded here by default so they don't clutter the
  // main list (and can't be "sent" from it — approving one for a serialized product fails
  // anyway, since the suggestion engine only knows a quantity, never which specific units).
  // An explicit ?status=suggested still honors it, e.g. for API/debugging use.
  match.status = status || { $ne: 'suggested' };
  if (search) match.productName = { $regex: search, $options: 'i' };

  const page = Math.max(parseInt(options.page, 10) || 1, 1);
  const limit = Math.max(parseInt(options.limit, 10) || 10, 1);
  const skip = (page - 1) * limit;

  const [sortField, sortDirRaw] = (options.sortBy || 'suggestedAt:desc').split(':');
  const sortStage = { [sortField || 'suggestedAt']: sortDirRaw === 'asc' ? 1 : -1 };

  const pipeline = [
    { $match: match },
    { $addFields: { effectiveGroupId: { $ifNull: ['$groupId', '$_id'] } } },
    { $sort: { suggestedAt: 1 } },
    {
      $group: {
        _id: '$effectiveGroupId',
        transferNumber: { $first: '$transferNumber' },
        fromBranchId: { $first: '$fromBranchId' },
        toBranchId: { $first: '$toBranchId' },
        reason: { $first: '$reason' },
        notes: { $first: '$notes' },
        suggestedAt: { $min: '$suggestedAt' },
        completedAt: { $max: '$completedAt' },
        decidedBy: { $first: '$decidedBy' },
        itemCount: { $sum: 1 },
        totalQuantity: { $sum: '$quantity' },
        productNames: { $push: '$productName' },
        statuses: { $push: '$status' },
        singleItemId: { $first: '$_id' },
        singleItemImeis: { $first: '$imeis' },
      },
    },
    { $sort: sortStage },
    {
      $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ];

  const [agg] = await InventoryTransfer.aggregate(pipeline);
  const totalResults = agg?.metadata?.[0]?.total || 0;
  const rows = agg?.data || [];

  // Manually "populate" branch/user names instead of an aggregation $lookup — cheaper to
  // get right (no risk of guessing a wrong collection name) for the handful of distinct
  // branches/users behind one page of results.
  const branchIds = [...new Set(rows.flatMap((r) => [String(r.fromBranchId), String(r.toBranchId)]).filter(Boolean))];
  const userIds = [...new Set(rows.map((r) => r.decidedBy).filter(Boolean).map(String))];
  const [branches, users] = await Promise.all([
    Branch.find({ _id: { $in: branchIds } }).select('name').lean(),
    User.find({ _id: { $in: userIds } }).select('name').lean(),
  ]);
  const branchMap = new Map(branches.map((b) => [String(b._id), { id: String(b._id), name: b.name }]));
  const userMap = new Map(users.map((u) => [String(u._id), { id: String(u._id), name: u.name }]));

  const results = rows.map((r) => {
    const statuses = r.statuses || [];
    const uniqueStatuses = [...new Set(statuses)];
    const derivedStatus = uniqueStatuses.length === 1 ? uniqueStatuses[0] : 'partial';
    return {
      groupId: String(r._id),
      transferNumber: r.transferNumber || undefined,
      fromBranchId: branchMap.get(String(r.fromBranchId)) || String(r.fromBranchId),
      toBranchId: branchMap.get(String(r.toBranchId)) || String(r.toBranchId),
      itemCount: r.itemCount,
      totalQuantity: r.totalQuantity,
      productNames: r.productNames || [],
      status: derivedStatus,
      reason: r.reason || undefined,
      notes: r.notes || undefined,
      suggestedAt: r.suggestedAt,
      completedAt: r.completedAt || undefined,
      decidedBy: r.decidedBy ? userMap.get(String(r.decidedBy)) || String(r.decidedBy) : undefined,
      // Preserves today's one-click Send/Receive/Cancel in the list row for the common
      // (still fully supported) single-product transfer — a multi-line group routes those
      // actions through the detail dialog instead, since each line can be at a different step.
      singleItemId: r.itemCount === 1 ? String(r.singleItemId) : undefined,
      singleItemImeis: r.itemCount === 1 ? r.singleItemImeis || [] : undefined,
    };
  });

  const totalPages = Math.max(Math.ceil(totalResults / limit), 1);
  return { results, page, limit, totalPages, totalResults };
};

module.exports = {
  createTransfer,
  createBulkTransfer,
  approveTransfer,
  completeTransfer,
  cancelTransfer,
  getTransferById,
  getTransferGroup,
  queryTransfers,
};
