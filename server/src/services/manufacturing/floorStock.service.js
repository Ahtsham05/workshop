const mongoose = require('mongoose');
const httpStatus = require('http-status');
const {
  Product,
  FloorStockLot,
  FloorStockVoucher,
  ProductionOrder,
  ProductionOutput,
  PackingVoucher,
  User,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const { OPEN_PRODUCTION_STATUSES } = require('../../config/manufacturing');
const { atBusinessTimeOfDay, parseBusinessDateBoundary } = require('../../utils/businessTimezone');
const stockService = require('./stock.service');
const settingsService = require('./settings.service');
const { requireBranch, roundQty, roundMoney, escapeRegex, scopeFilter, aggregateScope } = require('./common');

/*
 * Production stock — material issued to the factory floor in bulk, for no order in
 * particular, and used from there automatically (what SAP calls a production supply area
 * with backflush, D365 a flushing principle, Oracle a "pull" supply type).
 *
 * The case it is built for: cartons, labels, bottles and bags. The store hands the floor
 * 500 cartons in the morning; ten different finished goods use the same carton; nobody
 * issues "12 cartons for MO-00041". A product marked issueMethod 'floor' is such a material.
 *
 *   STORE ──issue (PSI)──▶ PRODUCTION STOCK ──used when FG is received / packed──▶ (gone)
 *     ▲                        │      └──── count (PSC): wastage (−) / found (+)
 *     └──── return (PSR) ──────┘
 *
 *  - Receiving finished goods backflushes the BOM quantity of each floor material: first
 *    whatever was issued to that order directly, the rest from production stock
 *    (execution.service.js#backflush). Packing does the same for the pack-size materials
 *    (packing.service.js).
 *  - Not enough on the floor: setting floorShortfall 'auto_issue' issues the shortfall from
 *    the store on the spot (an automatic PSI that the reports flag), 'block' refuses.
 *  - Balance at any time:  issued − used − returned ± count difference = in production stock.
 *
 * Lots (FloorStockLot) are the running balance, used oldest-first, carrying batch and cost;
 * every move is also an InventoryTransaction row ('floor' bucket for the floor side).
 */

const EPS = 1e-6;
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const KIND_COUNTER = { issue: 'floorIssue', return: 'floorReturn', count: 'floorCount' };

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

const userName = async (userId, session) => {
  if (!userId) return undefined;
  const user = await User.findById(userId)
    .select('name')
    .session(session || null)
    .lean();
  return user ? user.name : undefined;
};

/** Plain variant id of a resolved item: null for a simple product's default stand-in. */
const plainVariantId = (item) => (item.variant && !item.variant.isDefault ? item.variant._id : null);

/** Why a product can't be kept in production stock, or null. */
const floorProblem = (product, variantCount = 0) => {
  if (product.trackImei || product.trackSerial) return `${product.name} is tracked by serial number`;
  if (product.productType === 'service') return `${product.name} is a service`;
  if (product.hasVariants && variantCount > 1) return `${product.name} has ${variantCount} variants`;
  return null;
};

/* ── Lots and ledger ──────────────────────────────────────────────────────────── */

const lotsOf = (ctx, productId, session) =>
  FloorStockLot.find({
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    productId,
    quantity: { $gt: EPS },
  })
    .sort({ issuedAt: 1, _id: 1 })
    .session(session || null);

const balanceOf = async (ctx, productId, session) =>
  roundQty((await lotsOf(ctx, productId, session)).reduce((s, lot) => s + lot.quantity, 0));

/** In production stock now, per product id (string). */
const balances = async (ctx, productIds = null) => {
  const rows = await FloorStockLot.aggregate([
    {
      $match: {
        ...aggregateScope(ctx),
        quantity: { $gt: EPS },
        ...(productIds ? { productId: { $in: productIds.map(oid) } } : {}),
      },
    },
    {
      $group: {
        _id: '$productId',
        quantity: { $sum: '$quantity' },
        value: { $sum: { $multiply: ['$quantity', '$unitCost'] } },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), { quantity: roundQty(r.quantity), value: roundMoney(r.value) }]));
};

const writeFloor = (
  item,
  ctx,
  { type, delta, balanceAfter, unitCost, refType, refId, productionOrderId, batchId, session }
) =>
  stockService.writeMovement(item, {
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    type,
    bucket: 'floor',
    delta,
    balanceAfter,
    unitCost,
    refType,
    refId,
    productionOrderId: productionOrderId || undefined,
    location: 'Production stock',
    batchId,
    createdBy: ctx.createdBy,
    session,
  });

/** Puts a quantity on the floor as a new lot (or back into the lot it came from). */
const addLot = async (ctx, item, part, { type, refType, refId, productionOrderId, session }) => {
  const restored = part.lotId
    ? await FloorStockLot.findOneAndUpdate(
        { _id: part.lotId, organizationId: ctx.organizationId, branchId: ctx.branchId },
        { $inc: { quantity: roundQty(part.quantity) } },
        { new: true, session }
      )
    : null;
  let lot = restored;
  if (!lot) {
    [lot] = await FloorStockLot.create(
      [
        {
          ...(part.lotId ? { _id: part.lotId } : {}),
          organizationId: ctx.organizationId,
          branchId: ctx.branchId,
          productId: item.product._id,
          variantId: plainVariantId(item),
          productName: item.name,
          unit: item.unit,
          batchId: part.batchId || null,
          batchNumber: part.batchNumber,
          quantity: roundQty(part.quantity),
          unitCost: part.unitCost || 0,
          voucherId: part.voucherId,
          issuedAt: part.issuedAt || new Date(),
        },
      ],
      { session }
    );
  }
  await writeFloor(item, ctx, {
    type,
    delta: part.quantity,
    balanceAfter: await balanceOf(ctx, item.product._id, session),
    unitCost: part.unitCost,
    refType,
    refId,
    productionOrderId,
    batchId: part.batchId,
    session,
  });
  return lot;
};

/**
 * Takes `quantity` off the floor, oldest lot first, one ledger row per lot touched.
 * Returns the parts taken (enough to put each back exactly). Throws when short.
 */
const takeFromFloor = async (ctx, item, quantity, { type, refType, refId, productionOrderId, session }) => {
  const lots = await lotsOf(ctx, item.product._id, session);
  let balance = roundQty(lots.reduce((s, lot) => s + lot.quantity, 0));
  if (balance + EPS < quantity) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Production stock has only ${balance} ${item.unit} of "${item.name}", ${roundQty(quantity)} needed`
    );
  }
  const parts = [];
  let left = roundQty(quantity);
  // eslint-disable-next-line no-restricted-syntax
  for (const lot of lots) {
    if (left <= EPS) break;
    const take = roundQty(Math.min(lot.quantity, left));
    // eslint-disable-next-line no-await-in-loop
    const updated = await FloorStockLot.findOneAndUpdate(
      { _id: lot._id, quantity: { $gte: take - EPS } },
      { $inc: { quantity: -take } },
      { new: true, session }
    );
    if (!updated) throw new ApiError(httpStatus.CONFLICT, `Production stock of "${item.name}" just changed — try again`);
    balance = roundQty(balance - take);
    left = roundQty(left - take);
    // eslint-disable-next-line no-await-in-loop
    await writeFloor(item, ctx, {
      type,
      delta: -take,
      balanceAfter: balance,
      unitCost: lot.unitCost,
      refType,
      refId,
      productionOrderId,
      batchId: lot.batchId,
      session,
    });
    parts.push({
      lotId: lot._id,
      voucherId: lot.voucherId,
      batchId: lot.batchId || null,
      batchNumber: lot.batchNumber,
      quantity: take,
      unitCost: lot.unitCost || 0,
      issuedAt: lot.issuedAt,
    });
  }
  return parts;
};

const partsCost = (parts) => roundMoney(parts.reduce((s, p) => s + p.quantity * (p.unitCost || 0), 0));

/**
 * Store → floor for one line: available stock out (FEFO across batches), one floor lot
 * per batch part. → { batches, floorParts, cost }
 */
const issueFromStore = async (ctx, item, quantity, { voucherId, issuedAt, session }) => {
  const ref = { refType: 'FloorStockVoucher', refId: voucherId };
  const pieces = [];
  if (item.batchTracked) {
    const allocations = await stockService.allocateBatches(item, quantity, null, session, { skipExpired: true });
    // eslint-disable-next-line no-restricted-syntax
    for (const a of allocations) {
      // eslint-disable-next-line no-await-in-loop
      const balanceAfter = await stockService.applyAvailableDelta(item, -a.quantity, { batchId: a.batch._id, session });
      const unitCost = a.batch.costPerUnit > 0 ? a.batch.costPerUnit : item.unitCost;
      // eslint-disable-next-line no-await-in-loop
      await stockService.writeMovement(item, {
        organizationId: ctx.organizationId,
        branchId: ctx.branchId,
        type: 'floor_issue',
        delta: -a.quantity,
        balanceAfter,
        unitCost,
        ...ref,
        batchId: a.batch._id,
        createdBy: ctx.createdBy,
        session,
      });
      pieces.push({ batchId: a.batch._id, batchNumber: a.batch.batchNumber, quantity: a.quantity, unitCost });
    }
  } else {
    const balanceAfter = await stockService.applyAvailableDelta(item, -quantity, { session });
    await stockService.writeMovement(item, {
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
      type: 'floor_issue',
      delta: -quantity,
      balanceAfter,
      unitCost: item.unitCost,
      ...ref,
      createdBy: ctx.createdBy,
      session,
    });
    pieces.push({ batchId: null, quantity, unitCost: item.unitCost || 0 });
  }
  const floorParts = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const piece of pieces) {
    const lotId = new mongoose.Types.ObjectId();
    const part = { ...piece, lotId, voucherId, issuedAt };
    // eslint-disable-next-line no-await-in-loop
    await addLot(ctx, item, part, { type: 'floor_in', ...ref, session });
    floorParts.push(part);
  }
  return {
    batches: item.batchTracked ? pieces : undefined,
    floorParts,
    cost: partsCost(pieces),
  };
};

/** Floor → store: the parts taken off the floor go back to the batches they came from. */
const restockParts = async (ctx, item, parts, { refType, refId, session }) => {
  // eslint-disable-next-line no-restricted-syntax
  for (const part of parts) {
    const batchId = item.batchTracked ? part.batchId || null : null;
    // eslint-disable-next-line no-await-in-loop
    const balanceAfter = await stockService.applyAvailableDelta(item, part.quantity, { batchId, session });
    // eslint-disable-next-line no-await-in-loop
    await stockService.writeMovement(item, {
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
      type: 'floor_restock',
      delta: part.quantity,
      balanceAfter,
      unitCost: part.unitCost,
      refType,
      refId,
      batchId,
      createdBy: ctx.createdBy,
      session,
    });
  }
};

/** Loads a product as a production-stock material (refuses what can't be one). */
const resolveMaterial = async (ctx, productId, session, { requireFloor = true } = {}) => {
  const item = await stockService.resolveItem({
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    productId,
    session,
  });
  const problem = floorProblem(item.product);
  if (problem) throw new ApiError(httpStatus.BAD_REQUEST, `${problem} — it can't be kept in production stock`);
  if (requireFloor && item.product.issueMethod !== 'floor') {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `"${item.name}" is not a production-stock material — turn it on under Production Stock → Materials first`
    );
  }
  return item;
};

