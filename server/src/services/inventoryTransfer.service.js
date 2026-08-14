const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { Product, Branch, ProductVariant, Inventory, Batch, InventoryTransaction, InventoryTransfer, Imei } = require('../models');
const inventorySyncService = require('./inventorySync.service');
const { matchesEitherImei, collectImeiNumbers } = require('./imei.service');
const masterProductService = require('./masterProduct.service');
const { buildMatchQuery } = require('../utils/productMatchKey');

/**
 * Products are branch-scoped documents (no shared catalog id across branches), so
 * the destination branch may not yet carry the item being transferred. Find a match by
 * barcode OR a case-insensitive exact name (productMatchKey.js#buildMatchQuery — not
 * barcode-instead-of-name: since barcode is globally unique, the destination's copy of
 * a barcoded item can never share that barcode, so name must always be tried too or a
 * genuine match gets missed); if neither exists, spin up a new Product doc for the
 * destination branch with zero stock so the transfer has somewhere to land. The barcode
 * is intentionally NOT copied onto that new doc — same global-uniqueness reason.
 */
const findOrCreateDestinationProduct = async ({ sourceProduct, organizationId, toBranchId }) => {
  // Master Product Catalog migration (see docs/architecture/master-product-migration.md):
  // an exact masterProductId match is strictly more reliable than the barcode/name
  // heuristic below, but stays gated per-org during rollout like every other
  // behavior-changing use of masterProductId.
  if (sourceProduct.masterProductId && masterProductService.isMasterProductRolloutEnabledForOrg(organizationId)) {
    const existingByMaster = await Product.findOne({ organizationId, branchId: toBranchId, masterProductId: sourceProduct.masterProductId });
    if (existingByMaster) return existingByMaster;
  }

  const existing = await Product.findOne(buildMatchQuery({ organizationId, branchId: toBranchId }, sourceProduct));
  if (existing) {
    // Heals a destination product created by an earlier transfer before trackImei/
    // trackSerial were copied below — without them, units landing here show up as plain
    // untracked stock (no Serial #/IMEI badge anywhere) even though the source product,
    // and the actual Imei records now pointing at this product, are tracked. Only ever
    // turns tracking *on* to match the source, never off, so this can't silently undo a
    // deliberate per-branch choice to stop tracking. Also backfills masterProductId for a
    // destination product created before the master-catalog migration ran.
    const needsHeal =
      (sourceProduct.trackImei && !existing.trackImei) ||
      (sourceProduct.trackSerial && !existing.trackSerial) ||
      (sourceProduct.warrantyMonths && !existing.warrantyMonths) ||
      (sourceProduct.masterProductId && !existing.masterProductId);
    if (needsHeal) {
      existing.trackImei = existing.trackImei || sourceProduct.trackImei;
      existing.trackSerial = existing.trackSerial || sourceProduct.trackSerial;
      existing.warrantyMonths = existing.warrantyMonths || sourceProduct.warrantyMonths;
      existing.masterProductId = existing.masterProductId || sourceProduct.masterProductId;
      await existing.save();
    }
    return existing;
  }

  return Product.create({
    organizationId,
    branchId: toBranchId,
    createdBy: sourceProduct.createdBy,
    name: sourceProduct.name,
    nameUrdu: sourceProduct.nameUrdu,
    description: sourceProduct.description,
    price: sourceProduct.price,
    cost: sourceProduct.cost,
    stockQuantity: 0,
    unit: sourceProduct.unit,
    sku: sourceProduct.sku,
    category: sourceProduct.category,
    categories: sourceProduct.categories,
    supplier: sourceProduct.supplier,
    brandId: sourceProduct.brandId,
    image: sourceProduct.image,
    hasVariants: sourceProduct.hasVariants,
    schemaVersion: sourceProduct.schemaVersion,
    trackImei: sourceProduct.trackImei,
    trackSerial: sourceProduct.trackSerial,
    warrantyMonths: sourceProduct.warrantyMonths,
    masterProductId: sourceProduct.masterProductId || undefined,
  });
};

/**
 * Real (non-default) variants are matched across branches by sku, falling back to an
 * exact attribute-map match — variants have no barcode-sharing concern here since each
 * one keeps its own barcode unset on the destination side, same as products.
 */
