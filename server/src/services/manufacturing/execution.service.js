const mongoose = require('mongoose');
const httpStatus = require('http-status');
const {
  ProductionOrder,
  MaterialIssue,
  ProductionReceipt,
  ProductionOutput,
  ScrapRecord,
  InventoryTransaction,
  Imei,
  Batch,
} = require('../../models');
const ApiError = require('../../utils/ApiError');
const { EXECUTABLE_PRODUCTION_STATUSES } = require('../../config/manufacturing');
const settingsService = require('./settings.service');
const stockService = require('./stock.service');
const wip = require('./wip');
const { roundQty, roundMoney, requireBranch, scopeFilter, escapeRegex, parseDateRange } = require('./common');

/*
 * Production flow, every step one MongoDB transaction:
 *
 *   RAW MATERIAL ──issue──▶ WIP ──output (backflush)──▶ QC ──inspect──▶ FINISHED GOODS
 *        ▲                   │                            └─ rejected ──▶ scrap | rework ──▶ FG / scrap
 *        └──── return ───────┘
 *
 * Stock lives where Logix Plus already keeps it; WIP/QC/rework are buckets of the same
 * InventoryTransaction ledger (see stock.service.js).
 */

const { EPS } = wip;

const assertExecutable = (order) => {
  if (!EXECUTABLE_PRODUCTION_STATUSES.includes(order.status)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Order ${order.orderNumber} is ${order.status.replace('_', ' ')} — it must be released (and not completed) for this`
    );
  }
};

/** Reject obviously-invalid requests before a document number is reserved for them. */
const precheckOrder = async ({ organizationId, branchId }, orderId) => {
  const order = await ProductionOrder.findOne({ _id: orderId, organizationId, branchId })
    .select('orderNumber status')
    .lean();
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
  assertExecutable(order);
  return order;
};

/** Released → In Production happens automatically on the first stock movement. */
const autoStart = (order, createdBy) => {
  if (order.status !== 'released') return;
  order.statusHistory.push({
    from: 'released',
    to: 'in_production',
    note: 'Started by first stock movement',
    by: createdBy,
    at: new Date(),
  });
  order.status = 'in_production'; // eslint-disable-line no-param-reassign
  if (!order.actualStartDate) order.actualStartDate = new Date(); // eslint-disable-line no-param-reassign
};

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

const loadOrder = async ({ organizationId, branchId }, orderId, session) => {
  const order = await ProductionOrder.findOne({ _id: orderId, organizationId, branchId }).session(session);
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
  return order;
};

/** Average purchase price of serial units (falls back to the item cost). */
const serialUnitCost = async (imeiIds, fallback, session) => {
  const units = await Imei.find({ _id: { $in: imeiIds } })
    .select('purchasePrice')
    .session(session)
    .lean();
  const priced = units.filter((u) => u.purchasePrice > 0);
  return priced.length ? roundMoney(priced.reduce((s, u) => s + u.purchasePrice, 0) / priced.length) : fallback;
};

const plainVariantId = (item) => (item.variant && !item.variant.isDefault ? item.variant._id : null);

// ── Material issue ──────────────────────────────────────────────────────────────────

/** Splits what an issue line moves into WIP lots: serial units, batch allocations, or a plain quantity. */
const resolveIssuePieces = async (item, input, { organizationId, branchId, session }) => {
  if (item.serial) {
    const units = await stockService.pickSerials(item, {
      organizationId,
      branchId,
      imeiIds: input.imeiIds,
      serialNumbers: input.serialNumbers,
      autoCount: input.autoPickSerials ? Math.round(input.quantity || 0) : 0,
      session,
    });
    if (input.quantity && Math.round(input.quantity) !== units.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Select exactly ${input.quantity} serial number(s) of "${item.name}"`);
    }
    const unitCost = await serialUnitCost(
      units.map((u) => u._id),
      item.unitCost,
      session
    );
    return [{ quantity: units.length, units, unitCost, batchId: null }];
  }
  if (item.batchTracked) {
    const allocations = await stockService.allocateBatches(item, roundQty(input.quantity), input.batches, session);
    return allocations.map((a) => ({
      quantity: a.quantity,
      batchId: a.batch._id,
      batchNumber: a.batch.batchNumber,
      unitCost: a.batch.costPerUnit ?? item.unitCost,
    }));
  }
  return [{ quantity: roundQty(input.quantity), unitCost: item.unitCost, batchId: null }];
};

/**
 * Issues components from branch stock into the order's WIP. Partial issues are normal —
 * a line can be issued in as many steps as needed. Issuing beyond what a line still needs
 * requires both `allowOverIssue` on the request (so it's never accidental) and the
 * overIssueMaterials permission (`canOverIssue`, resolved by the controller).
 *
 * Per line: `alternativeProductId` issues a listed substitute; batch-tracked items take
 * `batches: [{ batchId, quantity }]` or are allocated FEFO; serial-tracked items take
 * `imeiIds` / `serialNumbers` (quantity = number of units).
 */