/* ── Used by finished goods (receipts and packing) ─────────────────────────────── */

/**
 * Collects what a receipt / packing had to issue automatically because the floor was
 * short, so it becomes ONE automatic issue voucher. Create with `autoIssue(source)`,
 * pass to useFromFloor, then `flushAutoIssue` before the transaction ends.
 */
const autoIssue = (source) => ({ voucherId: new mongoose.Types.ObjectId(), voucherNumber: null, lines: [], source });

/**
 * Uses `quantity` of a production-stock material for finished goods, inside the caller's
 * transaction: oldest floor lots first; a shortfall is issued from the store on the spot
 * (setting floorShortfall 'auto_issue') or refused ('block'). → { parts, cost }
 */
const useFromFloor = async (ctx, item, quantity, { refType, refId, productionOrderId, settings, auto, session }) => {
  const have = await balanceOf(ctx, item.product._id, session);
  const short = roundQty(quantity - have);
  if (short > EPS) {
    if (!settings || settings.floorShortfall === 'block' || !auto) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Production stock has only ${have} ${item.unit} of "${item.name}" but ${roundQty(
          quantity
        )} is needed — issue ${short} more to production stock first`
      );
    }
    if (!auto.voucherNumber) {
      // In the caller's transaction (no gap if it rolls back); settings exist already.
      // eslint-disable-next-line no-param-reassign
      auto.voucherNumber = await settingsService.nextDocumentNumber(ctx.organizationId, 'floorIssue', { session });
    }
    let issued;
    try {
      issued = await issueFromStore(ctx, item, short, { voucherId: auto.voucherId, issuedAt: new Date(), session });
    } catch (err) {
      if (err.statusCode !== httpStatus.BAD_REQUEST) throw err;
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Not enough "${item.name}": production stock has ${have} ${item.unit} and the store ${roundQty(
          item.available
        )}, ${roundQty(quantity)} needed`
      );
    }
    auto.lines.push({
      productId: item.product._id,
      variantId: plainVariantId(item),
      productName: item.name,
      unit: item.unit,
      quantity: short,
      unitCost: issued.cost / short,
      totalCost: issued.cost,
      batches: issued.batches,
      floorParts: issued.floorParts,
    });
  }
  const parts = await takeFromFloor(ctx, item, quantity, {
    type: 'floor_consume',
    refType,
    refId,
    productionOrderId,
    session,
  });
  return { parts, cost: partsCost(parts) };
};

