const mongoose = require('mongoose');
const httpStatus = require('http-status');
const {
  Product,
  ProductVariant,
  Batch,
  PackSize,
  PackingVoucher,
  ProductionOrder,
  ProductionReceipt,
  User,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const stockService = require('./stock.service');
const settingsService = require('./settings.service');
const { requireBranch, roundQty, roundMoney, escapeRegex, aggregateScope } = require('./common');
const { atBusinessTimeOfDay } = require('../../utils/businessTimezone');

/*
 * Packing — the step between "the batch is made" and "the goods can be sold".
 *
 * A process factory makes one bulk product (Vito Mineral T, by the kg) from its BOM, and
 * only when the batch is finished decides how it leaves the factory: so many 1 KG cartons
 * (20 × 1 KG), so many 5 KG bags, so many 20 KG bags, and a little loose. Each of those is
 * a PackSize of the bulk product, pointing at a normal sellable pack product.
 *
 * A packing voucher, in ONE transaction:
 *   bulk product      −  Σ packs × content          (from the batch packed, else FEFO)
 *   packing material  −  Σ packs × material per pack (cartons, bags, pouches … FEFO)
 *   pack products     +  packs, valued at bulk cost × content + packing material per pack,
 *                        in the same batch number as the bulk (when they track batches)
 * Every movement is an InventoryTransaction row ('packing_out' / 'packing_in').
 *
 * It runs on its own (bulk already in stock) or inside the finished-goods receipt of an
 * order (execution.reportOutput → packInTransaction), so "receive 2,510.54 kg and pack it
 * as 59 cartons, 20 + 46 bags, 10.54 kg loose" is one step that either all happens or not.
 */

const EPS = 1e-6;
const MAX_SIZES = 30;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const scopeOf = ({ organizationId, branchId }) => ({ organizationId, ...(branchId ? { branchId } : {}) });

const runTransaction = async (work) => {
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      result = await work(session);
    });
  } finally {
    await session.endSession();
  }
  return result;
};

/** A bulk product that can be packed: simple (no variants), not serial-tracked. */
const assertPackable = (product, role = 'bulk') => {
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found in this branch');
  if (product.hasVariants) {
    throw new ApiError(httpStatus.BAD_REQUEST, `"${product.name}" has variants — packing works with simple products`);
  }
  if (product.trackImei || product.trackSerial) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `"${product.name}" is serial-tracked and cannot be ${role === 'bulk' ? 'packed' : 'a pack'}`
    );
  }
};

/**
 * The bulk side: serial-tracked products cannot be packed by weight. A product with
 * variants can — once the variant is known (the production order names it).
 */
const assertBulk = (product, { variantId, forSetup = false } = {}) => {
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found in this branch');
  if (product.trackImei || product.trackSerial) {
    throw new ApiError(httpStatus.BAD_REQUEST, `"${product.name}" is serial-tracked and cannot be packed`);
  }
  // A product with variants: the variant named, else its only one (stock.service#resolveItem
  // refuses with the list when there are several).
  return { variantId, forSetup };
};

/** Why this bulk product cannot be packed right now, in words — or null. */
const packProblem = (bulk, variantId) => {
  if (bulk.trackImei || bulk.trackSerial)
    return `${bulk.name} is tracked by serial numbers, so it cannot be packed by weight.`;
  if (bulk.hasVariants && !variantId) {
    return `${bulk.name} has several variants — choose which one was made to pack it.`;
  }
  return null;
};

/* ── Pack sizes (setup) ───────────────────────────────────────────────────────── */

const packTrackingOf = async (productIds) => {
  const defaults = await ProductVariant.find({ productId: { $in: productIds }, isDefault: true })
    .select('productId trackBatch trackExpiry')
    .lean();
  return new Map(defaults.map((v) => [String(v.productId), { trackBatch: !!v.trackBatch, trackExpiry: !!v.trackExpiry }]));
};