const issueMaterials = async ({ organizationId, branchId, createdBy }, orderId, body, { canOverIssue = false } = {}) => {
  requireBranch(branchId);
  await precheckOrder({ organizationId, branchId }, orderId);
  const settings = await settingsService.getSettings(organizationId);
  const issueNumber = await settingsService.nextDocumentNumber(organizationId, 'materialIssue');

  return runTransaction(async (session) => {
    const order = await loadOrder({ organizationId, branchId }, orderId, session);
    assertExecutable(order);
    const issueId = new mongoose.Types.ObjectId();
    const lines = [];
    let isOverIssue = false;
    const seenLines = new Set();

    // eslint-disable-next-line no-restricted-syntax
    for (const input of body.lines) {
      const hasSerials = (input.imeiIds && input.imeiIds.length) || (input.serialNumbers && input.serialNumbers.length);
      if (!(input.quantity > 0) && !hasSerials) continue; // eslint-disable-line no-continue
      const material = order.materials.id(input.materialLineId);
      if (!material) throw new ApiError(httpStatus.BAD_REQUEST, 'Material line not found on this order');
      if (seenLines.has(String(material._id))) {
        throw new ApiError(httpStatus.BAD_REQUEST, `"${material.productName}" appears twice in this issue`);
      }
      seenLines.add(String(material._id));

      let { productId, variantId } = material;
      let ratio = 1;
      let isAlternative = false;
      if (input.alternativeProductId) {
        const alt = material.alternatives.find((a) => String(a.productId) === String(input.alternativeProductId));
        if (!alt)
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `That product is not a listed alternative for "${material.productName}"`
          );
        ({ productId, variantId } = alt);
        ratio = alt.ratio || 1;
        isAlternative = true;
      }

      // eslint-disable-next-line no-await-in-loop
      const item = await stockService.resolveItem({ organizationId, branchId, productId, variantId, session });
      // eslint-disable-next-line no-await-in-loop
      const pieces = await resolveIssuePieces(item, input, { organizationId, branchId, session });

      const physical = roundQty(pieces.reduce((s, p) => s + p.quantity, 0));
      const credited = roundQty(physical / ratio);
      const remaining = wip.lineRemaining(material);
      if (credited > remaining + EPS) {
        if (!body.allowOverIssue) {
          throw new ApiError(
            httpStatus.BAD_REQUEST,
            `"${material.productName}": issuing ${credited} ${material.unit} is more than the ${remaining} still required. Confirm an over-issue to continue.`
          );
        }
        if (!canOverIssue) {
          throw new ApiError(
            httpStatus.FORBIDDEN,
            'You do not have permission to issue more material than an order requires.'
          );
        }
        isOverIssue = true;
      }

      const lotVariantId = plainVariantId(item);
      let lineCost = 0;
      // eslint-disable-next-line no-restricted-syntax
      for (const piece of pieces) {
        const cost = roundMoney(piece.quantity * (piece.unitCost || 0));
        lineCost += cost;
        // eslint-disable-next-line no-await-in-loop
        const balanceAfter = await stockService.applyAvailableDelta(item, -piece.quantity, {
          batchId: item.serial ? null : piece.batchId,
          allowNegative: settings.allowNegativeStockIssue && !item.serial && !piece.batchId,
          session,
        });
        const imeiIds = piece.units ? piece.units.map((u) => u._id) : undefined;
        const serialNumbers = piece.units ? piece.units.map((u) => u.imei) : undefined;
        if (piece.units) {
          // eslint-disable-next-line no-await-in-loop
          await stockService.setSerialStatus(piece.units, {
            status: 'in_production',
            productionOrderId: order._id,
            note: `Issued to ${order.orderNumber} (${issueNumber})`,
            userId: createdBy,
            session,
          });
        }
        const lotId = new mongoose.Types.ObjectId();
        order.wipLots.push({
          _id: lotId,
          materialLineId: material._id,
          productId: item.product._id,
          variantId: lotVariantId,
          productName: item.name,
          unit: item.unit,
          batchId: piece.batchId,
          batchNumber: piece.batchNumber,
          imeiIds,
          serialNumbers,
          quantity: piece.quantity,
          ratio,
          isAlternative,
          unitCost: piece.unitCost,
          issueId,
          issuedAt: new Date(),
        });
        const common = {
          organizationId,
          branchId,
          unitCost: piece.unitCost,
          refType: 'MaterialIssue',
          refId: issueId,
          productionOrderId: order._id,
          batchId: piece.batchId,
          imeiIds,
          serialNumbers,
          createdBy,
          session,
        };
        // Paired rows: out of available stock, into this order's WIP.
        // eslint-disable-next-line no-await-in-loop
        await stockService.writeMovement(item, {
          ...common,
          type: 'production_issue',
          delta: -piece.quantity,
          balanceAfter,
          location: order.sourceLocation,
        });
        // eslint-disable-next-line no-await-in-loop
        await stockService.writeMovement(item, {
          ...common,
          type: 'wip_in',
          bucket: 'wip',
          delta: piece.quantity,
          balanceAfter: wip.wipBalanceOf(order, item.product._id, lotVariantId),
          location: order.wipLocation,
        });
        lines.push({
          materialLineId: material._id,
          productId: item.product._id,
          variantId: lotVariantId,
          productName: item.name,
          unit: item.unit,
          quantity: piece.quantity,
          creditedQuantity: roundQty(piece.quantity / ratio),
          isAlternative,
          unitCost: piece.unitCost,
          totalCost: cost,
          balanceAfter,
          batchId: piece.batchId,
          batchNumber: piece.batchNumber,
          imeiIds,
          serialNumbers,
          wipLotId: lotId,
        });
      }

      material.issuedQuantity = roundQty(material.issuedQuantity + credited);
      material.issuedCost = roundMoney(material.issuedCost + lineCost);
    }
    if (lines.length === 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter a quantity for at least one material');

    const totalCost = roundMoney(lines.reduce((sum, l) => sum + l.totalCost, 0));
    order.materialCost = roundMoney(order.materialCost + totalCost);
    autoStart(order, createdBy);
    order.updatedBy = createdBy;
    await order.save({ session });

    const [issue] = await MaterialIssue.create(
      [
        {
          _id: issueId,
          organizationId,
          branchId,
          issueNumber,
          kind: 'issue',
          isOverIssue,
          productionOrderId: order._id,
          orderNumber: order.orderNumber,
          issueDate: body.issueDate || new Date(),
          lines,
          totalCost,
          notes: body.notes || '',
          isDemo: !!order.isDemo,
          createdBy,
        },
      ],
      { session }
    );
    return issue;
  });
};

// ── Material return ─────────────────────────────────────────────────────────────────

/** Moves material from the order's WIP back to stock. Each line names a WIP lot (and serials). */
const returnMaterialsInTx = async (
  order,
  lines,
  { organizationId, branchId, createdBy, returnId, returnNumber, notes, session }
) => {
  const docLines = [];
  // eslint-disable-next-line no-restricted-syntax
  for (const input of lines) {
    const lot = order.wipLots.id(input.wipLotId);
    if (!lot || lot.quantity <= EPS) throw new ApiError(httpStatus.BAD_REQUEST, 'That material is no longer in WIP');
    const material = order.materials.id(lot.materialLineId);
    const isSerialLot = !!(lot.imeiIds && lot.imeiIds.length);

    let units;
    let imeiIds;
    let serialNumbers;
    if (isSerialLot) {
      const wanted =
        input.imeiIds && input.imeiIds.length
          ? input.imeiIds.map(String)
          : lot.imeiIds.slice(0, Math.round(input.quantity || 0)).map(String);
      const inLot = new Set(lot.imeiIds.map(String));
      if (!wanted.length || wanted.some((id) => !inLot.has(id))) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Pick serial numbers of "${lot.productName}" that are in this order’s WIP`
        );
      }
      const all = lot.imeiIds.map((id, i) => ({ id, number: lot.serialNumbers ? lot.serialNumbers[i] : undefined }));
      const leaving = all.filter((u) => wanted.includes(String(u.id)));
      const staying = all.filter((u) => !wanted.includes(String(u.id)));
      imeiIds = leaving.map((u) => u.id);
      serialNumbers = lot.serialNumbers ? leaving.map((u) => u.number) : undefined;
      units = imeiIds.length;
      lot.imeiIds = staying.map((u) => u.id);
      if (lot.serialNumbers) lot.serialNumbers = staying.map((u) => u.number);
      // eslint-disable-next-line no-await-in-loop
      await stockService.setSerialStatus(imeiIds, {
        status: 'in_stock',
        productionOrderId: null,
        note: `Returned from ${order.orderNumber} (${returnNumber})`,
        userId: createdBy,
        session,
      });
    } else {
      units = roundQty(input.quantity);
      if (!(units > 0)) continue; // eslint-disable-line no-continue
      if (units > lot.quantity + EPS) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Only ${roundQty(lot.quantity)} ${lot.unit} of "${lot.productName}" is in that WIP lot`
        );
      }
    }
    lot.quantity = roundQty(lot.quantity - units);

    // eslint-disable-next-line no-await-in-loop
    const item = await stockService.resolveItem({
      organizationId,
      branchId,
      productId: lot.productId,
      variantId: lot.variantId,
      session,
    });
    // eslint-disable-next-line no-await-in-loop
    const balanceAfter = await stockService.applyAvailableDelta(item, units, {
      batchId: isSerialLot ? null : lot.batchId,
      session,
    });
    const common = {
      organizationId,
      branchId,
      unitCost: lot.unitCost,
      refType: 'MaterialReturn',
      refId: returnId,
      productionOrderId: order._id,
      batchId: lot.batchId,
      imeiIds,
      serialNumbers,
      createdBy,
      session,
    };
    // eslint-disable-next-line no-await-in-loop
    await stockService.writeMovement(item, {
      ...common,
      type: 'wip_return',
      bucket: 'wip',
      delta: -units,
      balanceAfter: wip.wipBalanceOf(order, lot.productId, lot.variantId),
      location: order.wipLocation,
    });
    // eslint-disable-next-line no-await-in-loop
    await stockService.writeMovement(item, {
      ...common,
      type: 'production_return',
      delta: units,
      balanceAfter,
      location: order.sourceLocation,
    });

    const credited = roundQty(units / (lot.ratio || 1));
    const cost = roundMoney(units * (lot.unitCost || 0));
    material.returnedQuantity = roundQty(material.returnedQuantity + credited);
    order.materialCost = roundMoney(order.materialCost - cost); // eslint-disable-line no-param-reassign
    docLines.push({
      materialLineId: material._id,
      productId: lot.productId,
      variantId: lot.variantId,
      productName: lot.productName,
      unit: lot.unit,
      quantity: units,
      creditedQuantity: credited,
      isAlternative: lot.isAlternative,
      unitCost: lot.unitCost,
      totalCost: cost,
      balanceAfter,
      batchId: lot.batchId,
      batchNumber: lot.batchNumber,
      imeiIds,
      serialNumbers,
      wipLotId: lot._id,
    });
  }
  if (!docLines.length) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter a quantity for at least one WIP line');
  wip.pruneEmptyLots(order);

  const [doc] = await MaterialIssue.create(
    [
      {
        _id: returnId,
        organizationId,
        branchId,
        issueNumber: returnNumber,
        kind: 'return',
        productionOrderId: order._id,
        orderNumber: order.orderNumber,
        issueDate: new Date(),
        lines: docLines,
        totalCost: roundMoney(docLines.reduce((s, l) => s + l.totalCost, 0)),
        notes: notes || '',
        isDemo: !!order.isDemo,
        createdBy,
      },
    ],
    { session }
  );
  return doc;
};