/** Writes the automatic issue voucher collected while using production stock, if any. */
const flushAutoIssue = async (ctx, auto, session) => {
  if (!auto || !auto.lines.length) return null;
  const [voucher] = await FloorStockVoucher.create(
    [
      {
        _id: auto.voucherId,
        organizationId: ctx.organizationId,
        branchId: ctx.branchId,
        voucherNumber: auto.voucherNumber,
        kind: 'issue',
        voucherDate: new Date(),
        auto: true,
        source: auto.source,
        lines: auto.lines.map((l) => ({ ...l, unitCost: roundMoney(l.unitCost), totalCost: roundMoney(l.totalCost) })),
        totalCost: roundMoney(auto.lines.reduce((s, l) => s + l.totalCost, 0)),
        notes: `Issued automatically — production stock was short for ${auto.source.number || 'this receipt'}`,
        createdBy: ctx.createdBy,
        createdByName: await userName(ctx.createdBy, session),
      },
    ],
    { session }
  );
  return voucher;
};

/** Puts used production stock back on the floor (a reversed receipt, a cancelled packing). */
const restoreToFloor = async (ctx, productId, parts, { refType, refId, productionOrderId, session }) => {
  const item = await stockService.resolveItem({
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    productId,
    session,
  });
  // eslint-disable-next-line no-restricted-syntax
  for (const part of parts) {
    // eslint-disable-next-line no-await-in-loop
    await addLot(ctx, item, part, { type: 'floor_consume', refType, refId, productionOrderId, session });
  }
};

/* ── Vouchers: issue, return, count ───────────────────────────────────────────── */

const normalizeLines = (lines, field) => {
  const wanted = (lines || []).filter(
    (l) => l && l.productId && Number(l[field]) >= 0 && l[field] !== '' && l[field] != null
  );
  const seen = new Set();
  wanted.forEach((l) => {
    const key = String(l.productId);
    if (seen.has(key)) throw new ApiError(httpStatus.BAD_REQUEST, 'The same material is entered twice — put it on one line');
    seen.add(key);
  });
  return wanted;
};

const createVoucher = async (ctx, doc, session) => {
  const [voucher] = await FloorStockVoucher.create(
    [
      {
        organizationId: ctx.organizationId,
        branchId: ctx.branchId,
        createdBy: ctx.createdBy,
        createdByName: await userName(ctx.createdBy, session),
        ...doc,
        totalCost: roundMoney(doc.lines.reduce((s, l) => s + (l.totalCost || 0), 0)),
      },
    ],
    { session }
  );
  return voucher;
};

/** Store → production stock, in bulk.  body: { lines: [{ productId, quantity }], voucherDate?, notes? } */
const postIssue = async (ctx, body) => {
  requireBranch(ctx.branchId);
  const wanted = normalizeLines(body.lines, 'quantity').filter((l) => Number(l.quantity) > 0);
  if (!wanted.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter how much of at least one material to issue');
  // Plain mistakes are refused before a number is taken (no gap in the PSI sequence).
  const products = await Product.find({ _id: { $in: wanted.map((l) => l.productId) }, ...scopeFilter(ctx) })
    .select('name issueMethod')
    .lean();
  const notFloor = products.find((p) => p.issueMethod !== 'floor');
  if (products.length !== wanted.length) throw new ApiError(httpStatus.NOT_FOUND, 'A material was not found in this branch');
  if (notFloor) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `"${notFloor.name}" is not a production-stock material — turn it on under Production Stock → Materials first`
    );
  }
  const voucherNumber = await settingsService.nextDocumentNumber(ctx.organizationId, KIND_COUNTER.issue);
  const voucherDate = atBusinessTimeOfDay(body.voucherDate) || new Date();
  return runTransaction(async (session) => {
    const voucherId = new mongoose.Types.ObjectId();
    const lines = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const l of wanted) {
      // eslint-disable-next-line no-await-in-loop
      const item = await resolveMaterial(ctx, l.productId, session);
      const quantity = roundQty(l.quantity);
      // eslint-disable-next-line no-await-in-loop
      const issued = await issueFromStore(ctx, item, quantity, { voucherId, issuedAt: voucherDate, session });
      lines.push({
        productId: item.product._id,
        variantId: plainVariantId(item),
        productName: item.name,
        unit: item.unit,
        quantity,
        unitCost: roundMoney(issued.cost / quantity),
        totalCost: issued.cost,
        batches: issued.batches,
        floorParts: issued.floorParts,
      });
    }
    return createVoucher(
      ctx,
      { _id: voucherId, voucherNumber, kind: 'issue', voucherDate, lines, notes: String(body.notes || '').trim() },
      session
    );
  });
};