const findOrCreateDestinationVariant = async ({ sourceVariant, toProduct, organizationId, toBranchId }) => {
  if (sourceVariant.isDefault) {
    const existingDefault = await ProductVariant.findOne({ productId: toProduct._id, isDefault: true });
    if (existingDefault) return existingDefault;
    return ProductVariant.create({
      organizationId,
      branchId: toBranchId,
      productId: toProduct._id,
      isDefault: true,
      sku: sourceVariant.sku,
      attributes: {},
      price: sourceVariant.price,
      cost: sourceVariant.cost,
      unit: sourceVariant.unit,
      trackBatch: sourceVariant.trackBatch,
      trackExpiry: sourceVariant.trackExpiry,
      trackSerial: sourceVariant.trackSerial,
      isActive: true,
    });
  }

  if (sourceVariant.masterVariantId && masterProductService.isMasterProductRolloutEnabledForOrg(organizationId)) {
    const existingByMaster = await ProductVariant.findOne({ productId: toProduct._id, masterVariantId: sourceVariant.masterVariantId });
    if (existingByMaster) return existingByMaster;
  }

  const candidates = await ProductVariant.find({ productId: toProduct._id, isDefault: false });
  const sourceAttrs = JSON.stringify(Object.fromEntries(sourceVariant.attributes || []));
  const match =
    (sourceVariant.sku && candidates.find((v) => v.sku === sourceVariant.sku)) ||
    candidates.find((v) => JSON.stringify(Object.fromEntries(v.attributes || [])) === sourceAttrs);
  if (match) {
    if (sourceVariant.masterVariantId && !match.masterVariantId) {
      match.masterVariantId = sourceVariant.masterVariantId;
      await match.save();
    }
    return match;
  }

  return ProductVariant.create({
    organizationId,
    branchId: toBranchId,
    productId: toProduct._id,
    isDefault: false,
    sku: sourceVariant.sku,
    attributes: sourceVariant.attributes,
    price: sourceVariant.price,
    cost: sourceVariant.cost,
    unit: sourceVariant.unit,
    trackBatch: sourceVariant.trackBatch,
    trackExpiry: sourceVariant.trackExpiry,
    trackSerial: sourceVariant.trackSerial,
    image: sourceVariant.image,
    isActive: true,
    masterVariantId: sourceVariant.masterVariantId || undefined,
  });
};

const findOrCreateInventory = async ({ variant, organizationId, branchId }) => {
  const existing = await Inventory.findOne({ variantId: variant._id });
  if (existing) return existing;
  return Inventory.create({
    organizationId,
    branchId,
    productId: variant.productId,
    variantId: variant._id,
    quantity: 0,
    averageCost: variant.cost,
  });
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
const resolveSerializedSource = async ({ organizationId, fromBranchId, fromProduct, fromVariantId, imeis }) => {
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
  });
  if (records.length !== normalized.length) {
    const found = collectImeiNumbers(records);
    const missing = normalized.filter((n) => !found.has(n));
    throw new ApiError(httpStatus.BAD_REQUEST, `Not available for transfer: ${missing.join(', ')}`);
  }

  // Imei records aren't linked to a variant directly (see imei.model.js) — this is only
  // needed to route the numeric ledger through Inventory instead of Product.stockQuantity
  // when the product has real variants, same as the bulk path.
  const fromVariant = fromVariantId ? await ProductVariant.findOne({ _id: fromVariantId, organizationId }) : null;
  if (fromVariantId && !fromVariant) throw new ApiError(httpStatus.NOT_FOUND, 'Variant not found in the source branch');

  return { kind: 'serialized', fromProduct, fromVariant, imeiRecords: records, available: records.length };
};

/**
 * Resolves what's actually being moved — a plain product (legacy Product.stockQuantity),
 * a real/tracked variant (Inventory-backed), a specific batch within one, or (for
 * IMEI/serial-tracked products) a named set of individual units — and how much of it is
 * available at the source. See docs/architecture/universal-product-migration.md.
 */
const resolveSource = async ({ organizationId, fromBranchId, fromProductId, fromVariantId, fromBatchId, imeis }) => {
  const fromProduct = await Product.findOne({ _id: fromProductId, organizationId, branchId: fromBranchId });
  if (!fromProduct) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found in the source branch');

  if (fromProduct.trackImei || fromProduct.trackSerial) {
    return resolveSerializedSource({ organizationId, fromBranchId, fromProduct, fromVariantId, imeis });
  }

  if (!fromVariantId) {
    return { kind: 'product', fromProduct, available: fromProduct.stockQuantity };
  }

  const fromVariant = await ProductVariant.findOne({ _id: fromVariantId, organizationId });
  if (!fromVariant) throw new ApiError(httpStatus.NOT_FOUND, 'Variant not found in the source branch');

  if (fromBatchId) {
    const fromBatch = await Batch.findOne({ _id: fromBatchId, organizationId });
    if (!fromBatch) throw new ApiError(httpStatus.NOT_FOUND, 'Batch not found');
    return { kind: 'batch', fromProduct, fromVariant, fromBatch, available: fromBatch.quantity };
  }

  const inventory = await Inventory.findOne({ variantId: fromVariant._id });
  return { kind: 'variant', fromProduct, fromVariant, available: inventory?.quantity || 0 };
};