const returnMaterials = async ({ organizationId, branchId, createdBy }, orderId, body) => {
  requireBranch(branchId);
  await precheckOrder({ organizationId, branchId }, orderId);
  const returnNumber = await settingsService.nextDocumentNumber(organizationId, 'materialReturn');
  return runTransaction(async (session) => {
    const order = await loadOrder({ organizationId, branchId }, orderId, session);
    assertExecutable(order);
    const doc = await returnMaterialsInTx(order, body.lines, {
      organizationId,
      branchId,
      createdBy,
      returnId: new mongoose.Types.ObjectId(),
      returnNumber,
      notes: body.notes,
      session,
    });
    order.updatedBy = createdBy;
    await order.save({ session });
    return doc;
  });
};

// ── Finished goods receipt (shared by inspection and rework) ────────────────────────

/**
 * Puts good output into available stock the way the product is normally tracked: a batch
 * (find-or-create by number, FEFO-visible like any purchased batch) for batch items, new
 * Imei records for serial items, a plain quantity otherwise. Creates the ProductionReceipt.
 */
const receiveGood = async (
  order,
  quantity,
  unitCost,
  { finishedGoods = {}, source, outputId, receiptNumber, organizationId, branchId, createdBy, notes, session }
) => {
  const item = await stockService.resolveItem({
    organizationId,
    branchId,
    productId: order.productId,
    variantId: order.variantId,
    session,
  });
  const receiptId = new mongoose.Types.ObjectId();
  const fg = finishedGoods || {};
  let batch = null;
  let createdUnits = [];

  if (item.serial) {
    const numbers = [...new Set((fg.serialNumbers || []).map((n) => String(n).trim()).filter(Boolean))];
    if (!Number.isInteger(quantity) || numbers.length !== quantity) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Enter ${quantity} unique serial/IMEI number(s) for the good units of "${item.name}"`
      );
    }
    const duplicates = await Imei.find({
      organizationId,
      branchId,
      status: { $nin: ['scrapped', 'consumed'] },
      $or: [{ imei: { $in: numbers } }, { imei2: { $in: numbers } }],
    })
      .select('imei')
      .session(session)
      .lean();
    if (duplicates.length) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Already in inventory: ${duplicates.map((d) => d.imei).join(', ')}`);
    }
    createdUnits = await Imei.insertMany(
      numbers.map((imei) => ({
        organizationId,
        branchId,
        imei,
        type: item.product.trackImei ? 'imei' : 'serial',
        productId: item.product._id,
        productName: item.product.name,
        productionOrderId: order._id,
        producedByOrderId: order._id,
        purchasePrice: unitCost,
        purchaseDate: new Date(),
        status: 'in_stock',
        createdBy,
        history: [
          {
            status: 'in_stock',
            note: `Produced on ${order.orderNumber} (${receiptNumber})`,
            at: new Date(),
            byUserId: createdBy,
          },
        ],
      })),
      { session }
    );
  } else if (item.batchTracked) {
    await stockService.ensureLedgerAnchor(item, session);
    const batchNumber = String(fg.batchNumber || order.orderNumber).trim();
    batch = await Batch.findOneAndUpdate(
      { organizationId, inventoryId: item.inventory._id, batchNumber },
      {
        $setOnInsert: {
          quantity: 0,
          costPerUnit: unitCost,
          productionOrderId: order._id,
          manufactureDate: fg.manufactureDate || new Date(),
          expiryDate: fg.expiryDate || null,
        },
        $set: { status: 'active' },
      },
      { upsert: true, new: true, session }
    );
  }

  const balanceAfter = await stockService.applyAvailableDelta(item, quantity, {
    batchId: batch ? batch._id : null,
    session,
  });
  const imeiIds = createdUnits.map((u) => u._id);
  const serialNumbers = createdUnits.map((u) => u.imei);
  const location = fg.location || order.finishedGoodsLocation;
  await stockService.writeMovement(item, {
    organizationId,
    branchId,
    type: 'production_receipt',
    delta: quantity,
    balanceAfter,
    unitCost,
    refType: 'ProductionReceipt',
    refId: receiptId,
    productionOrderId: order._id,
    location,
    batchId: batch ? batch._id : null,
    imeiIds,
    serialNumbers,
    createdBy,
    session,
  });

  order.completedQuantity = roundQty(order.completedQuantity + quantity); // eslint-disable-line no-param-reassign
  order.finishedGoodsValue = roundMoney(order.finishedGoodsValue + quantity * unitCost); // eslint-disable-line no-param-reassign

  const [receipt] = await ProductionReceipt.create(
    [
      {
        _id: receiptId,
        organizationId,
        branchId,
        receiptNumber,
        productionOrderId: order._id,
        orderNumber: order.orderNumber,
        productId: item.product._id,
        variantId: order.variantId,
        productName: item.name,
        unit: order.unit,
        quantity,
        unitCost,
        totalCost: roundMoney(quantity * unitCost),
        location,
        receiptDate: new Date(),
        balanceAfter,
        source,
        outputId: outputId || null,
        batchId: batch ? batch._id : null,
        batchNumber: batch ? batch.batchNumber : undefined,
        expiryDate: batch ? batch.expiryDate : null,
        imeiIds: imeiIds.length ? imeiIds : undefined,
        serialNumbers: serialNumbers.length ? serialNumbers : undefined,
        notes: notes || '',
        isDemo: !!order.isDemo,
        createdBy,
      },
    ],
    { session }
  );
  return receipt;
};

const createScrap = async (doc, session) => {
  const [scrap] = await ScrapRecord.create([doc], { session });
  return scrap;
};

/** Ledger row for a holding bucket (qc / rework) of the order's own product. */
const writeOutputBucket = async (order, entry) => {
  const { organizationId, branchId, session } = entry;
  const item = await stockService.resolveItem({
    organizationId,
    branchId,
    productId: order.productId,
    variantId: order.variantId,
    session,
  });
  await stockService.writeMovement(item, { ...entry, productionOrderId: order._id, location: order.wipLocation });
};

// ── Output, quality check, rework ───────────────────────────────────────────────────

/**
 * Backflushes the material a quantity of output used, out of WIP. Each line's cumulative
 * consumption follows its requirement in proportion to cumulative output, so the final
 * output consumes exactly what was required (no rounding drift). Optional lines consume
 * only what was actually issued.
 */