/** Production stock → store (unused).  body: { lines: [{ productId, quantity }], voucherDate?, notes? } */
const postReturn = async (ctx, body) => {
  requireBranch(ctx.branchId);
  const wanted = normalizeLines(body.lines, 'quantity').filter((l) => Number(l.quantity) > 0);
  if (!wanted.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter how much of at least one material to return');
  const voucherNumber = await settingsService.nextDocumentNumber(ctx.organizationId, KIND_COUNTER.return);
  return runTransaction(async (session) => {
    const voucherId = new mongoose.Types.ObjectId();
    const ref = { refType: 'FloorStockVoucher', refId: voucherId };
    const lines = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const l of wanted) {
      // eslint-disable-next-line no-await-in-loop
      const item = await resolveMaterial(ctx, l.productId, session, { requireFloor: false });
      const quantity = roundQty(l.quantity);
      // eslint-disable-next-line no-await-in-loop
      const parts = await takeFromFloor(ctx, item, quantity, { type: 'floor_return', ...ref, session });
      // eslint-disable-next-line no-await-in-loop
      await restockParts(ctx, item, parts, { ...ref, session });
      const cost = partsCost(parts);
      lines.push({
        productId: item.product._id,
        variantId: plainVariantId(item),
        productName: item.name,
        unit: item.unit,
        quantity,
        unitCost: roundMoney(cost / quantity),
        totalCost: cost,
        floorParts: parts,
      });
    }
    return createVoucher(
      ctx,
      {
        _id: voucherId,
        voucherNumber,
        kind: 'return',
        voucherDate: atBusinessTimeOfDay(body.voucherDate) || new Date(),
        lines,
        notes: String(body.notes || '').trim(),
      },
      session
    );
  });
};

/**
 * Physical count of production stock.  body: { lines: [{ productId, countedQuantity }],
 * reason?, voucherDate?, notes? }. Per line the difference to the book quantity (at the
 * moment of posting) is posted: less = wastage / loss, more = found.
 */
const postCount = async (ctx, body) => {
  requireBranch(ctx.branchId);
  const wanted = normalizeLines(body.lines, 'countedQuantity');
  if (!wanted.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter the counted quantity of at least one material');
  const voucherNumber = await settingsService.nextDocumentNumber(ctx.organizationId, KIND_COUNTER.count);
  return runTransaction(async (session) => {
    const voucherId = new mongoose.Types.ObjectId();
    const ref = { refType: 'FloorStockVoucher', refId: voucherId };
    const voucherDate = atBusinessTimeOfDay(body.voucherDate) || new Date();
    const lines = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const l of wanted) {
      // eslint-disable-next-line no-await-in-loop
      const item = await resolveMaterial(ctx, l.productId, session, { requireFloor: false });
      // eslint-disable-next-line no-await-in-loop
      const lots = await lotsOf(ctx, item.product._id, session);
      const book = roundQty(lots.reduce((s, lot) => s + lot.quantity, 0));
      const counted = roundQty(l.countedQuantity);
      const diff = roundQty(counted - book);
      let floorParts;
      let cost = 0;
      if (diff < -EPS) {
        // eslint-disable-next-line no-await-in-loop
        floorParts = await takeFromFloor(ctx, item, -diff, { type: 'floor_adjust', ...ref, session });
        cost = -partsCost(floorParts);
      } else if (diff > EPS) {
        // Found: valued like the newest lot on the floor, else the store cost.
        const last = lots[lots.length - 1];
        const part = {
          lotId: new mongoose.Types.ObjectId(),
          voucherId,
          batchId: null,
          quantity: diff,
          unitCost: last ? last.unitCost : item.unitCost || 0,
          issuedAt: voucherDate,
        };
        // eslint-disable-next-line no-await-in-loop
        await addLot(ctx, item, part, { type: 'floor_adjust', ...ref, session });
        floorParts = [part];
        cost = partsCost(floorParts);
      }
      lines.push({
        productId: item.product._id,
        variantId: plainVariantId(item),
        productName: item.name,
        unit: item.unit,
        quantity: diff,
        bookQuantity: book,
        countedQuantity: counted,
        unitCost: diff ? roundMoney(Math.abs(cost / diff)) : 0,
        totalCost: roundMoney(cost),
        floorParts,
      });
    }
    return createVoucher(
      ctx,
      {
        _id: voucherId,
        voucherNumber,
        kind: 'count',
        voucherDate,
        lines,
        reason: String(body.reason || '').trim(),
        notes: String(body.notes || '').trim(),
      },
      session
    );
  });
};

/** Takes back exactly the lots a voucher put on the floor — refused once any was used. */
const takeBackLots = async (ctx, item, voucher, parts, { type, session }) => {
  // eslint-disable-next-line no-restricted-syntax
  for (const part of parts) {
    // eslint-disable-next-line no-await-in-loop
    const lot = await FloorStockLot.findOneAndUpdate(
      { _id: part.lotId, quantity: { $gte: part.quantity - EPS } },
      { $inc: { quantity: -part.quantity } },
      { new: true, session }
    );
    if (!lot) {
      throw new ApiError(
        httpStatus.CONFLICT,
        `Cannot cancel ${voucher.voucherNumber}: some of its "${item.name}" was already used in production — post a return or a count instead`
      );
    }
    // eslint-disable-next-line no-await-in-loop
    await writeFloor(item, ctx, {
      type,
      delta: -part.quantity,
      // eslint-disable-next-line no-await-in-loop
      balanceAfter: await balanceOf(ctx, item.product._id, session),
      unitCost: part.unitCost,
      refType: 'FloorStockVoucherReversal',
      refId: voucher._id,
      batchId: part.batchId,
      session,
    });
  }
};

