const httpStatus = require('http-status');
const { ProductionOrder, MaterialIssue, ProductionOutput, ProductionReceipt, ScrapRecord, User } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { MAX_ORDER_DOCUMENTS } = require('../../config/manufacturing');
const stockService = require('./stock.service');
const documentStorage = require('./documentStorage');
const wip = require('./wip');
const { roundQty, roundMoney, requireBranch, scopeFilter } = require('./common');

/**
 * Read models behind the production-order detail page that span several collections —
 * costs and the activity timeline — plus the order's attached documents.
 */

const findOrderOrThrow = async ({ organizationId, branchId }, orderId) => {
  const order = await ProductionOrder.findOne({ _id: orderId, ...scopeFilter({ organizationId, branchId }) });
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
  return order;
};

const minutesBetween = (from, to) => Math.max(0, (new Date(to) - new Date(from)) / 60000);
const hoursCost = (minutes, rate) => roundMoney(((minutes || 0) / 60) * (rate || 0));

// ── Costs ─────────────────────────────────────────────────────────────────────────

/**
 * Planned vs actual vs forecast cost of one order.
 *
 *  Materials — planned = required × today's standard unit cost (what an issue would be
 *    valued at now); actual = net issued (issues − returns, at the FIFO cost each moved
 *    at, from the issue documents); forecast = actual + what's still to issue × standard.
 *    Optional lines are planned at what was actually taken (their need isn't known).
 *  Conversion — routing time × each step's cost per hour. Actual = recorded minutes of
 *    finished steps (plan when none was recorded) plus running steps' elapsed time capped
 *    at plan — both flagged `estimated`; forecast = actual for finished steps, plan for the
 *    rest, nothing for skipped ones. Informational: stock is valued at material cost only.
 *  Where the money sits — consumed into output, still in WIP, in QC / rework, received as
 *    finished goods, scrapped (by stage) and returned.
 */