/** Everything the pack-size sheet and the packing grid need for one bulk product. */
const getSetup = async (ctx, productId, { variantId: asked } = {}) => {
  const bulk = await Product.findOne({ _id: productId, ...scopeOf(ctx) })
    .select('name sku unit productType hasVariants trackImei trackSerial shelfLifeDays')
    .lean();
  if (!bulk) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  // A product with variants: the variant asked for, else its only one.
  let variantId = asked || null;
  let variants = [];
  if (bulk.hasVariants) {
    const sole = await stockService.soleVariant(bulk);
    variants = sole.variants.map((v) => ({ id: String(v._id), label: stockService.variantLabel(v), sku: v.sku || '' }));
    // Not several to choose from: its only variant, or none at all (held as a simple product).
    if (!variantId && !sole.ambiguous) {
      variantId = sole.variant && !sole.variant.isDefault ? String(sole.variant._id) : 'default';
    }
  }
  const lookupVariant = variantId && variantId !== 'default' ? variantId : undefined;
  const sizes = await PackSize.find({ ...scopeOf(ctx), productId: bulk._id })
    .sort({ sequence: 1, createdAt: 1 })
    .lean();
  const packIds = sizes.map((s) => s.packProductId);
  const materialIds = sizes.flatMap((s) => s.materials.map((m) => m.productId));
  const allIds = [...new Set([...packIds, ...materialIds].map(String))];
  const [products, availability, costs, tracking, bulkDetail] = await Promise.all([
    allIds.length
      ? Product.find({ _id: { $in: allIds.map(oid) }, organizationId: ctx.organizationId })
          .select('name sku unit price productType isActive')
          .lean()
      : [],
    stockService.getAvailability({
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
      items: allIds.map((id) => ({ productId: id })),
    }),
    stockService.getUnitCosts({
      organizationId: ctx.organizationId,
      items: [String(bulk._id), ...allIds].map((id) => ({ productId: id })),
    }),
    packTrackingOf([bulk._id, ...packIds]),
    packProblem(bulk, variantId)
      ? null
      : stockService
          .getStockDetail({
            organizationId: ctx.organizationId,
            branchId: ctx.branchId,
            productId: bulk._id,
            variantId: lookupVariant,
          })
          // The pack sizes still load when the stock look-up fails; the reason is shown.
          .catch((err) => ({ error: err.message || 'Stock could not be read' })),
  ]);
  const problem = packProblem(bulk, variantId) || (bulkDetail && bulkDetail.error) || null;
  const detail = bulkDetail && !bulkDetail.error ? bulkDetail : null;
  const productOf = new Map(products.map((p) => [String(p._id), p]));
  const info = (id) => {
    const p = productOf.get(String(id)) || {};
    return {
      id: String(id),
      name: p.name || '(deleted product)',
      sku: p.sku || '',
      unit: p.unit || '',
      price: p.price != null ? p.price : null,
      missing: !p.name,
      available: roundQty(availability.get(`${id}:`) || 0),
      unitCost: costs.get(`${id}:`) || 0,
    };
  };
  return {
    product: {
      id: String(bulk._id),
      name: bulk.name,
      sku: bulk.sku || '',
      unit: bulk.unit,
      productType: bulk.productType,
      variantId: lookupVariant ? String(lookupVariant) : null,
      hasVariants: !!bulk.hasVariants,
      variants,
      // Pack sizes can be saved (everything but serial-tracked); packing needs `packable`.
      canSetUp: !(bulk.trackImei || bulk.trackSerial),
      packable: !problem,
      problem,
      available: detail ? detail.available : 0,
      unitCost: costs.get(`${bulk._id}:`) || 0,
      tracking: detail
        ? { trackBatch: !!detail.tracking.batch, trackExpiry: !!detail.tracking.expiry }
        : tracking.get(String(bulk._id)) || { trackBatch: false, trackExpiry: false },
      batches: detail ? detail.batches : [],
    },
    sizes: sizes.map((s) => ({
      id: String(s._id),
      name: s.name,
      contentQuantity: s.contentQuantity,
      contentUnit: s.contentUnit,
      innerCount: s.innerCount || 1,
      innerName: s.innerName || '',
      isActive: s.isActive !== false,
      sequence: s.sequence,
      packProduct: { ...info(s.packProductId), tracking: tracking.get(String(s.packProductId)) || null },
      materials: s.materials.map((m) => ({ ...info(m.productId), quantity: m.quantity, unit: m.unit })),
    })),
  };
};

/**
 * Saves the bulk product's whole list of pack sizes (the sheet edits the list as one):
 * rows with an id are updated, new rows created, rows left out removed. Vouchers keep
 * their own copy of names and quantities, so removing a size never changes history.
 */