/** Cancels a voucher: every movement is put back exactly; the voucher is kept, marked. */
const cancelVoucher = async (ctx, voucherId, { reason } = {}) => {
  requireBranch(ctx.branchId);
  const text = String(reason || '').trim();
  if (!text) throw new ApiError(httpStatus.BAD_REQUEST, 'Give a reason for cancelling');
  return runTransaction(async (session) => {
    const voucher = await FloorStockVoucher.findOne({
      _id: voucherId,
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
    }).session(session);
    if (!voucher) throw new ApiError(httpStatus.NOT_FOUND, 'Production stock voucher not found');
    if (voucher.status === 'cancelled')
      throw new ApiError(httpStatus.BAD_REQUEST, `${voucher.voucherNumber} is already cancelled`);
    const ref = { refType: 'FloorStockVoucherReversal', refId: voucher._id };
    // eslint-disable-next-line no-restricted-syntax
    for (const line of voucher.lines) {
      // eslint-disable-next-line no-await-in-loop
      const item = await stockService.resolveItem({ ...ctx, productId: line.productId, session });
      const parts = (line.floorParts || []).map((p) => p.toObject());
      if (voucher.kind === 'issue') {
        // eslint-disable-next-line no-await-in-loop
        await takeBackLots(ctx, item, voucher, parts, { type: 'floor_in', session });
        const back = line.batches && line.batches.length ? line.batches : parts;
        // eslint-disable-next-line no-restricted-syntax
        for (const b of back) {
          const batchId = item.batchTracked ? b.batchId || null : null;
          // eslint-disable-next-line no-await-in-loop
          const balanceAfter = await stockService.applyAvailableDelta(item, b.quantity, { batchId, session });
          // eslint-disable-next-line no-await-in-loop
          await stockService.writeMovement(item, {
            ...ctx,
            ...ref,
            type: 'floor_issue',
            delta: b.quantity,
            balanceAfter,
            unitCost: b.unitCost,
            batchId,
            session,
          });
        }
      } else if (voucher.kind === 'return') {
        // eslint-disable-next-line no-restricted-syntax
        for (const p of parts) {
          const batchId = item.batchTracked ? p.batchId || null : null;
          let balanceAfter;
          try {
            // eslint-disable-next-line no-await-in-loop
            balanceAfter = await stockService.applyAvailableDelta(item, -p.quantity, { batchId, session });
          } catch (err) {
            throw new ApiError(
              httpStatus.CONFLICT,
              `Cannot cancel ${voucher.voucherNumber}: the returned "${item.name}" is no longer in the store`
            );
          }
          // eslint-disable-next-line no-await-in-loop
          await stockService.writeMovement(item, {
            ...ctx,
            ...ref,
            type: 'floor_restock',
            delta: -p.quantity,
            balanceAfter,
            unitCost: p.unitCost,
            batchId,
            session,
          });
          // eslint-disable-next-line no-await-in-loop
          await addLot(ctx, item, p, { type: 'floor_return', ...ref, session });
        }
      } else if (line.quantity < -EPS) {
        // Count loss: the lots come back.
        // eslint-disable-next-line no-restricted-syntax
        for (const p of parts) {
          // eslint-disable-next-line no-await-in-loop
          await addLot(ctx, item, p, { type: 'floor_adjust', ...ref, session });
        }
      } else if (line.quantity > EPS) {
        // eslint-disable-next-line no-await-in-loop
        await takeBackLots(ctx, item, voucher, parts, { type: 'floor_adjust', session });
      }
    }
    voucher.status = 'cancelled';
    voucher.cancelledAt = new Date();
    voucher.cancelledBy = { userId: ctx.createdBy, name: await userName(ctx.createdBy, session) };
    voucher.cancelReason = text;
    await voucher.save({ session });
    return voucher;
  });
};

/* ── Which materials live in production stock ─────────────────────────────────── */

/**
 * Turns production stock on/off for materials.  body: { productIds, issueMethod }.
 * Open orders that use them follow at once (their material lines' `supply`), so the next
 * receipt already draws from the floor. Turning it off is refused while the floor still
 * holds some — return it or count it out first, so nothing is stranded there.
 */
const setIssueMethod = async (ctx, { productIds, issueMethod }) => {
  requireBranch(ctx.branchId);
  const ids = [...new Set((productIds || []).map(String))];
  if (!ids.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Choose at least one material');
  const products = await Product.find({ _id: { $in: ids }, organizationId: ctx.organizationId, branchId: ctx.branchId })
    .select('name hasVariants trackImei trackSerial productType issueMethod')
    .lean();
  if (products.length !== ids.length)
    throw new ApiError(httpStatus.NOT_FOUND, 'Some products were not found in this branch');
  const toFloor = issueMethod === 'floor';
  if (toFloor) {
    // eslint-disable-next-line no-restricted-syntax
    for (const p of products) {
      const variantCount = p.hasVariants ? (await stockService.soleVariant(p)).variants.length : 0; // eslint-disable-line no-await-in-loop
      const problem = floorProblem(p, variantCount);
      if (problem) throw new ApiError(httpStatus.BAD_REQUEST, `${problem} — it can't be kept in production stock`);
    }
  } else {
    const held = await balances(ctx, ids);
    const stuck = products.filter((p) => (held.get(String(p._id)) || { quantity: 0 }).quantity > EPS);
    if (stuck.length) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `${stuck.map((p) => p.name).join(', ')} still ${
          stuck.length > 1 ? 'have' : 'has'
        } stock in production — return it to the store or count it out first`
      );
    }
  }
  const objectIds = ids.map(oid);
  await Product.updateMany({ _id: { $in: objectIds } }, { $set: { issueMethod: toFloor ? 'floor' : 'order' } });
  const supply = toFloor ? 'floor' : 'order';
  const orders = await ProductionOrder.updateMany(
    {
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
      status: { $in: OPEN_PRODUCTION_STATUSES },
      'materials.productId': { $in: objectIds },
    },
    { $set: { 'materials.$[m].supply': supply } },
    { arrayFilters: [{ 'm.productId': { $in: objectIds } }] }
  );
  return { updated: products.length, issueMethod: supply, ordersUpdated: orders.modifiedCount || 0 };
};

/** Products that could be production-stock materials, for the Materials setup sheet. */
const getMaterialChoices = async (ctx, { search } = {}) => {
  const query = {
    ...scopeFilter(ctx),
    isActive: { $ne: false },
    trackImei: { $ne: true },
    trackSerial: { $ne: true },
    productType: { $in: ['raw_material', 'packaging_material', 'component', 'sub_assembly', null] },
  };
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    query.$or = [{ name: rx }, { sku: rx }];
  }
  const products = await Product.find(query)
    .select('name sku unit productType issueMethod stockQuantity hasVariants')
    .sort({ issueMethod: -1, productType: 1, name: 1 })
    .limit(1000)
    .lean();
  return products.map((p) => ({
    id: String(p._id),
    name: p.name,
    sku: p.sku || '',
    unit: p.unit,
    productType: p.productType || null,
    isFloor: p.issueMethod === 'floor',
  }));
};