const getOrderCosts = async (ctx, orderId) => {
  const order = await findOrderOrThrow(ctx, orderId);
  const [unitCosts, issueDocs, scraps] = await Promise.all([
    order.materials.length
      ? stockService.getUnitCosts({
          organizationId: ctx.organizationId,
          items: order.materials.map((m) => ({ productId: m.productId, variantId: m.variantId })),
        })
      : new Map(),
    MaterialIssue.find({ organizationId: ctx.organizationId, productionOrderId: order._id })
      .select('kind lines.materialLineId lines.totalCost')
      .lean(),
    ScrapRecord.find({ organizationId: ctx.organizationId, productionOrderId: order._id })
      .select('stage reason quantity totalCost')
      .lean(),
  ]);

  const issuedByLine = new Map();
  const returnedByLine = new Map();
  let returnedValue = 0;
  issueDocs.forEach((doc) => {
    doc.lines.forEach((l) => {
      const target = doc.kind === 'return' ? returnedByLine : issuedByLine;
      target.set(String(l.materialLineId), (target.get(String(l.materialLineId)) || 0) + (l.totalCost || 0));
      if (doc.kind === 'return') returnedValue += l.totalCost || 0;
    });
  });

  const lotValueByLine = new Map();
  order.wipLots.forEach((lot) => {
    const key = String(lot.materialLineId);
    lotValueByLine.set(key, (lotValueByLine.get(key) || 0) + lot.quantity * (lot.unitCost || 0));
  });

  const materials = order.materials.map((m) => {
    const key = String(m._id);
    const standardUnitCost = unitCosts.get(`${m.productId}:${m.variantId || ''}`) || 0;
    const issued = issuedByLine.get(key) || 0;
    const returned = returnedByLine.get(key) || 0;
    const actual = roundMoney(issued - returned);
    const remaining = wip.lineRemaining(m);
    // An optional line's need isn't known up front: it's planned at what was actually taken.
    const netIssuedQty = Math.max(0, m.issuedQuantity - m.returnedQuantity);
    const planned = roundMoney((m.isOptional ? netIssuedQty : m.requiredQuantity) * standardUnitCost);
    const forecast = roundMoney(actual + (m.isOptional ? 0 : remaining * standardUnitCost));
    return {
      materialLineId: key,
      productName: m.productName,
      sku: m.sku,
      unit: m.unit,
      isOptional: m.isOptional,
      requiredQuantity: m.requiredQuantity,
      issuedQuantity: roundQty(netIssuedQty),
      remainingQuantity: remaining,
      standardUnitCost,
      actualUnitCost:
        m.issuedQuantity - m.returnedQuantity > 0 ? roundMoney(actual / (m.issuedQuantity - m.returnedQuantity)) : null,
      plannedCost: planned,
      actualCost: actual,
      consumedCost: roundMoney(m.consumedCost),
      wipValue: roundMoney(lotValueByLine.get(key) || 0),
      forecastCost: forecast,
      variance: roundMoney(forecast - planned),
    };
  });

  const now = new Date();
  const operations = order.operations.map((op) => {
    const planned = op.plannedMinutes || 0;
    // Time to date: recorded minutes; for a step still running, the elapsed time capped at
    // plan (it may span nights); a finished step with no recorded time is taken at plan.
    let actualMinutes = 0;
    let estimated = false;
    if (op.status === 'completed') {
      estimated = op.actualMinutes == null;
      actualMinutes = estimated ? planned : op.actualMinutes;
    } else if (op.status === 'in_progress' && op.startedAt) {
      estimated = true;
      actualMinutes = Math.min(Math.round(minutesBetween(op.startedAt, now)), planned);
    }
    let forecastMinutes = planned;
    if (op.status === 'skipped') forecastMinutes = 0;
    else if (op.status === 'completed') forecastMinutes = actualMinutes;
    return {
      operationId: String(op._id),
      name: op.name,
      workCenter: op.workCenter,
      status: op.status,
      costPerHour: op.costPerHour || 0,
      plannedMinutes: planned,
      actualMinutes: op.status === 'completed' || op.status === 'in_progress' ? actualMinutes : null,
      recordedMinutes: op.actualMinutes ?? null,
      plannedCost: hoursCost(planned, op.costPerHour),
      actualCost: hoursCost(actualMinutes, op.costPerHour),
      forecastCost: hoursCost(forecastMinutes, op.costPerHour),
      estimated,
    };
  });

  const sum = (rows, field) => roundMoney(rows.reduce((s, r) => s + (r[field] || 0), 0));
  const scrapByStage = {};
  const scrapByReason = {};
  scraps.forEach((sr) => {
    scrapByStage[sr.stage] = roundMoney((scrapByStage[sr.stage] || 0) + (sr.totalCost || 0));
    scrapByReason[sr.reason] = roundMoney((scrapByReason[sr.reason] || 0) + (sr.totalCost || 0));
  });

  const material = {
    planned: sum(materials, 'plannedCost'),
    actual: roundMoney(order.materialCost),
    forecast: sum(materials, 'forecastCost'),
  };
  const conversion = {
    planned: sum(operations, 'plannedCost'),
    actual: sum(operations, 'actualCost'),
    forecast: sum(operations, 'forecastCost'),
  };
  const total = {
    planned: roundMoney(material.planned + conversion.planned),
    actual: roundMoney(material.actual + conversion.actual),
    forecast: roundMoney(material.forecast + conversion.forecast),
  };
  const perUnit = (value) => (order.plannedQuantity > 0 ? roundMoney(value / order.plannedQuantity) : 0);

  return {
    orderId: String(order._id),
    plannedQuantity: order.plannedQuantity,
    completedQuantity: order.completedQuantity,
    unit: order.unit,
    material,
    conversion,
    total,
    unitCost: {
      planned: perUnit(total.planned),
      forecast: perUnit(total.forecast),
      // What each good unit was actually received into stock at (material only).
      actualFinished: order.completedQuantity > 0 ? roundMoney(order.finishedGoodsValue / order.completedQuantity) : null,
    },
    variance: roundMoney(total.forecast - total.planned),
    breakdown: {
      consumed: sum(materials, 'consumedCost'),
      inWip: roundMoney(order.wipLots.reduce((s, l) => s + l.quantity * (l.unitCost || 0), 0)),
      inQc: roundMoney(order.qcPendingCost),
      inRework: roundMoney(order.reworkPendingCost),
      finishedGoods: roundMoney(order.finishedGoodsValue),
      scrapped: roundMoney(scraps.reduce((s, r) => s + (r.totalCost || 0), 0)),
      returned: roundMoney(returnedValue),
    },
    scrapByStage,
    scrapByReason,
    materials,
    operations,
  };
};