const backflush = async (order, producedQty, ctx) => {
  const cumulative = roundQty(order.producedQuantity + producedQty);
  const share = Math.min(1, cumulative / order.plannedQuantity);
  const consumption = [];
  let cost = 0;
  // eslint-disable-next-line no-restricted-syntax
  for (const material of order.materials) {
    let need = roundQty(material.requiredQuantity * share - material.consumedQuantity);
    const lots = wip.lotsForLine(order, material._id);
    if (lots.some((lot) => lot.imeiIds && lot.imeiIds.length)) need = Math.round(need);
    if (need <= EPS) continue; // eslint-disable-line no-continue
    const available = wip.lineWip(order, material);
    if (available + EPS < need) {
      if (!material.isOptional) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Not enough "${material.productName}" in WIP for this output: needs ${need} ${material.unit}, WIP holds ${available}. Issue the rest first.`
        );
      }
      need = available;
      if (need <= EPS) continue; // eslint-disable-line no-continue
    }
    // eslint-disable-next-line no-await-in-loop
    const taken = await wip.takeFromWip(order, material, need, {
      ...ctx,
      type: 'wip_consume',
      location: order.wipLocation,
      serialStatus: 'consumed',
      serialOrderId: order._id,
      serialNote: `Consumed by ${order.orderNumber}`,
    });
    const lineCost = roundMoney(taken.reduce((s, t) => s + t.cost, 0));
    material.consumedQuantity = roundQty(material.consumedQuantity + need);
    material.consumedCost = roundMoney(material.consumedCost + lineCost);
    cost += lineCost;
    taken.forEach((t) =>
      consumption.push({
        materialLineId: material._id,
        wipLotId: t.lot._id,
        productId: t.lot.productId,
        productName: t.lot.productName,
        unit: t.lot.unit,
        quantity: t.units,
        batchId: t.lot.batchId,
        imeiIds: t.imeiIds,
        cost: t.cost,
      })
    );
  }
  wip.pruneEmptyLots(order);
  return { consumption, cost: roundMoney(cost) };
};

/**
 * Posts an inspection result: good → finished stock, rejected → scrap or the rework
 * queue. `fromQc` = the units were waiting in the QC hold (two-step flow).
 */
const postInspection = async (order, output, result, ctx) => {
  /* eslint-disable no-param-reassign */
  const { organizationId, branchId, createdBy, session, receiptNumber, scrapNumber } = ctx;
  const { goodQuantity, rejectedQuantity, rejectDisposition, rejectReason, finishedGoods, fromQc, notes } = result;
  const produced = output.producedQuantity;
  if (goodQuantity < 0 || rejectedQuantity < 0 || Math.abs(roundQty(goodQuantity + rejectedQuantity) - produced) > EPS) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Good (${goodQuantity}) + rejected (${rejectedQuantity}) must equal the ${produced} produced`
    );
  }
  if (rejectedQuantity > EPS && !rejectDisposition) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Choose whether rejected units go to scrap or rework');
  }
  const { unitCost } = output;

  if (fromQc) {
    order.qcPendingQuantity = roundQty(order.qcPendingQuantity - produced);
    order.qcPendingCost =
      order.qcPendingQuantity > EPS ? roundMoney(Math.max(0, order.qcPendingCost - output.materialCost)) : 0;
    await writeOutputBucket(order, {
      organizationId,
      branchId,
      type: 'qc_out',
      bucket: 'qc',
      delta: -produced,
      balanceAfter: order.qcPendingQuantity,
      unitCost,
      refType: 'ProductionOutput',
      refId: output._id,
      createdBy,
      session,
    });
  }

  if (goodQuantity > EPS) {
    const receipt = await receiveGood(order, goodQuantity, unitCost, {
      finishedGoods,
      source: 'output',
      outputId: output._id,
      receiptNumber,
      organizationId,
      branchId,
      createdBy,
      notes,
      session,
    });
    output.receiptId = receipt._id;
  }

  if (rejectedQuantity > EPS) {
    order.rejectedQuantity = roundQty(order.rejectedQuantity + rejectedQuantity);
    if (rejectDisposition === 'rework') {
      order.reworkPendingQuantity = roundQty(order.reworkPendingQuantity + rejectedQuantity);
      order.reworkPendingCost = roundMoney(order.reworkPendingCost + rejectedQuantity * unitCost);
      await writeOutputBucket(order, {
        organizationId,
        branchId,
        type: 'rework_in',
        bucket: 'rework',
        delta: rejectedQuantity,
        balanceAfter: order.reworkPendingQuantity,
        unitCost,
        refType: 'ProductionOutput',
        refId: output._id,
        createdBy,
        session,
      });
    } else {
      order.scrappedQuantity = roundQty(order.scrappedQuantity + rejectedQuantity);
      const scrap = await createScrap(
        {
          organizationId,
          branchId,
          scrapNumber,
          productionOrderId: order._id,
          orderNumber: order.orderNumber,
          productId: order.productId,
          variantId: order.variantId,
          productName: order.productName,
          unit: order.unit,
          stage: 'qc_reject',
          reason: 'defect',
          quantity: rejectedQuantity,
          unitCost,
          totalCost: roundMoney(rejectedQuantity * unitCost),
          affectsStock: false,
          notes: rejectReason || '',
          isDemo: !!order.isDemo,
          createdBy,
        },
        session
      );
      output.scrapId = scrap._id;
    }
  }

  output.goodQuantity = goodQuantity;
  output.rejectedQuantity = rejectedQuantity;
  output.rejectDisposition = rejectedQuantity > EPS ? rejectDisposition : null;
  output.rejectReason = rejectReason || '';
  output.status = 'inspected';
  output.inspectedAt = new Date();
  output.inspectedBy = createdBy;
  /* eslint-enable no-param-reassign */
};

/** Numbers an inspection may need — reserved before its transaction. */
const reserveInspectionNumbers = async (organizationId, { goodQuantity, rejectedQuantity, rejectDisposition }) => ({
  receiptNumber: goodQuantity > EPS ? await settingsService.nextDocumentNumber(organizationId, 'productionReceipt') : null,
  scrapNumber:
    rejectedQuantity > EPS && rejectDisposition === 'scrap'
      ? await settingsService.nextDocumentNumber(organizationId, 'scrap')
      : null,
});

/**
 * Reports output: backflushes WIP, then holds the units for quality inspection — or,
 * with quality checks turned off, posts good/rejected straight away.
 */