/**
 * Applies a signed stock change at the source location for whatever resolveSource()
 * found — negative `delta` debits it (normal transfer-out), positive `delta` credits
 * it back (cancelling a transfer that already left the branch). The ledger entry type
 * follows the sign so reversals are never mislabeled as outbound transfers.
 */
const applySourceDelta = async (source, { organizationId, delta, refId, createdBy }) => {
  const type = delta < 0 ? 'transfer_out' : 'transfer_in';

  if (source.kind === 'product') {
    source.fromProduct.stockQuantity += delta;
    await source.fromProduct.save();
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

  const inventory = await Inventory.findOne({ variantId: source.fromVariant._id });
  const updatedInventory = await Inventory.findOneAndUpdate(
    { _id: inventory._id },
    { $inc: { quantity: delta } },
    { new: true }
  );

  if (source.kind === 'batch') {
    const nextQty = source.fromBatch.quantity + delta;
    await Batch.updateOne(
      { _id: source.fromBatch._id },
      { $inc: { quantity: delta }, status: nextQty <= 0 ? 'depleted' : 'active' }
    );
  }

  await InventoryTransaction.create({
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
  });

  // A simple product's hidden default variant (batch/expiry tracking on) keeps
  // Inventory authoritative at the source branch, but Product.stockQuantity must still
  // mirror it for the legacy read paths (Products List, low-stock widgets, dashboard).
  if (source.fromVariant.isDefault) {
    await Product.findByIdAndUpdate(source.fromProduct._id, { $inc: { stockQuantity: delta } });
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
const applySerializedSourceDelta = async (source, { organizationId, delta, refId, createdBy, toStatus }) => {
  const type = delta < 0 ? 'transfer_out' : 'transfer_in';

  if (source.fromVariant) {
    const inventory = await Inventory.findOne({ variantId: source.fromVariant._id });
    const updatedInventory = await Inventory.findOneAndUpdate(
      { _id: inventory._id },
      { $inc: { quantity: delta } },
      { new: true }
    );
    await InventoryTransaction.create({
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
    });
    if (source.fromVariant.isDefault) {
      await Product.findByIdAndUpdate(source.fromProduct._id, { $inc: { stockQuantity: delta } });
    }
  } else {
    await Product.findByIdAndUpdate(source.fromProduct._id, { $inc: { stockQuantity: delta } });
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
  );
};

/** Resolves (find-or-create) the destination product/variant for a transfer's source. */
const resolveDestination = async (source, { organizationId, toBranchId }) => {
  const toProduct = await findOrCreateDestinationProduct({ sourceProduct: source.fromProduct, organizationId, toBranchId });
  if (!source.fromVariant) return { toProduct, toVariant: null };

  const toVariant = await findOrCreateDestinationVariant({
    sourceVariant: source.fromVariant,
    toProduct,
    organizationId,
    toBranchId,
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
 * Lists transfers for the org, scoped to the caller's active branch by default
 * (either as sender or receiver) unless explicit fromBranchId/toBranchId filters
 * are given, or `direction` narrows it to just outgoing/incoming.
 */
const queryTransfers = async (
  { organizationId, branchId, status, direction, fromBranchId, toBranchId, search },
  options
) => {
  const filter = { organizationId };

  if (fromBranchId) filter.fromBranchId = fromBranchId;
  if (toBranchId) filter.toBranchId = toBranchId;
  if (!fromBranchId && !toBranchId && branchId) {
    if (direction === 'outgoing') filter.fromBranchId = branchId;
    else if (direction === 'incoming') filter.toBranchId = branchId;
    else filter.$or = [{ fromBranchId: branchId }, { toBranchId: branchId }];
  }
  if (status) filter.status = status;
  if (search) filter.productName = { $regex: search, $options: 'i' };

  const result = await InventoryTransfer.paginate(filter, {
    ...options,
    sortBy: options.sortBy || 'createdAt:desc',
    populate: 'fromBranchId,toBranchId',
  });
  return result;
};

module.exports = {
  createTransfer,
  approveTransfer,
  completeTransfer,
  cancelTransfer,
  getTransferById,
  queryTransfers,
};