// ── Activity ──────────────────────────────────────────────────────────────────────

/**
 * Everything that happened to the order, newest first: status changes, material issues and
 * returns, output reported and inspected, finished goods received, scrap, routing steps and
 * documents. Structured events (the client words and translates them).
 */
const getOrderActivity = async (ctx, orderId) => {
  const order = await findOrderOrThrow(ctx, orderId);
  const scope = { organizationId: ctx.organizationId, productionOrderId: order._id };
  const [issues, outputs, receipts, scraps] = await Promise.all([
    MaterialIssue.find(scope)
      .select('issueNumber kind isOverIssue issueDate totalCost lines.quantity createdBy notes')
      .lean(),
    ProductionOutput.find(scope)
      .select(
        'outputNumber producedQuantity goodQuantity rejectedQuantity rejectDisposition status reportedAt reportedBy inspectedAt inspectedBy'
      )
      .lean(),
    ProductionReceipt.find(scope).select('receiptNumber quantity totalCost source receiptDate createdBy batchNumber').lean(),
    ScrapRecord.find(scope)
      .select('scrapNumber productName quantity unit stage reason totalCost scrapDate createdBy')
      .lean(),
  ]);

  const events = [];
  const push = (type, at, by, data) => {
    if (at) events.push({ type, at, by: by ? String(by) : null, data });
  };

  order.statusHistory.forEach((h, i) =>
    push(i === 0 && !h.from ? 'created' : 'status', h.at, h.by, { from: h.from || null, to: h.to, note: h.note || '' })
  );
  issues.forEach((d) =>
    push(d.kind === 'return' ? 'return' : 'issue', d.issueDate, d.createdBy, {
      id: String(d._id),
      number: d.issueNumber,
      lines: d.lines.length,
      totalCost: d.totalCost,
      isOverIssue: !!d.isOverIssue,
      notes: d.notes || '',
    })
  );
  outputs.forEach((o) => {
    push('output', o.reportedAt, o.reportedBy, { id: String(o._id), number: o.outputNumber, quantity: o.producedQuantity });
    if (o.status === 'inspected') {
      push('inspection', o.inspectedAt, o.inspectedBy, {
        id: String(o._id),
        number: o.outputNumber,
        good: o.goodQuantity,
        rejected: o.rejectedQuantity,
        disposition: o.rejectDisposition,
      });
    }
  });
  receipts.forEach((r) =>
    push('receipt', r.receiptDate, r.createdBy, {
      id: String(r._id),
      number: r.receiptNumber,
      quantity: r.quantity,
      totalCost: r.totalCost,
      source: r.source,
      batchNumber: r.batchNumber || '',
    })
  );
  scraps.forEach((sr) =>
    push('scrap', sr.scrapDate, sr.createdBy, {
      id: String(sr._id),
      number: sr.scrapNumber,
      productName: sr.productName,
      quantity: sr.quantity,
      unit: sr.unit,
      stage: sr.stage,
      reason: sr.reason,
      totalCost: sr.totalCost,
    })
  );
  order.operations.forEach((op) => {
    const base = { operationId: String(op._id), name: op.name, workCenter: op.workCenter };
    if (op.startedAt && op.status !== 'skipped') push('operation_started', op.startedAt, op.startedBy, base);
    if (op.status === 'completed') {
      push('operation_completed', op.completedAt, op.completedBy, {
        ...base,
        actualMinutes: op.actualMinutes,
        note: op.note,
      });
    }
    if (op.status === 'skipped') push('operation_skipped', op.completedAt, op.completedBy, { ...base, note: op.note });
  });
  order.documents.forEach((d) =>
    push('document', d.uploadedAt, d.uploadedBy, { id: String(d._id), title: d.title, kind: d.kind, category: d.category })
  );

  const userIds = [...new Set(events.map((e) => e.by).filter(Boolean))];
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds }, organizationId: ctx.organizationId })
        .select('name')
        .lean()
    : [];
  const nameById = new Map(users.map((u) => [String(u._id), u.name || '']));

  // Same instant → the later step of the flow first (newest-first list).
  const FLOW = [
    'created',
    'status',
    'operation_started',
    'issue',
    'return',
    'operation_completed',
    'operation_skipped',
    'output',
    'inspection',
    'receipt',
    'scrap',
    'document',
  ];
  events.sort((a, b) => new Date(b.at) - new Date(a.at) || FLOW.indexOf(b.type) - FLOW.indexOf(a.type));
  return events.slice(0, 500).map((e) => ({ ...e, byName: e.by ? nameById.get(e.by) || '' : '' }));
};