const reportOutput = async ({ organizationId, branchId, createdBy }, orderId, body) => {
  requireBranch(branchId);
  const producedQuantity = roundQty(body.producedQuantity);
  if (!(producedQuantity > 0)) throw new ApiError(httpStatus.BAD_REQUEST, 'Produced quantity must be greater than zero');
  await precheckOrder({ organizationId, branchId }, orderId);
  const settings = await settingsService.getSettings(organizationId);
  const inspectNow = !settings.requireQualityCheck;
  const rejectedInput = roundQty(body.rejectedQuantity || 0);
  const goodQuantity = inspectNow ? roundQty(body.goodQuantity ?? producedQuantity - rejectedInput) : 0;
  const rejectedQuantity = inspectNow ? roundQty(producedQuantity - goodQuantity) : 0;
  const rejectDisposition = body.rejectDisposition || settings.defaultRejectDisposition;

  const outputNumber = await settingsService.nextDocumentNumber(organizationId, 'productionOutput');
  const numbers = inspectNow
    ? await reserveInspectionNumbers(organizationId, { goodQuantity, rejectedQuantity, rejectDisposition })
    : {};

  return runTransaction(async (session) => {
    const order = await loadOrder({ organizationId, branchId }, orderId, session);
    assertExecutable(order);
    if (!settings.allowOverProduction && roundQty(order.producedQuantity + producedQuantity) > order.plannedQuantity + EPS) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Reporting ${producedQuantity} would exceed the planned ${order.plannedQuantity} (already produced ${order.producedQuantity})`
      );
    }
    const outputId = new mongoose.Types.ObjectId();
    const ctx = { organizationId, branchId, createdBy, refType: 'ProductionOutput', refId: outputId, session };
    const { consumption, cost } = await backflush(order, producedQuantity, ctx);
    order.producedQuantity = roundQty(order.producedQuantity + producedQuantity);

    let materialCost = cost;
    if (!order.materials.length) {
      const item = await stockService.resolveItem({
        organizationId,
        branchId,
        productId: order.productId,
        variantId: order.variantId,
        session,
      });
      materialCost = roundMoney(item.unitCost * producedQuantity);
    }
    const output = new ProductionOutput({
      _id: outputId,
      organizationId,
      branchId,
      outputNumber,
      productionOrderId: order._id,
      orderNumber: order.orderNumber,
      productId: order.productId,
      variantId: order.variantId,
      productName: order.productName,
      unit: order.unit,
      producedQuantity,
      consumption,
      materialCost,
      unitCost: roundMoney(materialCost / producedQuantity),
      status: 'pending_qc',
      reportedBy: createdBy,
      notes: body.notes || '',
      isDemo: !!order.isDemo,
    });

    if (inspectNow) {
      await postInspection(
        order,
        output,
        {
          goodQuantity,
          rejectedQuantity,
          rejectDisposition,
          rejectReason: body.rejectReason,
          finishedGoods: body.finishedGoods,
          fromQc: false,
          notes: body.notes,
        },
        { organizationId, branchId, createdBy, session, ...numbers }
      );
    } else {
      order.qcPendingQuantity = roundQty(order.qcPendingQuantity + producedQuantity);
      order.qcPendingCost = roundMoney(order.qcPendingCost + materialCost);
      await writeOutputBucket(order, {
        organizationId,
        branchId,
        type: 'qc_in',
        bucket: 'qc',
        delta: producedQuantity,
        balanceAfter: order.qcPendingQuantity,
        unitCost: output.unitCost,
        refType: 'ProductionOutput',
        refId: outputId,
        createdBy,
        session,
      });
    }

    autoStart(order, createdBy);
    order.updatedBy = createdBy;
    await order.save({ session });
    await output.save({ session });
    return output;
  });
};

/** Quality inspection of an output waiting in QC. */
const inspectOutput = async ({ organizationId, branchId, createdBy }, outputId, body) => {
  requireBranch(branchId);
  const pending = await ProductionOutput.findOne({ _id: outputId, organizationId, branchId }).lean();
  if (!pending) throw new ApiError(httpStatus.NOT_FOUND, 'Production output not found');
  if (pending.status !== 'pending_qc') throw new ApiError(httpStatus.BAD_REQUEST, 'This output has already been inspected');
  const goodQuantity = roundQty(body.goodQuantity);
  const rejectedQuantity = roundQty(body.rejectedQuantity ?? pending.producedQuantity - goodQuantity);
  const numbers = await reserveInspectionNumbers(organizationId, {
    goodQuantity,
    rejectedQuantity,
    rejectDisposition: body.rejectDisposition,
  });

  return runTransaction(async (session) => {
    const output = await ProductionOutput.findOne({ _id: outputId, organizationId, branchId, status: 'pending_qc' }).session(
      session
    );
    if (!output) throw new ApiError(httpStatus.CONFLICT, 'This output was already inspected');
    const order = await loadOrder({ organizationId, branchId }, output.productionOrderId, session);
    if (order.status === 'cancelled') throw new ApiError(httpStatus.BAD_REQUEST, 'The order is cancelled');
    await postInspection(
      order,
      output,
      {
        goodQuantity,
        rejectedQuantity,
        rejectDisposition: body.rejectDisposition,
        rejectReason: body.rejectReason,
        finishedGoods: body.finishedGoods,
        fromQc: true,
        notes: body.inspectionNotes,
      },
      { organizationId, branchId, createdBy, session, ...numbers }
    );
    output.inspectionNotes = body.inspectionNotes || '';
    settleAssemblyAfterQc(order, createdBy);
    order.updatedBy = createdBy;
    await order.save({ session });
    await output.save({ session });
    return output;
  });
};

/** Resolves units in the order's rework queue: passed → finished stock, failed → scrap. */
const resolveRework = async ({ organizationId, branchId, createdBy }, orderId, body) => {
  requireBranch(branchId);
  const goodQuantity = roundQty(body.goodQuantity || 0);
  const scrapQuantity = roundQty(body.scrapQuantity || 0);
  const total = roundQty(goodQuantity + scrapQuantity);
  if (!(total > 0)) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter how many reworked units passed or failed');
  const pre = await ProductionOrder.findOne({ _id: orderId, organizationId, branchId })
    .select('reworkPendingQuantity')
    .lean();
  if (!pre) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
  if (total > pre.reworkPendingQuantity + EPS) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Only ${pre.reworkPendingQuantity} unit(s) are waiting for rework`);
  }
  const receiptNumber =
    goodQuantity > EPS ? await settingsService.nextDocumentNumber(organizationId, 'productionReceipt') : null;
  const scrapNumber = scrapQuantity > EPS ? await settingsService.nextDocumentNumber(organizationId, 'scrap') : null;

  return runTransaction(async (session) => {
    const order = await loadOrder({ organizationId, branchId }, orderId, session);
    if (total > order.reworkPendingQuantity + EPS) {
      throw new ApiError(httpStatus.CONFLICT, 'The rework queue changed — refresh and try again');
    }
    const unitCost = roundMoney(order.reworkPendingCost / order.reworkPendingQuantity);
    const refId = new mongoose.Types.ObjectId();
    order.reworkPendingQuantity = roundQty(order.reworkPendingQuantity - total);
    order.reworkPendingCost = order.reworkPendingQuantity > EPS ? roundMoney(order.reworkPendingCost - total * unitCost) : 0;
    await writeOutputBucket(order, {
      organizationId,
      branchId,
      type: 'rework_out',
      bucket: 'rework',
      delta: -total,
      balanceAfter: order.reworkPendingQuantity,
      unitCost,
      refType: 'Rework',
      refId,
      createdBy,
      session,
    });
    let receipt = null;
    let scrap = null;
    if (goodQuantity > EPS) {
      receipt = await receiveGood(order, goodQuantity, unitCost, {
        finishedGoods: body.finishedGoods,
        source: 'rework',
        receiptNumber,
        organizationId,
        branchId,
        createdBy,
        notes: body.notes,
        session,
      });
      order.reworkedGoodQuantity = roundQty(order.reworkedGoodQuantity + goodQuantity);
    }
    if (scrapQuantity > EPS) {
      order.scrappedQuantity = roundQty(order.scrappedQuantity + scrapQuantity);
      scrap = await createScrap(
        {
          organizationId,
          branchId,
          scrapNumber,
          productionOrderId: order._id,
          orderNumber: order.orderNumber,
          productId: order.productId,
          variantId: order.variantId,
          productName: order.productName,
          unit: order.unit,
          stage: 'rework',
          reason: 'rework',
          quantity: scrapQuantity,
          unitCost,
          totalCost: roundMoney(scrapQuantity * unitCost),
          affectsStock: false,
          notes: body.notes || '',
          isDemo: !!order.isDemo,
          createdBy,
        },
        session
      );
    }
    order.updatedBy = createdBy;
    await order.save({ session });
    return { receipt, scrap, reworkPendingQuantity: order.reworkPendingQuantity };
  });
};

// ── Assembly orders ─────────────────────────────────────────────────────────────────