const saveSizes = async (ctx, productId, { sizes = [] } = {}) => {
  requireBranch(ctx.branchId);
  const bulk = await Product.findOne({ _id: productId, organizationId: ctx.organizationId, branchId: ctx.branchId }).lean();
  assertBulk(bulk, { forSetup: true });
  if (sizes.length > MAX_SIZES) throw new ApiError(httpStatus.BAD_REQUEST, `At most ${MAX_SIZES} pack sizes per product`);

  const ids = [
    ...new Set(sizes.flatMap((s) => [s.packProductId, ...(s.materials || []).map((m) => m.productId)]).map(String)),
  ];
  const products = await Product.find({
    _id: { $in: ids.map(oid) },
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
  })
    .select('name unit hasVariants trackImei trackSerial')
    .lean();
  const productOf = new Map(products.map((p) => [String(p._id), p]));
  const seenPack = new Set();
  const seenName = new Set();
  const docs = sizes.map((s, index) => {
    const name = String(s.name || '').trim();
    if (!name) throw new ApiError(httpStatus.BAD_REQUEST, `Pack size ${index + 1}: enter a name`);
    if (seenName.has(name.toLowerCase())) throw new ApiError(httpStatus.BAD_REQUEST, `Pack size "${name}" is listed twice`);
    seenName.add(name.toLowerCase());
    const pack = productOf.get(String(s.packProductId));
    if (!pack) throw new ApiError(httpStatus.BAD_REQUEST, `"${name}": choose the product the packs are stocked as`);
    if (String(pack._id) === String(bulk._id)) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `"${name}": the pack product must be a different product from ${bulk.name}`
      );
    }
    assertPackable(pack, 'pack');
    if (seenPack.has(String(pack._id))) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `"${pack.name}" is used by two pack sizes — each pack size needs its own product`
      );
    }
    seenPack.add(String(pack._id));
    const content = roundQty(s.contentQuantity);
    if (!(content > 0))
      throw new ApiError(httpStatus.BAD_REQUEST, `"${name}": enter how much ${bulk.unit} goes into one pack`);
    const materials = (s.materials || []).map((m) => {
      const material = productOf.get(String(m.productId));
      if (!material) throw new ApiError(httpStatus.BAD_REQUEST, `"${name}": a packing material was not found`);
      if (String(material._id) === String(bulk._id) || String(material._id) === String(pack._id)) {
        throw new ApiError(httpStatus.BAD_REQUEST, `"${name}": ${material.name} cannot be its own packing material`);
      }
      assertPackable(material, 'material');
      const quantity = roundQty(m.quantity);
      if (!(quantity > 0))
        throw new ApiError(httpStatus.BAD_REQUEST, `"${name}": enter the quantity of ${material.name} per pack`);
      return { productId: material._id, productName: material.name, unit: material.unit, quantity };
    });
    const merged = new Map();
    materials.forEach((m) => {
      const key = String(m.productId);
      if (merged.has(key)) merged.get(key).quantity = roundQty(merged.get(key).quantity + m.quantity);
      else merged.set(key, m);
    });
    return {
      id: s.id || null,
      doc: {
        organizationId: ctx.organizationId,
        branchId: ctx.branchId,
        productId: bulk._id,
        name,
        packProductId: pack._id,
        contentQuantity: content,
        contentUnit: bulk.unit,
        innerCount: Math.max(1, Math.round(Number(s.innerCount) || 1)),
        innerName: String(s.innerName || '').trim(),
        materials: [...merged.values()],
        isActive: s.isActive !== false,
        sequence: index,
        updatedBy: ctx.createdBy,
      },
    };
  });

  await runTransaction(async (session) => {
    const existing = await PackSize.find({ organizationId: ctx.organizationId, branchId: ctx.branchId, productId: bulk._id })
      .select('_id')
      .session(session)
      .lean();
    const keep = new Set(docs.filter((d) => d.id).map((d) => String(d.id)));
    const unknown = [...keep].filter((id) => !existing.some((e) => String(e._id) === id));
    if (unknown.length)
      throw new ApiError(httpStatus.BAD_REQUEST, 'A pack size was changed elsewhere — reload and try again');
    const remove = existing.filter((e) => !keep.has(String(e._id))).map((e) => e._id);
    if (remove.length) await PackSize.deleteMany({ _id: { $in: remove } }, { session });
    // eslint-disable-next-line no-restricted-syntax
    for (const d of docs) {
      if (d.id) {
        // eslint-disable-next-line no-await-in-loop
        await PackSize.updateOne({ _id: d.id }, { $set: d.doc }, { session });
      } else {
        // eslint-disable-next-line no-await-in-loop
        await PackSize.create([{ ...d.doc, createdBy: ctx.createdBy }], { session });
      }
    }
  });
  return getSetup(ctx, productId);
};

/**
 * A new sellable pack product for a pack size ("Vito Mineral T 5 KG Bag"), created the
 * normal way (product.service) so it is in the catalog, POS and invoices like any other.
 * It tracks batches/expiry when the bulk does, so packs keep the production batch.
 */