/* ── Reading ──────────────────────────────────────────────────────────────────── */

const periodOf = ({ dateFrom, dateTo } = {}) => ({
  from: dateFrom ? parseBusinessDateBoundary(dateFrom) : null,
  to: dateTo ? parseBusinessDateBoundary(dateTo, true) : null,
});

/**
 * Every production-stock movement of the given products, from the documents (so each
 * keeps its own date): issues, returns, counts, and use by receipts and packing.
 * → [{ productId, date, kind, quantity (signed, as seen from the floor), number, … }]
 */
const floorMovements = async (ctx, productIds, { until = null } = {}) => {
  const scope = aggregateScope(ctx);
  const pids = productIds.map(oid);
  const before = (field) => (until ? { [field]: { $lte: until } } : {});
  const [vouchers, outputs, packings] = await Promise.all([
    FloorStockVoucher.aggregate([
      { $match: { ...scope, status: 'posted', 'lines.productId': { $in: pids }, ...before('voucherDate') } },
      { $unwind: '$lines' },
      { $match: { 'lines.productId': { $in: pids } } },
      {
        $project: {
          voucherNumber: 1,
          kind: 1,
          auto: 1,
          source: 1,
          voucherDate: 1,
          reason: 1,
          createdByName: 1,
          productId: '$lines.productId',
          quantity: '$lines.quantity',
          bookQuantity: '$lines.bookQuantity',
          countedQuantity: '$lines.countedQuantity',
          totalCost: '$lines.totalCost',
        },
      },
    ]),
    ProductionOutput.aggregate([
      {
        $match: {
          ...scope,
          status: { $ne: 'reversed' },
          'consumption.source': 'floor',
          'consumption.productId': { $in: pids },
          ...before('reportedAt'),
        },
      },
      { $unwind: '$consumption' },
      { $match: { 'consumption.source': 'floor', 'consumption.productId': { $in: pids } } },
      {
        $group: {
          _id: { output: '$_id', productId: '$consumption.productId' },
          outputNumber: { $first: '$outputNumber' },
          orderNumber: { $first: '$orderNumber' },
          fgProductId: { $first: '$productId' },
          fgName: { $first: '$productName' },
          fgUnit: { $first: '$unit' },
          produced: { $first: '$producedQuantity' },
          date: { $first: '$reportedAt' },
          quantity: { $sum: '$consumption.quantity' },
          cost: { $sum: '$consumption.cost' },
        },
      },
    ]),
    PackingVoucher.aggregate([
      {
        $match: {
          ...scope,
          status: 'posted',
          'consumed.source': 'floor',
          'consumed.productId': { $in: pids },
          ...before('packingDate'),
        },
      },
      { $unwind: '$consumed' },
      { $match: { 'consumed.source': 'floor', 'consumed.productId': { $in: pids } } },
      {
        $project: {
          voucherNumber: 1,
          orderNumber: 1,
          packingDate: 1,
          productName: 1,
          productId: '$consumed.productId',
          quantity: '$consumed.quantity',
          cost: '$consumed.totalCost',
          uses: '$consumed.uses',
        },
      },
    ]),
  ]);

  const rows = [];
  vouchers.forEach((v) => {
    const base = {
      productId: String(v.productId),
      date: v.voucherDate,
      number: v.voucherNumber,
      refType: 'FloorStockVoucher',
      refId: String(v._id),
      by: v.createdByName || '',
      cost: v.totalCost || 0,
    };
    if (v.kind === 'issue') {
      rows.push({
        ...base,
        kind: v.auto ? 'auto_issue' : 'issue',
        quantity: v.quantity,
        note: v.auto && v.source ? `Auto — floor was short for ${v.source.number || ''}`.trim() : '',
      });
    } else if (v.kind === 'return')
      rows.push({ ...base, kind: 'return', quantity: -v.quantity, cost: -base.cost, note: '' });
    else {
      rows.push({
        ...base,
        kind: 'count',
        quantity: v.quantity,
        note: `Counted ${roundQty(v.countedQuantity)} · book ${roundQty(v.bookQuantity)}${v.reason ? ` · ${v.reason}` : ''}`,
      });
    }
  });
  outputs.forEach((o) =>
    rows.push({
      productId: String(o._id.productId),
      date: o.date,
      kind: 'used',
      quantity: -o.quantity,
      cost: -(o.cost || 0),
      number: o.outputNumber,
      refType: 'ProductionOutput',
      refId: String(o._id.output),
      orderNumber: o.orderNumber,
      usedFor: [{ productId: String(o.fgProductId), name: o.fgName, quantity: o.quantity }],
      note: `${roundQty(o.produced)} ${o.fgUnit || ''} ${o.fgName}`.trim(),
    })
  );
  packings.forEach((p) => {
    const uses = (p.uses || []).length
      ? p.uses.map((u) => ({ productId: String(u.productId), name: u.productName || u.packName, quantity: u.quantity }))
      : [{ productId: '', name: `${p.productName} (packing)`, quantity: p.quantity }];
    rows.push({
      productId: String(p.productId),
      date: p.packingDate,
      kind: 'used',
      quantity: -p.quantity,
      cost: -(p.cost || 0),
      number: p.voucherNumber,
      refType: 'PackingVoucher',
      refId: String(p._id),
      orderNumber: p.orderNumber || '',
      usedFor: uses,
      note: `Packing ${p.productName}`,
    });
  });
  rows.sort((a, b) => new Date(a.date) - new Date(b.date) || String(a.number).localeCompare(String(b.number)));
  return rows;
};

/** Production-stock materials: flagged ones, plus anything still holding floor stock. */
const floorProductIds = async (ctx) => {
  const [flagged, held] = await Promise.all([
    Product.find({ ...scopeFilter(ctx), issueMethod: 'floor' })
      .select('_id')
      .lean(),
    FloorStockLot.distinct('productId', { ...scopeFilter(ctx), quantity: { $gt: EPS } }),
  ]);
  return [...new Set([...flagged.map((p) => String(p._id)), ...held.map(String)])];
};