// ── Documents ─────────────────────────────────────────────────────────────────────

const assertRoom = (order) => {
  if (order.documents.length >= MAX_ORDER_DOCUMENTS) {
    throw new ApiError(httpStatus.BAD_REQUEST, `An order can hold at most ${MAX_ORDER_DOCUMENTS} documents`);
  }
};

const uploaderName = async (organizationId, userId) => {
  const user = userId ? await User.findOne({ _id: userId, organizationId }).select('name').lean() : null;
  return (user && user.name) || '';
};

const addDocumentLink = async ({ organizationId, branchId, createdBy }, orderId, { title, url, category }) => {
  requireBranch(branchId);
  const order = await findOrderOrThrow({ organizationId, branchId }, orderId);
  assertRoom(order);
  order.documents.push({
    kind: 'link',
    title,
    url,
    category: category || 'other',
    uploadedBy: createdBy,
    uploadedByName: await uploaderName(organizationId, createdBy),
    uploadedAt: new Date(),
  });
  await order.save();
  return order;
};

const uploadDocument = async ({ organizationId, branchId, createdBy }, orderId, file, { title, category } = {}) => {
  requireBranch(branchId);
  const order = await findOrderOrThrow({ organizationId, branchId }, orderId);
  assertRoom(order);
  const { mimeType, bytes } = documentStorage.validateFile(file);
  const storageKey = await documentStorage.save(file.buffer, { organizationId: String(organizationId), mimeType });
  try {
    const fileName = String(file.originalname || '').slice(0, 200);
    order.documents.push({
      kind: 'file',
      title: (title && title.trim()) || fileName.replace(/\.[^.]+$/, '') || 'Document',
      category: category || (mimeType.startsWith('image/') ? 'photo' : 'other'),
      storageKey,
      fileName,
      mimeType,
      bytes,
      uploadedBy: createdBy,
      uploadedByName: await uploaderName(organizationId, createdBy),
      uploadedAt: new Date(),
    });
    await order.save();
  } catch (err) {
    documentStorage.remove(storageKey).catch(() => {});
    throw err;
  }
  return order;
};

const findDocumentOrThrow = (order, documentId) => {
  const doc = order.documents.id(documentId);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Document not found on this order');
  return doc;
};

/** A short-lived download URL for a stored file, or the link itself. */
const getDocumentUrl = async (ctx, orderId, documentId) => {
  const order = await findOrderOrThrow(ctx, orderId);
  const doc = findDocumentOrThrow(order, documentId);
  if (doc.kind === 'link') return { url: doc.url };
  return { url: documentStorage.signedUrl(doc.storageKey) };
};

/** Managers remove any document; everyone else only what they attached themselves. */
const removeDocument = async ({ organizationId, branchId, createdBy }, orderId, documentId, { canManage = false } = {}) => {
  requireBranch(branchId);
  const order = await findOrderOrThrow({ organizationId, branchId }, orderId);
  const doc = findDocumentOrThrow(order, documentId);
  if (!canManage && String(doc.uploadedBy || '') !== String(createdBy || '')) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Only the person who attached it or a production manager can remove this document'
    );
  }
  const { storageKey } = doc;
  doc.deleteOne();
  await order.save();
  if (storageKey) documentStorage.remove(storageKey).catch(() => {});
  return order;
};

module.exports = {
  getOrderCosts,
  getOrderActivity,
  addDocumentLink,
  uploadDocument,
  getDocumentUrl,
  removeDocument,
};