const createPackProduct = async (ctx, productId, body) => {
  requireBranch(ctx.branchId);
  const bulk = await Product.findOne({ _id: productId, organizationId: ctx.organizationId, branchId: ctx.branchId }).lean();
  assertBulk(bulk, { forSetup: true });
  const name = String(body.name || '').trim();
  if (!name) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter the pack product name');
  const clash = await Product.findOne({
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
  })
    .select('_id')
    .lean();
  if (clash) throw new ApiError(httpStatus.CONFLICT, `A product named "${name}" already exists — pick it instead`);
  const tracking = (await packTrackingOf([bulk._id])).get(String(bulk._id)) || {};
  // eslint-disable-next-line global-require
  const productService = require('../product.service');
  const product = await productService.createProduct({
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    createdBy: ctx.createdBy,
    source: 'manual',
    name,
    sku: String(body.sku || '').trim() || undefined,
    unit: body.unit || 'pcs',
    price: Number(body.price) > 0 ? Number(body.price) : 0,
    cost: 0,
    stockQuantity: 0,
    productType: 'finished_good',
    procurementType: 'make',
    shelfLifeDays: bulk.shelfLifeDays || undefined,
    trackBatch: !!tracking.trackBatch,
    trackExpiry: !!tracking.trackExpiry,
    categories: bulk.categories,
  });
  return { id: String(product._id), name: product.name, sku: product.sku || '', unit: product.unit, price: product.price };
};