/** Still to use by open orders' floor lines, per product. */
const openOrderNeeds = async (ctx, productIds) => {
  const rows = await ProductionOrder.aggregate([
    {
      $match: {
        ...aggregateScope(ctx),
        status: { $in: OPEN_PRODUCTION_STATUSES },
        'materials.productId': { $in: productIds.map(oid) },
      },
    },
    { $unwind: '$materials' },
    { $match: { 'materials.supply': 'floor', 'materials.productId': { $in: productIds.map(oid) } } },
    {
      $group: {
        _id: '$materials.productId',
        quantity: {
          $sum: {
            $max: [0, { $subtract: ['$materials.requiredQuantity', { $ifNull: ['$materials.consumedQuantity', 0] }] }],
          },
        },
        orders: { $addToSet: '$orderNumber' },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), { quantity: roundQty(r.quantity), orders: r.orders.length }]));
};

const addUse = (map, use) => {
  const key = use.productId || use.name;
  const entry = map.get(key) || { productId: use.productId, name: use.name, quantity: 0 };
  entry.quantity = roundQty(entry.quantity + use.quantity);
  map.set(key, entry);
};

/**
 * The reconciliation: per material, for the period — opening, issued (of which auto),
 * used (and by which finished goods), returned, count difference, closing — plus what is
 * in production stock now, what open orders still need, and the store's stock.
 */
const getOverview = async (ctx, query = {}) => {
  const { from, to } = periodOf(query);
  const ids = await floorProductIds(ctx);
  if (!ids.length) return { rows: [], totals: null, period: { from, to } };
  const [products, movements, now, needs] = await Promise.all([
    Product.find({ _id: { $in: ids } })
      .select('name sku unit productType issueMethod')
      .lean(),
    floorMovements(ctx, ids, { until: to }),
    balances(ctx, ids),
    openOrderNeeds(ctx, ids),
  ]);
  const store = await stockService.getAvailability({
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    items: ids.map((productId) => ({ productId })),
  });
  const rows = new Map(
    products.map((p) => [
      String(p._id),
      {
        productId: String(p._id),
        name: p.name,
        sku: p.sku || '',
        unit: p.unit,
        productType: p.productType || null,
        isFloor: p.issueMethod === 'floor',
        opening: 0,
        issued: 0,
        autoIssued: 0,
        used: 0,
        returned: 0,
        countDiff: 0,
        closing: 0,
        usedFor: new Map(),
        usedCost: 0,
      },
    ])
  );
  movements.forEach((m) => {
    const r = rows.get(m.productId);
    if (!r) return;
    if (from && new Date(m.date) < from) {
      r.opening = roundQty(r.opening + m.quantity);
      return;
    }
    if (m.kind === 'issue' || m.kind === 'auto_issue') {
      r.issued = roundQty(r.issued + m.quantity);
      if (m.kind === 'auto_issue') r.autoIssued = roundQty(r.autoIssued + m.quantity);
    } else if (m.kind === 'return') r.returned = roundQty(r.returned - m.quantity);
    else if (m.kind === 'count') r.countDiff = roundQty(r.countDiff + m.quantity);
    else if (m.kind === 'used') {
      r.used = roundQty(r.used - m.quantity);
      r.usedCost = roundMoney(r.usedCost - m.cost);
      m.usedFor.forEach((u) => addUse(r.usedFor, u));
    }
  });
  const list = [...rows.values()]
    .map((r) => {
      const inStock = now.get(r.productId) || { quantity: 0, value: 0 };
      const need = needs.get(r.productId) || { quantity: 0, orders: 0 };
      const closing = roundQty(r.opening + r.issued - r.used - r.returned + r.countDiff);
      return {
        ...r,
        closing,
        usedFor: [...r.usedFor.values()].sort((a, b) => b.quantity - a.quantity),
        inProduction: inStock.quantity,
        inProductionValue: inStock.value,
        storeQuantity: roundQty(store.get(`${r.productId}:`) || 0),
        openOrderNeed: need.quantity,
        openOrders: need.orders,
      };
    })
    .sort((a, b) => Number(b.isFloor) - Number(a.isFloor) || a.name.localeCompare(b.name));
  const sum = (field) => roundQty(list.reduce((s, r) => s + (r[field] || 0), 0));
  return {
    rows: list,
    totals: {
      materials: list.length,
      inProductionValue: roundMoney(list.reduce((s, r) => s + r.inProductionValue, 0)),
      usedCost: roundMoney(list.reduce((s, r) => s + r.usedCost, 0)),
      issued: sum('issued'),
      used: sum('used'),
      autoIssued: sum('autoIssued'),
      wastage: roundQty(-list.reduce((s, r) => s + Math.min(0, r.countDiff), 0)),
      short: list.filter((r) => r.isFloor && r.openOrderNeed > r.inProduction + EPS).length,
    },
    period: { from, to },
  };
};

/** One material's production stock: summary, use by finished good, every movement with a running balance. */
const getMaterial = async (ctx, productId, query = {}) => {
  const { from, to } = periodOf(query);
  const product = await Product.findOne({ _id: productId, ...scopeFilter(ctx) })
    .select('name sku unit productType issueMethod')
    .lean();
  if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  const id = String(product._id);
  const [movements, now, needs, lots] = await Promise.all([
    floorMovements(ctx, [id], { until: to }),
    balances(ctx, [id]),
    openOrderNeeds(ctx, [id]),
    FloorStockLot.find({ ...scopeFilter(ctx), productId: product._id, quantity: { $gt: EPS } })
      .sort({ issuedAt: 1 })
      .select('quantity unitCost batchNumber issuedAt voucherId')
      .populate({ path: 'voucherId', select: 'voucherNumber kind auto' })
      .lean(),
  ]);
  let opening = 0;
  let balance = 0;
  const rows = [];
  const usedFor = new Map();
  movements.forEach((m) => {
    balance = roundQty(balance + m.quantity);
    if (from && new Date(m.date) < from) {
      opening = balance;
      return;
    }
    if (m.kind === 'used') m.usedFor.forEach((u) => addUse(usedFor, u));
    rows.push({ ...m, balance });
  });
  return {
    product: {
      id,
      name: product.name,
      sku: product.sku || '',
      unit: product.unit,
      productType: product.productType || null,
      isFloor: product.issueMethod === 'floor',
    },
    opening,
    closing: balance,
    inProduction: (now.get(id) || { quantity: 0 }).quantity,
    inProductionValue: (now.get(id) || { value: 0 }).value,
    openOrderNeed: (needs.get(id) || { quantity: 0 }).quantity,
    usedFor: [...usedFor.values()].sort((a, b) => b.quantity - a.quantity),
    lots: lots.map((l) => ({
      id: String(l._id),
      quantity: roundQty(l.quantity),
      unitCost: l.unitCost,
      batchNumber: l.batchNumber || '',
      issuedAt: l.issuedAt,
      voucherNumber: l.voucherId ? l.voucherId.voucherNumber : '',
    })),
    movements: rows.reverse(),
  };
};