/**
 * Once an assembly waiting in QC has nothing left in QC: completed if nothing remains to
 * settle, otherwise back to In Assembly (rework or leftover WIP still to deal with).
 */
const settleAssemblyAfterQc = (order, createdBy) => {
  /* eslint-disable no-param-reassign */
  if (order.orderType !== 'assembly' || order.status !== 'qc_pending' || order.qcPendingQuantity > EPS) return;
  const hasWip = order.wipLots.some((l) => l.quantity > EPS);
  const outputDone = order.producedQuantity + EPS >= order.plannedQuantity;
  const to = !hasWip && order.reworkPendingQuantity <= EPS && outputDone ? 'completed' : 'in_production';
  order.statusHistory.push({
    from: 'qc_pending',
    to,
    note: to === 'completed' ? 'Quality check passed' : 'Quality check done — rework, WIP or output still open',
    by: createdBy,
    at: new Date(),
  });
  order.status = to;
  if (to === 'completed') order.actualCompletionDate = new Date();
  /* eslint-enable no-param-reassign */
};

/**
 * Start assembly: moves every component still required into WIP in one issue (batches
 * FEFO, serial units oldest-first unless `lines` name them) and sets In Assembly.
 */
const startAssembly = async ({ organizationId, branchId, createdBy }, orderId, { lines, note } = {}) => {
  requireBranch(branchId);
  const order = await ProductionOrder.findOne({ _id: orderId, organizationId, branchId }).lean();
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Assembly order not found');
  if (order.orderType !== 'assembly') throw new ApiError(httpStatus.BAD_REQUEST, 'Not an assembly order');
  if (order.status !== 'released') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Only a released assembly can be started (this one is ${order.status})`);
  }
  const toIssue =
    lines ||
    order.materials
      .filter((m) => !m.isOptional && wip.lineRemaining(m) > EPS)
      .map((m) => ({ materialLineId: m._id, quantity: wip.lineRemaining(m), autoPickSerials: true }));
  if (toIssue.length) {
    await issueMaterials({ organizationId, branchId, createdBy }, orderId, {
      lines: toIssue,
      notes: note || 'Components issued on assembly start',
    });
  } else {
    await ProductionOrder.updateOne(
      { _id: orderId, status: 'released' },
      {
        $set: { status: 'in_production', actualStartDate: new Date(), updatedBy: createdBy },
        $push: { statusHistory: { from: 'released', to: 'in_production', note: note || '', by: createdBy, at: new Date() } },
      }
    );
  }
  return ProductionOrder.findById(orderId);
};

/**
 * Complete assembly: reports the remaining quantity as assembled (backflushing WIP).
 * With quality checks on the order moves to QC Pending and the inspection completes it;
 * with them off the good/rejected split posts now and the order completes (any leftover
 * WIP is returned to stock).
 */
const completeAssembly = async ({ organizationId, branchId, createdBy }, orderId, body = {}) => {
  const ctx = { organizationId, branchId, createdBy };
  requireBranch(branchId);
  const pre = await ProductionOrder.findOne({ _id: orderId, organizationId, branchId }).lean();
  if (!pre) throw new ApiError(httpStatus.NOT_FOUND, 'Assembly order not found');
  if (pre.orderType !== 'assembly') throw new ApiError(httpStatus.BAD_REQUEST, 'Not an assembly order');
  const remaining = roundQty(pre.plannedQuantity - pre.producedQuantity);
  const quantity = roundQty(body.quantity ?? remaining);
  if (quantity > EPS) {
    await reportOutput(ctx, orderId, { ...body, producedQuantity: quantity });
  }
  const settings = await settingsService.getSettings(organizationId);
  const order = await ProductionOrder.findById(orderId);
  if (settings.requireQualityCheck && order.qcPendingQuantity > EPS) {
    return ProductionOrder.findOneAndUpdate(
      { _id: orderId, status: { $in: ['in_production', 'paused'] } },
      {
        $set: { status: 'qc_pending', updatedBy: createdBy },
        $push: {
          statusHistory: { from: order.status, to: 'qc_pending', note: body.notes || '', by: createdBy, at: new Date() },
        },
      },
      { new: true }
    );
  }
  if (order.reworkPendingQuantity > EPS || order.producedQuantity + EPS < order.plannedQuantity) return order;
  return completeOrder(ctx, orderId, { wipDisposition: body.wipDisposition || 'return', note: body.notes });
};

// ── Scrap ───────────────────────────────────────────────────────────────────────────

/** Takes a material line's whole/partial WIP into a scrap record. */
const scrapFromWip = async (order, material, quantity, { organizationId, branchId, createdBy, session, scrapId, note }) => {
  const taken = await wip.takeFromWip(order, material, quantity, {
    organizationId,
    branchId,
    createdBy,
    session,
    type: 'wip_scrap',
    refType: 'ScrapRecord',
    refId: scrapId,
    location: order.wipLocation,
    serialStatus: 'scrapped',
    serialOrderId: order._id,
    serialNote: note,
  });
  wip.pruneEmptyLots(order);
  const cost = roundMoney(taken.reduce((s, t) => s + t.cost, 0));
  material.scrappedQuantity = roundQty(material.scrappedQuantity + quantity); // eslint-disable-line no-param-reassign
  order.materialCost = roundMoney(order.materialCost - cost); // eslint-disable-line no-param-reassign
  return cost;
};

/**
 * Manual scrap:
 *  material      — issued material lost on the floor: leaves the order's WIP
 *  finished_good — finished stock written off: leaves available stock (FEFO or the named
 *                  batch; serial items name their units)
 */
const recordScrap = async ({ organizationId, branchId, createdBy }, body) => {
  requireBranch(branchId);
  const quantity = roundQty(body.quantity || (body.imeiIds ? body.imeiIds.length : 0));
  if (quantity <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Quantity must be greater than zero');
  if (body.stage === 'material' && !body.productionOrderId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Material scrap must be recorded against a production order');
  }
  const scrapNumber = await settingsService.nextDocumentNumber(organizationId, 'scrap');

  return runTransaction(async (session) => {
    const scrapId = new mongoose.Types.ObjectId();
    let order = null;
    if (body.productionOrderId) {
      order = await loadOrder({ organizationId, branchId }, body.productionOrderId, session);
      if (order.status === 'cancelled')
        throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot record scrap on a cancelled order');
    }

    let doc;
    if (body.stage === 'material') {
      const material = order.materials.id(body.materialLineId);
      if (!material) throw new ApiError(httpStatus.BAD_REQUEST, 'Select which material was scrapped');
      const cost = await scrapFromWip(order, material, quantity, {
        organizationId,
        branchId,
        createdBy,
        session,
        scrapId,
        note: `Scrapped from ${order.orderNumber} WIP (${scrapNumber})`,
      });
      doc = {
        productId: material.productId,
        variantId: material.variantId,
        productName: material.productName,
        unit: material.unit,
        unitCost: roundMoney(cost / quantity),
        totalCost: cost,
        affectsStock: false,
        materialLineId: material._id,
      };
    } else {
      const productId = body.productId || (order && order.productId);
      if (!productId) throw new ApiError(httpStatus.BAD_REQUEST, 'Select the product being scrapped');
      const variantId = body.productId ? body.variantId : order && order.variantId;
      const item = await stockService.resolveItem({ organizationId, branchId, productId, variantId, session });
      let pieces;
      if (item.serial) {
        const units = await stockService.pickSerials(item, {
          organizationId,
          branchId,
          imeiIds: body.imeiIds,
          serialNumbers: body.serialNumbers,
          session,
        });
        await stockService.setSerialStatus(units, {
          status: 'scrapped',
          note: `Manufacturing scrap ${scrapNumber}`,
          userId: createdBy,
          session,
        });
        const unitCost = await serialUnitCost(
          units.map((u) => u._id),
          item.unitCost,
          session
        );
        pieces = [
          { quantity: units.length, unitCost, imeiIds: units.map((u) => u._id), serialNumbers: units.map((u) => u.imei) },
        ];
      } else if (item.batchTracked) {
        const allocations = await stockService.allocateBatches(
          item,
          quantity,
          body.batchId ? [{ batchId: body.batchId, quantity }] : null,
          session
        );
        pieces = allocations.map((a) => ({
          quantity: a.quantity,
          batchId: a.batch._id,
          unitCost: a.batch.costPerUnit ?? item.unitCost,
        }));
      } else {
        pieces = [{ quantity, unitCost: item.unitCost }];
      }
      let total = 0;
      // eslint-disable-next-line no-restricted-syntax
      for (const piece of pieces) {
        // eslint-disable-next-line no-await-in-loop
        const balanceAfter = await stockService.applyAvailableDelta(item, -piece.quantity, {
          batchId: piece.batchId,
          session,
        });
        // eslint-disable-next-line no-await-in-loop
        await stockService.writeMovement(item, {
          organizationId,
          branchId,
          type: 'production_scrap',
          delta: -piece.quantity,
          balanceAfter,
          unitCost: piece.unitCost,
          refType: 'ScrapRecord',
          refId: scrapId,
          productionOrderId: order ? order._id : undefined,
          location: order ? order.finishedGoodsLocation : undefined,
          batchId: piece.batchId,
          imeiIds: piece.imeiIds,
          serialNumbers: piece.serialNumbers,
          createdBy,
          session,
        });
        total += piece.quantity * (piece.unitCost || 0);
      }
      const physical = roundQty(pieces.reduce((s, p) => s + p.quantity, 0));
      if (order && String(order.productId) === String(productId)) {
        order.scrappedQuantity = roundQty(order.scrappedQuantity + physical);
      }
      doc = {
        productId: item.product._id,
        variantId: plainVariantId(item),
        productName: item.name,
        unit: item.unit,
        unitCost: roundMoney(total / physical),
        totalCost: roundMoney(total),
        affectsStock: true,
      };
    }

    if (order) {
      order.updatedBy = createdBy;
      await order.save({ session });
    }
    return createScrap(
      {
        _id: scrapId,
        organizationId,
        branchId,
        scrapNumber,
        productionOrderId: order ? order._id : null,
        orderNumber: order ? order.orderNumber : undefined,
        ...doc,
        stage: body.stage,
        reason: body.reason || 'other',
        quantity,
        scrapDate: body.scrapDate || new Date(),
        notes: body.notes || '',
        isDemo: !!(order && order.isDemo),
        createdBy,
      },
      session
    );
  });
};

// ── Completion ──────────────────────────────────────────────────────────────────────

/**
 * Completes an order. Nothing may be left in QC or rework, and material still in WIP has to
 * be dealt with explicitly — `wipDisposition` 'return' (back to stock) or 'scrap'.
 */
const completeOrder = async ({ organizationId, branchId, createdBy }, orderId, { wipDisposition, note } = {}) => {
  requireBranch(branchId);
  const pre = await ProductionOrder.findOne({ _id: orderId, organizationId, branchId })
    .select('orderNumber status qcPendingQuantity reworkPendingQuantity wipLots')
    .lean();
  if (!pre) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
  if (!['in_production', 'paused'].includes(pre.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot move a production order from ${pre.status} to completed`);
  }
  if (pre.qcPendingQuantity > EPS) {
    throw new ApiError(httpStatus.CONFLICT, `${pre.qcPendingQuantity} unit(s) are still waiting for quality inspection`);
  }
  if (pre.reworkPendingQuantity > EPS) {
    throw new ApiError(httpStatus.CONFLICT, `${pre.reworkPendingQuantity} unit(s) are still in rework`);
  }
  const lots = pre.wipLots.filter((l) => l.quantity > EPS);
  if (lots.length && !wipDisposition) {
    throw new ApiError(
      httpStatus.CONFLICT,
      `Material is still in WIP (${[...new Set(lots.map((l) => l.productName))].join(
        ', '
      )}) — return it to stock or scrap it to complete`
    );
  }
  const returnNumber =
    lots.length && wipDisposition === 'return'
      ? await settingsService.nextDocumentNumber(organizationId, 'materialReturn')
      : null;
  const scrapNumbers = [];
  if (lots.length && wipDisposition === 'scrap') {
    const lineCount = new Set(lots.map((l) => String(l.materialLineId))).size;
    for (let i = 0; i < lineCount; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      scrapNumbers.push(await settingsService.nextDocumentNumber(organizationId, 'scrap'));
    }
  }

  return runTransaction(async (session) => {
    const order = await loadOrder({ organizationId, branchId }, orderId, session);
    if (
      !['in_production', 'paused'].includes(order.status) ||
      order.qcPendingQuantity > EPS ||
      order.reworkPendingQuantity > EPS
    ) {
      throw new ApiError(httpStatus.CONFLICT, 'This order changed — refresh and try again');
    }
    const liveLots = order.wipLots.filter((l) => l.quantity > EPS);
    if (liveLots.length && wipDisposition === 'return') {
      await returnMaterialsInTx(
        order,
        liveLots.map((l) => ({
          wipLotId: l._id,
          quantity: l.quantity,
          imeiIds: l.imeiIds ? l.imeiIds.map(String) : undefined,
        })),
        {
          organizationId,
          branchId,
          createdBy,
          returnId: new mongoose.Types.ObjectId(),
          returnNumber,
          notes: 'Unused WIP returned on completion',
          session,
        }
      );
    } else if (liveLots.length && wipDisposition === 'scrap') {
      const linesWithWip = order.materials.filter((m) => wip.lineWip(order, m) > EPS);
      if (linesWithWip.length > scrapNumbers.length) {
        throw new ApiError(httpStatus.CONFLICT, 'WIP changed — refresh and try again');
      }
      // eslint-disable-next-line no-restricted-syntax
      for (const [i, material] of linesWithWip.entries()) {
        const credited = wip.lineWip(order, material);
        const scrapId = new mongoose.Types.ObjectId();
        // eslint-disable-next-line no-await-in-loop
        const cost = await scrapFromWip(order, material, credited, {
          organizationId,
          branchId,
          createdBy,
          session,
          scrapId,
          note: `Scrapped on completion of ${order.orderNumber}`,
        });
        // eslint-disable-next-line no-await-in-loop
        await createScrap(
          {
            _id: scrapId,
            organizationId,
            branchId,
            scrapNumber: scrapNumbers[i],
            productionOrderId: order._id,
            orderNumber: order.orderNumber,
            materialLineId: material._id,
            productId: material.productId,
            variantId: material.variantId,
            productName: material.productName,
            unit: material.unit,
            stage: 'material',
            reason: 'process_loss',
            quantity: credited,
            unitCost: roundMoney(cost / credited),
            totalCost: cost,
            affectsStock: false,
            notes: 'Unused WIP scrapped on completion',
            isDemo: !!order.isDemo,
            createdBy,
          },
          session
        );
      }
    }

    const from = order.status;
    order.status = 'completed';
    order.actualCompletionDate = new Date();
    order.statusHistory.push({ from, to: 'completed', note: note || '', by: createdBy, at: new Date() });
    order.updatedBy = createdBy;
    await order.save({ session });
    return order;
  });
};