/** Bulk products that have pack sizes — the packing page's product picker. */
const getPackableProducts = async (ctx) => {
  // (Products with variants are packed on their order's receipt, which names the variant.)
  const rows = await PackSize.aggregate([
    { $match: { ...aggregateScope(ctx), isActive: true } },
    { $group: { _id: '$productId', sizes: { $sum: 1 } } },
  ]);
  if (!rows.length) return [];
  const [products, availability] = await Promise.all([
    Product.find({ _id: { $in: rows.map((r) => r._id) } })
      .select('name sku unit')
      .lean(),
    stockService.getAvailability({
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
      items: rows.map((r) => ({ productId: r._id })),
    }),
  ]);
  const sizesOf = new Map(rows.map((r) => [String(r._id), r.sizes]));
  return products
    .map((p) => ({
      id: String(p._id),
      name: p.name,
      sku: p.sku || '',
      unit: p.unit,
      sizes: sizesOf.get(String(p._id)) || 0,
      available: roundQty(availability.get(`${p._id}:`) || 0),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

/* ── Posting ──────────────────────────────────────────────────────────────────── */

/** Takes `quantity` of an item out of available stock (explicit batch, else FEFO). */
const takeOut = async (item, quantity, { batchId, voucherId, productionOrderId, ctx, session, fallbackCost }) => {
  // A made product's own cost field is often 0 — value it at what production cost.
  if (!(item.unitCost > 0) && fallbackCost > 0) item.unitCost = fallbackCost; // eslint-disable-line no-param-reassign
  const parts = [];
  if (item.batchTracked) {
    const allocations = await stockService.allocateBatches(
      item,
      quantity,
      batchId ? [{ batchId, quantity }] : null,
      session,
      { skipExpired: !batchId }
    );
    // eslint-disable-next-line no-restricted-syntax
    for (const a of allocations) {
      // eslint-disable-next-line no-await-in-loop
      const balanceAfter = await stockService.applyAvailableDelta(item, -a.quantity, { batchId: a.batch._id, session });
      const unitCost = a.batch.costPerUnit > 0 ? a.batch.costPerUnit : item.unitCost;
      // eslint-disable-next-line no-await-in-loop
      await stockService.writeMovement(item, {
        organizationId: ctx.organizationId,
        branchId: ctx.branchId,
        type: 'packing_out',
        delta: -a.quantity,
        balanceAfter,
        unitCost,
        refType: 'PackingVoucher',
        refId: voucherId,
        productionOrderId,
        batchId: a.batch._id,
        createdBy: ctx.createdBy,
        session,
      });
      parts.push({ batch: a.batch, quantity: a.quantity, unitCost });
    }
  } else {
    const balanceAfter = await stockService.applyAvailableDelta(item, -quantity, { session });
    await stockService.writeMovement(item, {
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
      type: 'packing_out',
      delta: -quantity,
      balanceAfter,
      unitCost: item.unitCost,
      refType: 'PackingVoucher',
      refId: voucherId,
      productionOrderId,
      createdBy: ctx.createdBy,
      session,
    });
    parts.push({ batch: null, quantity, unitCost: item.unitCost });
  }
  const totalCost = parts.reduce((s, p) => s + p.quantity * (p.unitCost || 0), 0);
  return { parts, totalCost, unitCost: quantity > 0 ? totalCost / quantity : 0 };
};

/** Puts packs into stock — into the bulk's batch number when the pack tracks batches. */
const putIn = async (item, quantity, unitCost, { lot, voucherId, productionOrderId, ctx, session }) => {
  let batch = null;
  if (item.batchTracked) {
    await stockService.ensureLedgerAnchor(item, session);
    const manufactureDate = lot.manufactureDate || new Date();
    const shelfLife = Number(item.product.shelfLifeDays) || 0;
    const expiryDate = lot.expiryDate || (shelfLife > 0 ? new Date(manufactureDate.getTime() + shelfLife * 86400000) : null);
    batch = await Batch.findOneAndUpdate(
      { organizationId: ctx.organizationId, inventoryId: item.inventory._id, batchNumber: lot.batchNumber },
      {
        $setOnInsert: {
          quantity: 0,
          costPerUnit: unitCost,
          productionOrderId: productionOrderId || null,
          manufactureDate,
          expiryDate,
        },
        $set: { status: 'active' },
      },
      { upsert: true, new: true, session }
    );
    if (batch.quantity > EPS && Math.abs((batch.costPerUnit || 0) - unitCost) > 1e-9) {
      const costPerUnit = roundMoney(
        (batch.quantity * (batch.costPerUnit || 0) + quantity * unitCost) / (batch.quantity + quantity)
      );
      await Batch.updateOne({ _id: batch._id }, { $set: { costPerUnit } }, { session });
    }
  }
  const balanceAfter = await stockService.applyAvailableDelta(item, quantity, {
    batchId: batch ? batch._id : null,
    session,
  });
  await stockService.writeMovement(item, {
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    type: 'packing_in',
    delta: quantity,
    balanceAfter,
    unitCost,
    refType: 'PackingVoucher',
    refId: voucherId,
    productionOrderId,
    batchId: batch ? batch._id : null,
    createdBy: ctx.createdBy,
    session,
  });
  return batch;
};

/**
 * Validates and works out a packing request against the bulk product's pack sizes:
 * per line the pack size and bulk used, and per material the total needed.
 */
const planLines = async (ctx, productId, lines, session) => {
  const wanted = (lines || []).filter((l) => Number(l.quantity) > 0);
  if (!wanted.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter how many of at least one pack size were packed');
  const sizes = await PackSize.find({
    _id: { $in: wanted.map((l) => oid(l.packSizeId)) },
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    productId,
  })
    .session(session)
    .lean();
  const sizeOf = new Map(sizes.map((s) => [String(s._id), s]));
  const seen = new Set();
  const planned = wanted.map((l) => {
    const size = sizeOf.get(String(l.packSizeId));
    if (!size)
      throw new ApiError(httpStatus.BAD_REQUEST, 'A pack size was not found for this product — reload and try again');
    if (seen.has(String(size._id))) throw new ApiError(httpStatus.BAD_REQUEST, `"${size.name}" is entered twice`);
    seen.add(String(size._id));
    const quantity = roundQty(l.quantity);
    return { size, quantity, bulkQuantity: roundQty(quantity * size.contentQuantity) };
  });
  const materials = new Map();
  planned.forEach((p) =>
    p.size.materials.forEach((m) => {
      const key = String(m.productId);
      const need = roundQty(m.quantity * p.quantity);
      if (!materials.has(key)) materials.set(key, { productId: m.productId, quantity: 0, perLine: [] });
      const entry = materials.get(key);
      entry.quantity = roundQty(entry.quantity + need);
      entry.perLine.push({ sizeId: String(p.size._id), quantity: need });
    })
  );
  return { planned, materials, bulkQuantity: roundQty(planned.reduce((s, p) => s + p.bulkQuantity, 0)) };
};

/**
 * Posts a packing voucher inside the caller's transaction.
 *  body: { productId, lines: [{ packSizeId, quantity }], batchId?, productionOrderId?,
 *          receiptId?, looseQuantity?, packingDate?, notes? }
 */
const packInTransaction = async (ctx, body, { voucherNumber, session, source = 'stock' }) => {
  const bulkVariantId = body.variantId || null;
  const loaded = await Product.findOne({ _id: body.productId, organizationId: ctx.organizationId, branchId: ctx.branchId })
    .select('name hasVariants trackImei trackSerial')
    .session(session)
    .lean();
  assertBulk(loaded, { variantId: bulkVariantId });
  const bulkItem = await stockService.resolveItem({
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    productId: body.productId,
    variantId: loaded.hasVariants ? bulkVariantId : undefined,
    session,
  });
  const { planned, materials, bulkQuantity } = await planLines(ctx, bulkItem.product._id, body.lines, session);

  let order = null;
  if (body.productionOrderId) {
    order = await ProductionOrder.findOne({
      _id: body.productionOrderId,
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
    })
      .select('orderNumber batchNumber productId variantId')
      .session(session)
      .lean();
    if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
    if (String(order.productId) !== String(bulkItem.product._id)) {
      throw new ApiError(httpStatus.BAD_REQUEST, `${order.orderNumber} does not make ${bulkItem.product.name}`);
    }
  }
  if (body.batchId && !bulkItem.batchTracked) {
    throw new ApiError(httpStatus.BAD_REQUEST, `${bulkItem.product.name} does not track batches`);
  }
  const voucherId = new mongoose.Types.ObjectId();
  const productionOrderId = order ? order._id : null;
  const moveCtx = { voucherId, productionOrderId, ctx, session };

  // 1. Bulk out — valued at the receipt's cost when packed off a receipt, else at the
  // batch cost / stock cost, else at what the latest production of it cost.
  let fallbackCost = body.bulkUnitCost || 0;
  if (!fallbackCost) {
    const last = await ProductionReceipt.findOne({
      organizationId: ctx.organizationId,
      productId: bulkItem.product._id,
      unitCost: { $gt: 0 },
    })
      .sort({ receiptDate: -1 })
      .select('unitCost')
      .session(session)
      .lean();
    fallbackCost = last ? last.unitCost : 0;
  }
  if (body.bulkUnitCost > 0 && !bulkItem.batchTracked) bulkItem.unitCost = body.bulkUnitCost;
  const bulkOut = await takeOut(bulkItem, bulkQuantity, { ...moveCtx, batchId: body.batchId || null, fallbackCost });
  const bulkUnitCost = bulkOut.unitCost;
  const firstLot = bulkOut.parts[0] && bulkOut.parts[0].batch;
  const consumed = [
    {
      role: 'bulk',
      productId: bulkItem.product._id,
      variantId: bulkItem.variant && !bulkItem.variant.isDefault ? bulkItem.variant._id : null,
      productName: bulkItem.name,
      unit: bulkItem.unit,
      quantity: bulkQuantity,
      unitCost: roundMoney(bulkUnitCost),
      totalCost: roundMoney(bulkOut.totalCost),
      batches: bulkOut.parts.some((p) => p.batch)
        ? bulkOut.parts.map((p) => ({ batchId: p.batch._id, batchNumber: p.batch.batchNumber, quantity: p.quantity }))
        : undefined,
    },
  ];

  // 2. Packing material out.
  const materialCostBySize = new Map();
  // eslint-disable-next-line no-restricted-syntax
  for (const m of materials.values()) {
    // eslint-disable-next-line no-await-in-loop
    const item = await stockService.resolveItem({
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
      productId: m.productId,
      session,
    });
    assertPackable(item.product, 'material');
    // eslint-disable-next-line no-await-in-loop
    const out = await takeOut(item, m.quantity, moveCtx);
    consumed.push({
      role: 'material',
      productId: item.product._id,
      productName: item.name,
      unit: item.unit,
      quantity: m.quantity,
      unitCost: roundMoney(out.unitCost),
      totalCost: roundMoney(out.totalCost),
      batches: out.parts.some((p) => p.batch)
        ? out.parts.map((p) => ({ batchId: p.batch._id, batchNumber: p.batch.batchNumber, quantity: p.quantity }))
        : undefined,
    });
    m.perLine.forEach((pl) =>
      materialCostBySize.set(pl.sizeId, (materialCostBySize.get(pl.sizeId) || 0) + pl.quantity * out.unitCost)
    );
  }

  // 3. Packs in — the batch number follows the bulk: the batch packed, else the order's.
  const batchNumber = String(
    (firstLot && firstLot.batchNumber) || (order && (order.batchNumber || order.orderNumber)) || voucherNumber
  ).trim();
  const lot = {
    batchNumber,
    manufactureDate: (firstLot && firstLot.manufactureDate) || null,
    expiryDate: (firstLot && firstLot.expiryDate) || null,
  };
  const lines = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const p of planned) {
    // eslint-disable-next-line no-await-in-loop
    const item = await stockService.resolveItem({
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
      productId: p.size.packProductId,
      session,
    });
    assertPackable(item.product, 'pack');
    const materialCost = materialCostBySize.get(String(p.size._id)) || 0;
    const totalCost = p.bulkQuantity * bulkUnitCost + materialCost;
    const unitCost = roundMoney(totalCost / p.quantity);
    // eslint-disable-next-line no-await-in-loop
    const batch = await putIn(item, p.quantity, unitCost, { ...moveCtx, lot });
    lines.push({
      packSizeId: p.size._id,
      packName: p.size.name,
      productId: item.product._id,
      productName: item.name,
      unit: item.unit,
      quantity: p.quantity,
      contentQuantity: p.size.contentQuantity,
      bulkQuantity: p.bulkQuantity,
      unitCost,
      materialCost: roundMoney(materialCost),
      totalCost: roundMoney(totalCost),
      batchId: batch ? batch._id : null,
      batchNumber: batch ? batch.batchNumber : undefined,
    });
  }

  const user = ctx.createdBy ? await User.findById(ctx.createdBy).select('name').session(session).lean() : null;
  const [voucher] = await PackingVoucher.create(
    [
      {
        _id: voucherId,
        organizationId: ctx.organizationId,
        branchId: ctx.branchId,
        voucherNumber,
        packingDate: atBusinessTimeOfDay(body.packingDate) || new Date(),
        productId: bulkItem.product._id,
        variantId: bulkItem.variant && !bulkItem.variant.isDefault ? bulkItem.variant._id : null,
        productName: bulkItem.name,
        unit: bulkItem.unit,
        source,
        productionOrderId,
        orderNumber: order ? order.orderNumber : undefined,
        receiptId: body.receiptId || null,
        batchNumber,
        bulkQuantity,
        bulkUnitCost: roundMoney(bulkUnitCost),
        looseQuantity: Math.max(0, roundQty(body.looseQuantity || 0)),
        lines,
        consumed,
        totalCost: roundMoney(lines.reduce((s, l) => s + l.totalCost, 0)),
        notes: String(body.notes || '').trim(),
        createdBy: ctx.createdBy,
        createdByName: user ? user.name : undefined,
      },
    ],
    { session }
  );
  return voucher;
};

/** Packs bulk already in stock. */
const postPacking = async (ctx, body) => {
  requireBranch(ctx.branchId);
  const voucherNumber = await settingsService.nextDocumentNumber(ctx.organizationId, 'packing');
  return runTransaction((session) => packInTransaction(ctx, body, { voucherNumber, session, source: 'stock' }));
};

/**
 * Called by execution.reportOutput inside its transaction, right after the good output
 * was received: packs it from the receipt's own batch. Packing more than was received is
 * refused; what is not packed stays as loose bulk stock.
 */
const packReceipt = async (ctx, { order, output, packing, voucherNumber, session }) => {
  const receipt = await ProductionReceipt.findOne({ outputId: output._id }).session(session).lean();
  if (!receipt) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Pack the goods once they are received — this output went to quality check');
  }
  const { bulkQuantity } = await planLines(ctx, order.productId, packing.lines, session);
  if (bulkQuantity > receipt.quantity + EPS) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `The packs hold ${roundQty(bulkQuantity)} ${order.unit} but only ${roundQty(receipt.quantity)} ${
        order.unit
      } was received good`
    );
  }
  return packInTransaction(
    ctx,
    {
      productId: order.productId,
      variantId: order.variantId || null,
      lines: packing.lines,
      batchId: receipt.batchId || null,
      productionOrderId: order._id,
      receiptId: receipt._id,
      bulkUnitCost: receipt.unitCost,
      looseQuantity: roundQty(receipt.quantity - bulkQuantity),
      notes: packing.notes,
    },
    { voucherNumber, session, source: 'receipt' }
  );
};

/**
 * Receive an order's output and pack it in the same transaction (the receive dialog's
 * "Pack now"). Without packing lines it is a plain receipt. → { output, packing }
 */
const receiveAndPack = async (ctx, orderId, body) => {
  // eslint-disable-next-line global-require
  const execution = require('./execution.service');
  const lines = ((body.packing && body.packing.lines) || []).filter((l) => Number(l.quantity) > 0);
  if (!lines.length) return { output: await execution.reportOutput(ctx, orderId, body), packing: null };
  // Numbers are taken before the transaction — counters are never advanced inside one.
  const voucherNumber = await settingsService.nextDocumentNumber(ctx.organizationId, 'packing');
  let packing = null;
  const output = await execution.reportOutput(ctx, orderId, body, {
    afterReceipt: async ({ order, output: out, session }) => {
      packing = await packReceipt(ctx, {
        order,
        output: out,
        packing: { lines, notes: body.packing.notes },
        voucherNumber,
        session,
      });
    },
  });
  return { output, packing };
};

/* ── Cancel (reverse) ─────────────────────────────────────────────────────────── */

/**
 * Cancelling puts everything back exactly: the packs leave stock (refused if they were
 * already sold), the bulk and packing material return to the batches they came from.
 */
/**
 * Puts a posted voucher back inside the caller's transaction: the packs leave stock (a
 * conflict if some were sold), bulk and packing material return to their batches.
 */
const cancelPackingInTx = async (ctx, voucher, text, session) => {
  const common = {
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    refType: 'PackingVoucherReversal',
    refId: voucher._id,
    productionOrderId: voucher.productionOrderId || undefined,
    createdBy: ctx.createdBy,
    session,
  };
  // eslint-disable-next-line no-restricted-syntax
  for (const line of voucher.lines) {
    // eslint-disable-next-line no-await-in-loop
    const item = await stockService.resolveItem({ ...ctx, productId: line.productId, session });
    let balanceAfter;
    try {
      // eslint-disable-next-line no-await-in-loop
      balanceAfter = await stockService.applyAvailableDelta(item, -line.quantity, {
        batchId: line.batchId || null,
        session,
      });
    } catch (err) {
      throw new ApiError(
        httpStatus.CONFLICT,
        `Cannot cancel: ${line.quantity} ${line.unit} of "${line.productName}"${
          line.batchNumber ? ` (batch ${line.batchNumber})` : ''
        } are no longer in stock — some were sold or moved`
      );
    }
    // eslint-disable-next-line no-await-in-loop
    await stockService.writeMovement(item, {
      ...common,
      type: 'packing_in',
      delta: -line.quantity,
      balanceAfter,
      unitCost: line.unitCost,
      batchId: line.batchId || null,
    });
  }
  // eslint-disable-next-line no-restricted-syntax
  for (const c of voucher.consumed) {
    // eslint-disable-next-line no-await-in-loop
    const item = await stockService.resolveItem({
      ...ctx,
      productId: c.productId,
      variantId: c.variantId || undefined,
      session,
    });
    const parts = c.batches && c.batches.length ? c.batches : [{ batchId: null, quantity: c.quantity }];
    // eslint-disable-next-line no-restricted-syntax
    for (const part of parts) {
      // eslint-disable-next-line no-await-in-loop
      const balanceAfter = await stockService.applyAvailableDelta(item, part.quantity, {
        batchId: part.batchId || null,
        session,
      });
      // eslint-disable-next-line no-await-in-loop
      await stockService.writeMovement(item, {
        ...common,
        type: 'packing_out',
        delta: part.quantity,
        balanceAfter,
        unitCost: c.unitCost,
        batchId: part.batchId || null,
      });
    }
  }
  const user = ctx.createdBy ? await User.findById(ctx.createdBy).select('name').session(session).lean() : null;
  /* eslint-disable no-param-reassign -- the caller's voucher document is updated and saved */
  voucher.status = 'cancelled';
  voucher.cancelledAt = new Date();
  voucher.cancelledBy = { userId: ctx.createdBy, name: user ? user.name : undefined };
  voucher.cancelReason = text;
  /* eslint-enable no-param-reassign */
  await voucher.save({ session });
  return voucher;
};

const cancelPacking = async (ctx, voucherId, { reason } = {}) => {
  requireBranch(ctx.branchId);
  const text = String(reason || '').trim();
  if (!text) throw new ApiError(httpStatus.BAD_REQUEST, 'Give a reason for cancelling the packing');
  return runTransaction(async (session) => {
    const voucher = await PackingVoucher.findOne({
      _id: voucherId,
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
    }).session(session);
    if (!voucher) throw new ApiError(httpStatus.NOT_FOUND, 'Packing voucher not found');
    if (voucher.status === 'cancelled') throw new ApiError(httpStatus.BAD_REQUEST, 'This packing is already cancelled');
    return cancelPackingInTx(ctx, voucher, text, session);
  });
};

/* ── Reading ──────────────────────────────────────────────────────────────────── */

const listPacking = async (ctx, q = {}) => {
  const filter = { ...scopeOf(ctx) };
  if (q.productId) filter.productId = q.productId;
  if (q.productionOrderId) filter.productionOrderId = q.productionOrderId;
  if (q.status && q.status !== 'all') filter.status = q.status;
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [
      { voucherNumber: re },
      { productName: re },
      { orderNumber: re },
      { batchNumber: re },
      { 'lines.productName': re },
    ];
  }
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(q.limit) || 25));
  const [results, totalResults] = await Promise.all([
    PackingVoucher.find(filter)
      .sort({ packingDate: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    PackingVoucher.countDocuments(filter),
  ]);
  return {
    results: results.map((v) => ({ ...v, id: String(v._id) })),
    page,
    limit,
    totalResults,
    totalPages: Math.max(1, Math.ceil(totalResults / limit)),
  };
};

const getPacking = async (ctx, voucherId) => {
  const v = await PackingVoucher.findOne({ _id: voucherId, ...scopeOf(ctx) }).lean();
  if (!v) throw new ApiError(httpStatus.NOT_FOUND, 'Packing voucher not found');
  return { ...v, id: String(v._id) };
};

/** Does this bulk product have pack sizes? (The receive dialog asks before showing packing.) */
const hasPackSizes = (ctx, productId) => PackSize.exists({ ...scopeOf(ctx), productId, isActive: true });

module.exports = {
  getSetup,
  saveSizes,
  createPackProduct,
  getPackableProducts,
  postPacking,
  packReceipt,
  receiveAndPack,
  cancelPacking,
  cancelPackingInTx,
  listPacking,
  getPacking,
  hasPackSizes,
};