/**
 * Production-stock lines of an issue screen (order requirements / new-order plan): what
 * the floor holds now, what this order will still use from it, and what the voucher
 * should offer to issue (the requirement still open, less what the floor covers).
 */
const annotateFloorLines = async (ctx, lines) => {
  const floorLines = lines.filter((l) => l.supply === 'floor');
  if (!floorLines.length) return lines;
  const held = await balances(ctx, [...new Set(floorLines.map((l) => String(l.productId)))]);
  floorLines.forEach((l) => {
    /* eslint-disable no-param-reassign */
    l.floorQuantity = (held.get(String(l.productId)) || { quantity: 0 }).quantity;
    l.floorNeed = Math.max(0, roundQty(l.requiredQuantity - (l.consumedQuantity || 0)));
    // The voucher offers the line like any other: what the requirement still lacks, less
    // what the floor already holds (the receipt uses that first).
    l.openQuantity = Math.max(
      0,
      roundQty(l.requiredQuantity - (l.issuedQuantity || 0) + (l.returnedQuantity || 0) + (l.scrappedQuantity || 0))
    );
    l.outstandingQuantity = Math.max(0, roundQty(l.openQuantity - l.floorQuantity));
    l.shortageQuantity = l.isOptional ? 0 : Math.max(0, roundQty(l.outstandingQuantity - Math.max(0, l.availableQuantity)));
    /* eslint-enable no-param-reassign */
  });
  return lines;
};

/**
 * What the last receipt of a product recorded as packing used beyond its recipe, per unit
 * made — the receive dialog starts from it (90 made × 1 bottle per unit = 90 bottles).
 */
const getUsageTemplate = async (ctx, productId) => {
  const output = await ProductionOutput.findOne({
    ...scopeFilter(ctx),
    productId,
    status: { $ne: 'reversed' },
    'consumption.extra': true,
  })
    .sort({ reportedAt: -1, createdAt: -1 })
    .select('producedQuantity consumption outputNumber')
    .lean();
  if (!output || !(output.producedQuantity > 0)) return { lines: [] };
  const per = new Map();
  output.consumption
    .filter((c) => c.extra)
    .forEach((c) => {
      const key = String(c.productId);
      const e = per.get(key) || { productId: key, name: c.productName, unit: c.unit, quantity: 0 };
      e.quantity = roundQty(e.quantity + c.quantity);
      per.set(key, e);
    });
  const flagged = new Set(
    (
      await Product.find({ _id: { $in: [...per.keys()].map(oid) }, issueMethod: 'floor' })
        .select('_id')
        .lean()
    ).map((p) => String(p._id))
  );
  return {
    fromOutput: output.outputNumber,
    lines: [...per.values()]
      .filter((e) => flagged.has(e.productId))
      .map((e) => ({ ...e, perUnit: roundQty(e.quantity / output.producedQuantity) })),
  };
};

/** Pickers of the issue / return / count dialogs: floor materials with store and floor stock. */
const getPickList = async (ctx) => {
  const ids = await floorProductIds(ctx);
  if (!ids.length) return [];
  const [products, now] = await Promise.all([
    Product.find({ _id: { $in: ids } })
      .select('name sku unit productType issueMethod cost')
      .sort({ name: 1 })
      .lean(),
    balances(ctx, ids),
  ]);
  const store = await stockService.getAvailability({
    organizationId: ctx.organizationId,
    branchId: ctx.branchId,
    items: ids.map((productId) => ({ productId })),
  });
  return products.map((p) => ({
    id: String(p._id),
    name: p.name,
    sku: p.sku || '',
    unit: p.unit,
    productType: p.productType || null,
    isFloor: p.issueMethod === 'floor',
    storeQuantity: roundQty(store.get(`${p._id}:`) || 0),
    inProduction: (now.get(String(p._id)) || { quantity: 0 }).quantity,
    unitCost: (() => {
      const held = now.get(String(p._id));
      return held && held.quantity > EPS ? roundMoney(held.value / held.quantity) : roundMoney(p.cost || 0);
    })(),
  }));
};

const listVouchers = async (ctx, q = {}) => {
  const filter = { ...scopeFilter(ctx) };
  if (q.kind && q.kind !== 'all') filter.kind = q.kind;
  if (q.status && q.status !== 'all') filter.status = q.status;
  if (q.productId) filter['lines.productId'] = q.productId;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [{ voucherNumber: rx }, { 'lines.productName': rx }, { notes: rx }, { 'source.number': rx }];
  }
  const { from, to } = periodOf(q);
  if (from || to) filter.voucherDate = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  return FloorStockVoucher.paginate(filter, {
    sortBy: 'voucherDate:desc,createdAt:desc',
    page: q.page,
    limit: q.limit || 25,
  });
};

const getVoucher = async (ctx, voucherId) => {
  const voucher = await FloorStockVoucher.findOne({ _id: voucherId, ...scopeFilter(ctx) });
  if (!voucher) throw new ApiError(httpStatus.NOT_FOUND, 'Production stock voucher not found');
  return voucher;
};

module.exports = {
  floorProblem,
  balanceOf,
  balances,
  annotateFloorLines,
  autoIssue,
  useFromFloor,
  flushAutoIssue,
  restoreToFloor,
  postIssue,
  postReturn,
  postCount,
  cancelVoucher,
  setIssueMethod,
  getMaterialChoices,
  getOverview,
  getMaterial,
  getPickList,
  getUsageTemplate,
  listVouchers,
  getVoucher,
};