// ── Queries ─────────────────────────────────────────────────────────────────────────

const buildListQuery = (ctx, filter, dateField) => {
  const query = { ...scopeFilter(ctx) };
  if (filter.productionOrderId) query.productionOrderId = filter.productionOrderId;
  if (filter.productId) query.productId = filter.productId;
  if (filter.stage) query.stage = filter.stage;
  Object.assign(query, parseDateRange(filter.dateFrom, filter.dateTo, dateField));
  return query;
};

const withCreator = { populate: [{ path: 'createdBy', select: 'name email' }] };

const queryIssues = async (ctx, filter, options) => {
  const query = buildListQuery(ctx, filter, 'issueDate');
  if (filter.kind) query.kind = filter.kind;
  if (filter.search) {
    const re = new RegExp(escapeRegex(filter.search), 'i');
    query.$or = [{ issueNumber: re }, { orderNumber: re }, { 'lines.productName': re }];
  }
  return MaterialIssue.paginate(query, { sortBy: 'createdAt:desc', ...options, ...withCreator });
};

const queryReceipts = async (ctx, filter, options) => {
  const query = buildListQuery(ctx, filter, 'receiptDate');
  if (filter.search) {
    const re = new RegExp(escapeRegex(filter.search), 'i');
    query.$or = [{ receiptNumber: re }, { orderNumber: re }, { productName: re }];
  }
  return ProductionReceipt.paginate(query, { sortBy: 'createdAt:desc', ...options, ...withCreator });
};

const queryOutputs = async (ctx, filter, options) => {
  const query = buildListQuery(ctx, filter, 'reportedAt');
  if (filter.status) query.status = filter.status;
  if (filter.search) {
    const re = new RegExp(escapeRegex(filter.search), 'i');
    query.$or = [{ outputNumber: re }, { orderNumber: re }, { productName: re }];
  }
  return ProductionOutput.paginate(query, {
    sortBy: 'createdAt:desc',
    ...options,
    populate: [
      { path: 'reportedBy', select: 'name email' },
      { path: 'inspectedBy', select: 'name email' },
    ],
  });
};

const queryScrap = async (ctx, filter, options) => {
  const query = buildListQuery(ctx, filter, 'scrapDate');
  if (filter.reason) query.reason = filter.reason;
  if (filter.search) {
    const re = new RegExp(escapeRegex(filter.search), 'i');
    query.$or = [{ scrapNumber: re }, { orderNumber: re }, { productName: re }];
  }
  return ScrapRecord.paginate(query, { sortBy: 'createdAt:desc', ...options, ...withCreator });
};

const MANUFACTURING_MOVEMENT_TYPES = [
  'production_issue',
  'wip_in',
  'wip_return',
  'production_return',
  'wip_consume',
  'wip_scrap',
  'qc_in',
  'qc_out',
  'production_receipt',
  'rework_in',
  'rework_out',
  'production_scrap',
];

/** The ledger itself — every manufacturing movement with its full trace. */
const queryMovements = async (ctx, filter, options) => {
  const query = { ...scopeFilter(ctx), type: { $in: MANUFACTURING_MOVEMENT_TYPES } };
  if (filter.productionOrderId) query.productionOrderId = filter.productionOrderId;
  if (filter.productId) query.productId = filter.productId;
  if (filter.bucket) query.stockBucket = filter.bucket;
  if (filter.type) query.type = filter.type;
  Object.assign(query, parseDateRange(filter.dateFrom, filter.dateTo, 'createdAt'));
  return InventoryTransaction.paginate(query, {
    sortBy: 'createdAt:desc',
    ...options,
    populate: [
      { path: 'productId', select: 'name sku' },
      { path: 'batchId', select: 'batchNumber expiryDate' },
      { path: 'createdBy', select: 'name email' },
    ],
  });
};

const getIssue = async (ctx, issueId) => {
  const issue = await MaterialIssue.findOne({ _id: issueId, ...scopeFilter(ctx) });
  if (!issue) throw new ApiError(httpStatus.NOT_FOUND, 'Material issue not found');
  return issue;
};

/**
 * Work in progress: every order on the floor, valued at the cost of the material lots
 * still sitting in its WIP, plus output waiting in QC / rework.
 */
const getWip = async (ctx) => {
  const orders = await ProductionOrder.find({
    ...scopeFilter(ctx),
    status: { $in: ['released', 'in_production', 'paused'] },
  })
    .select(
      'orderNumber orderType productName sku unit status priority plannedQuantity producedQuantity completedQuantity rejectedQuantity qcPendingQuantity reworkPendingQuantity scrappedQuantity materialCost finishedGoodsValue plannedStartDate plannedCompletionDate actualStartDate wipLocation materials wipLots'
    )
    .sort({ plannedCompletionDate: 1, createdAt: 1 })
    .lean();

  const now = Date.now();
  const rows = orders.map((order) => {
    const required = order.materials.filter((m) => !m.isOptional);
    const req = required.reduce((s, m) => s + m.requiredQuantity, 0);
    const issued = required.reduce(
      (s, m) => s + Math.min(Math.max(0, m.issuedQuantity - (m.returnedQuantity || 0)), m.requiredQuantity),
      0
    );
    const lots = (order.wipLots || []).filter((l) => l.quantity > EPS);
    const produced = order.producedQuantity || 0;
    return {
      id: String(order._id),
      orderNumber: order.orderNumber,
      orderType: order.orderType || 'production',
      productName: order.productName,
      sku: order.sku,
      unit: order.unit,
      status: order.status,
      priority: order.priority,
      plannedQuantity: order.plannedQuantity,
      producedQuantity: produced,
      completedQuantity: order.completedQuantity,
      rejectedQuantity: order.rejectedQuantity || 0,
      qcPendingQuantity: order.qcPendingQuantity || 0,
      reworkPendingQuantity: order.reworkPendingQuantity || 0,
      scrappedQuantity: order.scrappedQuantity,
      remainingQuantity: Math.max(0, roundQty(order.plannedQuantity - produced)),
      materialIssuedPercent: req > 0 ? Math.round((issued / req) * 100) : 0,
      outputPercent: Math.round((produced / order.plannedQuantity) * 100),
      materialCost: order.materialCost,
      finishedGoodsValue: order.finishedGoodsValue,
      wipValue: roundMoney(lots.reduce((s, l) => s + l.quantity * (l.unitCost || 0), 0)),
      wipItems: lots.map((l) => ({
        id: String(l._id),
        productName: l.productName,
        unit: l.unit,
        quantity: l.quantity,
        batchNumber: l.batchNumber,
        serialCount: l.imeiIds ? l.imeiIds.length : 0,
      })),
      wipLocation: order.wipLocation,
      plannedStartDate: order.plannedStartDate,
      plannedCompletionDate: order.plannedCompletionDate,
      actualStartDate: order.actualStartDate,
      isOverdue: !!order.plannedCompletionDate && new Date(order.plannedCompletionDate).getTime() < now,
    };
  });
  return {
    orders: rows,
    totals: {
      orderCount: rows.length,
      wipValue: roundMoney(rows.reduce((s, r) => s + r.wipValue, 0)),
      materialCost: roundMoney(rows.reduce((s, r) => s + r.materialCost, 0)),
      qcPendingQuantity: roundQty(rows.reduce((s, r) => s + r.qcPendingQuantity, 0)),
      reworkPendingQuantity: roundQty(rows.reduce((s, r) => s + r.reworkPendingQuantity, 0)),
      overdueCount: rows.filter((r) => r.isOverdue).length,
    },
  };
};

module.exports = {
  issueMaterials,
  returnMaterials,
  reportOutput,
  inspectOutput,
  resolveRework,
  recordScrap,
  completeOrder,
  startAssembly,
  completeAssembly,
  queryIssues,
  queryReceipts,
  queryOutputs,
  queryScrap,
  queryMovements,
  getIssue,
  getWip,
  MANUFACTURING_MOVEMENT_TYPES,
};
