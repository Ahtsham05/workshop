const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { MaterialIssue, ProductionOrder, User } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { EXECUTABLE_PRODUCTION_STATUSES } = require('../../config/manufacturing');
const settingsService = require('./settings.service');
const stockService = require('./stock.service');
const executionService = require('./execution.service');
const voucherService = require('./materialIssueVoucher.service');
const wip = require('./wip');
const { roundQty, roundMoney, requireBranch } = require('./common');

/**
 * Editing and deleting a POSTED Material Issue Voucher, the way stock documents are handled
 * in an ERP — nothing is silently erased:
 *
 *   cancel ("delete") — the voucher's material goes back from the order's WIP into stock
 *       with contra ledger rows (wip_in −, production_issue +, refType
 *       'MaterialIssueReversal'), the order's issued quantity/cost come down, and the voucher
 *       stays on record as 'cancelled' (who, when, why). Its number is never reused.
 *   edit, header only (date, reference, notes, people) — no stock moves; logged.
 *   edit, lines (quantities, materials, batches, locations) — reversed and re-posted
 *       under the SAME id and number, in one transaction, through the normal issue pipeline.
 *
 * Material of the voucher that was already used in output, scrapped or returned can't be
 * un-issued: such a voucher accepts header edits only (cancel / line edits are refused with
 * the reason). Every edit or cancel names the revision it was made from, so two people
 * changing the same voucher can't overwrite each other.
 */

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

const fmt = (n) => String(roundQty(n));

const personOf = async (organizationId, userId) => {
  if (!userId) return undefined;
  const user = await User.findOne({ _id: userId, organizationId }).select('name email').lean();
  return user ? { userId: user._id, name: user.name || user.email } : undefined;
};

const loadIssue = async ({ organizationId, branchId }, issueId, session = null) => {
  const query = MaterialIssue.findOne({ _id: issueId, organizationId, branchId });
  if (session) query.session(session);
  const issue = await query;
  if (!issue) throw new ApiError(httpStatus.NOT_FOUND, 'Material issue not found in this branch');
  return issue;
};

const assertChangeable = (issue, revision) => {
  if (issue.kind !== 'issue') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A material return is changed by issuing again, not edited');
  }
  if (issue.status === 'cancelled') throw new ApiError(httpStatus.BAD_REQUEST, `${issue.issueNumber} is cancelled`);
  if (revision !== undefined && revision !== null && Number(revision) !== (issue.revision || 0)) {
    throw new ApiError(
      httpStatus.CONFLICT,
      `${issue.issueNumber} was changed by someone else since you opened it — reload it and try again`
    );
  }
};

/** Units of a voucher line still sitting in its own WIP lot (serials: the line's own units). */
const stillInWip = (order, line) => {
  const lot = (order.wipLots || []).find((l) => String(l._id) === String(line.wipLotId));
  if (!lot) return 0;
  if (line.imeiIds && line.imeiIds.length) {
    const inLot = new Set((lot.imeiIds || []).map(String));
    return line.imeiIds.filter((id) => inLot.has(String(id))).length;
  }
  return Math.min(lot.quantity, line.quantity);
};

/** Whether the voucher can be un-issued, line by line. */
const reversalPlan = (order, issue) => {
  const lines = issue.lines.map((l) => {
    const inWip = roundQty(stillInWip(order, l));
    return {
      productName: l.productName,
      unit: l.unit,
      quantity: l.quantity,
      inWip,
      gone: Math.max(0, roundQty(l.quantity - inWip)),
      batchNumber: l.batchNumber || null,
      totalCost: l.totalCost,
    };
  });
  return { lines, canReverse: lines.every((l) => l.gone <= wip.EPS) };
};

const lockedError = (issue, plan) => {
  const gone = plan.lines.filter((l) => l.gone > wip.EPS);
  const err = new ApiError(
    httpStatus.CONFLICT,
    `${issue.issueNumber} can’t be reversed: ${gone
      .map((l) => `${fmt(l.gone)} ${l.unit} of ${l.productName}`)
      .join(', ')} already used in output, scrapped or returned. Return what is still on the floor instead.`
  );
  err.errorCode = 'VOUCHER_LOCKED';
  err.details = plan;
  return err;
};

/** Puts the voucher's material back: WIP → stock, contra ledger rows, order totals down. */
const reverseInTx = async (order, issue, { organizationId, branchId, createdBy, session }) => {
  const plan = reversalPlan(order, issue);
  if (!plan.canReverse) throw lockedError(issue, plan);
  // eslint-disable-next-line no-restricted-syntax
  for (const line of issue.lines) {
    const lot = order.wipLots.id(line.wipLotId);
    const units = line.quantity;
    const isSerial = !!(line.imeiIds && line.imeiIds.length);
    if (isSerial) {
      const leaving = new Set(line.imeiIds.map(String));
      const keep = lot.imeiIds.map((id, i) => ({ id, sn: lot.serialNumbers ? lot.serialNumbers[i] : undefined }));
      lot.imeiIds = keep.filter((u) => !leaving.has(String(u.id))).map((u) => u.id);
      if (lot.serialNumbers) lot.serialNumbers = keep.filter((u) => !leaving.has(String(u.id))).map((u) => u.sn);
      // eslint-disable-next-line no-await-in-loop
      await stockService.setSerialStatus(line.imeiIds, {
        status: 'in_stock',
        productionOrderId: null,
        note: `${issue.issueNumber} reversed`,
        userId: createdBy,
        session,
      });
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
      batchId: isSerial ? null : lot.batchId,
      session,
    });
    const common = {
      organizationId,
      branchId,
      unitCost: line.unitCost,
      refType: 'MaterialIssueReversal',
      refId: issue._id,
      productionOrderId: order._id,
      batchId: line.batchId,
      imeiIds: isSerial ? line.imeiIds : undefined,
      serialNumbers: isSerial ? line.serialNumbers : undefined,
      createdBy,
      session,
    };
    // Contra rows of the issue's own pair: out of this order's WIP, back into stock.
    // eslint-disable-next-line no-await-in-loop
    await stockService.writeMovement(item, {
      ...common,
      type: 'wip_in',
      bucket: 'wip',
      delta: -units,
      balanceAfter: wip.wipBalanceOf(order, lot.productId, lot.variantId),
      location: issue.wipLocation || order.wipLocation,
    });
    // eslint-disable-next-line no-await-in-loop
    await stockService.writeMovement(item, {
      ...common,
      type: 'production_issue',
      delta: units,
      balanceAfter,
      location: issue.sourceLocation || order.sourceLocation,
    });
    const material = order.materials.id(line.materialLineId);
    if (material) {
      material.issuedQuantity = Math.max(0, roundQty(material.issuedQuantity - line.creditedQuantity));
      material.issuedCost = Math.max(0, roundMoney(material.issuedCost - line.totalCost));
    }
    // eslint-disable-next-line no-param-reassign
    order.materialCost = Math.max(0, roundMoney(order.materialCost - line.totalCost));
  }
  wip.pruneEmptyLots(order);
  return plan;
};

/** The order can go too when this voucher was all that happened on it. */
const orderCancellable = async (order, issue, session = null) => {
  if (!EXECUTABLE_PRODUCTION_STATUSES.includes(order.status)) return false;
  if ((order.producedQuantity || 0) > 0 || (order.completedQuantity || 0) > 0) return false;
  const query = MaterialIssue.countDocuments({
    productionOrderId: order._id,
    _id: { $ne: issue._id },
    status: { $ne: 'cancelled' },
  });
  if (session) query.session(session);
  return (await query) === 0;
};

/** What deleting would do — shown before the person confirms. */
const getReversalPreview = async (ctx, issueId) => {
  requireBranch(ctx.branchId);
  const issue = await loadIssue(ctx, issueId);
  const order = await ProductionOrder.findOne({ _id: issue.productionOrderId, organizationId: ctx.organizationId }).lean();
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
  const plan = reversalPlan(order, issue);
  return {
    issueNumber: issue.issueNumber,
    status: issue.status,
    revision: issue.revision || 0,
    ...plan,
    totalCost: issue.totalCost,
    order: {
      id: String(order._id),
      orderNumber: order.orderNumber,
      productName: order.productName,
      status: order.status,
      canCancel: issue.status === 'posted' && plan.canReverse && (await orderCancellable(order, issue)),
    },
  };
};

const cancelIssue = async (ctx, issueId, { reason, revision, cancelOrder = false } = {}) => {
  const { organizationId, branchId, createdBy } = ctx;
  requireBranch(branchId);
  const by = await personOf(organizationId, createdBy);
  return runTransaction(async (session) => {
    const issue = await loadIssue(ctx, issueId, session);
    assertChangeable(issue, revision);
    const order = await ProductionOrder.findOne({ _id: issue.productionOrderId, organizationId, branchId }).session(session);
    if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
    await reverseInTx(order, issue, { ...ctx, session });
    if (cancelOrder) {
      if (!(await orderCancellable(order, issue, session))) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `${order.orderNumber} has other issues or output — only this voucher can be cancelled`
        );
      }
      order.statusHistory.push({
        from: order.status,
        to: 'cancelled',
        note: `Cancelled with ${issue.issueNumber}: ${reason}`,
        by: createdBy,
        at: new Date(),
      });
      order.status = 'cancelled';
    }
    order.updatedBy = createdBy;
    await order.save({ session });
    issue.status = 'cancelled';
    issue.cancelledAt = new Date();
    issue.cancelledBy = by;
    issue.cancelReason = reason;
    issue.revision = (issue.revision || 0) + 1;
    await issue.save({ session });
    return issue;
  });
};

// ── Edit ─────────────────────────────────────────────────────────────────────────

const groupKey = (materialLineId, altProductId) => `${materialLineId}:${altProductId || ''}`;

/** The voucher's lines per material (FEFO may have split one material over batches). */
const groupsOf = (issue) => {
  const map = new Map();
  issue.lines.forEach((l) => {
    const key = groupKey(l.materialLineId, l.isAlternative ? l.productId : null);
    const g = map.get(key) || { quantity: 0, batches: new Set(), serials: [], productName: l.productName, unit: l.unit };
    g.quantity = roundQty(g.quantity + l.quantity);
    if (l.batchId) g.batches.add(String(l.batchId));
    (l.serialNumbers || []).forEach((s) => g.serials.push(s));
    map.set(key, g);
  });
  return map;
};

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/** Whether the new lines move any stock compared with what is posted. */
const linesChanged = (issue, lines) => {
  const old = groupsOf(issue);
  const fresh = new Map();
  lines.forEach((l) => {
    const serials = (l.serialNumbers || []).map(String).filter(Boolean);
    const quantity = serials.length || Number(l.quantity) || 0;
    if (quantity > 0) fresh.set(groupKey(l.materialLineId, l.alternativeProductId), { ...l, quantity, serials });
  });
  if (old.size !== fresh.size) return true;
  // eslint-disable-next-line no-restricted-syntax
  for (const [key, g] of old) {
    const n = fresh.get(key);
    if (!n || Math.abs(n.quantity - g.quantity) > wip.EPS) return true;
    if (n.batchId && !(g.batches.size === 1 && g.batches.has(String(n.batchId)))) return true;
    if (g.serials.length && !sameSet(g.serials, n.serials)) return true;
  }
  return false;
};

/** "Copper wire 18.375 → 20 kg; Insulation paper removed; Steel rod added 5 m". */
const linesSummary = (issue, lines, order) => {
  const old = groupsOf(issue);
  const parts = [];
  const seen = new Set();
  lines.forEach((l) => {
    const key = groupKey(l.materialLineId, l.alternativeProductId);
    const quantity = (l.serialNumbers && l.serialNumbers.length) || Number(l.quantity) || 0;
    if (!(quantity > 0)) return;
    seen.add(key);
    const g = old.get(key);
    const material = order.materials.find((m) => String(m._id) === String(l.materialLineId));
    const name = g ? g.productName : (material && material.productName) || 'Material';
    const unit = g ? g.unit : (material && material.unit) || '';
    if (!g) parts.push(`${name} added ${fmt(quantity)} ${unit}`);
    else if (Math.abs(g.quantity - quantity) > wip.EPS) parts.push(`${name} ${fmt(g.quantity)} → ${fmt(quantity)} ${unit}`);
  });
  old.forEach((g, key) => {
    if (!seen.has(key)) parts.push(`${g.productName} removed`);
  });
  return parts.join('; ') || 'Batches / serials / locations changed';
};

const headerSummary = (issue, body, people) => {
  const parts = [];
  const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
  if (body.date && day(body.date) !== day(issue.issueDate)) parts.push(`date ${day(issue.issueDate)} → ${day(body.date)}`);
  if ((body.reference || '') !== (issue.reference || '')) parts.push('reference');
  if ((body.notes || '') !== (issue.notes || '')) parts.push('notes');
  const same = (a, b) => String((a && a.userId) || '') === String((b && b.userId) || '');
  if (!same(people.requestedBy, issue.requestedBy)) parts.push('requested by');
  if (!same(people.issuedBy, issue.issuedBy)) parts.push('issued by');
  return parts.length ? `Changed ${parts.join(', ')}` : 'No changes';
};

/**
 * Edits a posted voucher. `body` = the voucher body (lines in the MIV shape) + `revision`
 * + optional `editNote`. Returns the updated voucher.
 */
const editIssue = async (ctx, issueId, body, permissions = {}) => {
  const { organizationId, branchId, createdBy } = ctx;
  requireBranch(branchId);
  const issue = await loadIssue(ctx, issueId);
  assertChangeable(issue, body.revision);
  const by = await personOf(organizationId, createdBy);
  const [requestedBy, issuedBy] = await Promise.all([
    personOf(organizationId, body.requestedById),
    personOf(organizationId, body.issuedById || (issue.issuedBy && issue.issuedBy.userId)),
  ]);
  const people = { requestedBy, issuedBy };
  const source = String(body.sourceLocation || issue.sourceLocation || '').trim();
  const wipLocation = String(body.wipLocation || issue.wipLocation || '').trim();
  const moved =
    linesChanged(issue, body.lines || []) ||
    source.toLowerCase() !== String(issue.sourceLocation || '').toLowerCase() ||
    wipLocation.toLowerCase() !== String(issue.wipLocation || '').toLowerCase();

  if (!moved) {
    // Header only: nothing moves in stock.
    const summary = headerSummary(issue, body, people);
    const updated = await MaterialIssue.findOneAndUpdate(
      { _id: issue._id, revision: issue.revision || 0, status: 'posted' },
      {
        $set: {
          issueDate: body.date || issue.issueDate,
          reference: body.reference || '',
          notes: body.notes || '',
          requestedBy: requestedBy || null,
          issuedBy: issuedBy || issue.issuedBy,
        },
        $inc: { revision: 1 },
        $push: {
          editHistory: {
            at: new Date(),
            by,
            kind: 'header',
            summary,
            note: body.editNote || '',
            previousTotal: issue.totalCost,
            newTotal: issue.totalCost,
          },
        },
      },
      { new: true }
    );
    if (!updated) throw new ApiError(httpStatus.CONFLICT, `${issue.issueNumber} was changed meanwhile — reload it`);
    return updated;
  }

  // Lines (or locations) change: reverse and re-post under the same number.
  const check = await voucherService.checkVoucher(
    ctx,
    { ...body, productionOrderId: String(issue.productionOrderId), sourceLocation: source, wipLocation },
    { giveBack: issue }
  );
  if (check.rows.length || Object.keys(check.header).length) throw voucherService.rowErrorsError(check, permissions);
  const plan = reversalPlan(check.order, issue);
  if (!plan.canReverse) throw lockedError(issue, plan);
  const overrides = voucherService.assertOverrides(check, body, permissions);
  const summary = linesSummary(issue, body.lines, check.order);
  const settings = await settingsService.getSettings(organizationId);

  return runTransaction(async (session) => {
    const current = await loadIssue(ctx, issueId, session);
    assertChangeable(current, issue.revision || 0);
    const order = await ProductionOrder.findOne({ _id: current.productionOrderId, organizationId, branchId }).session(
      session
    );
    await reverseInTx(order, current, { ...ctx, session });
    order.updatedBy = createdBy;
    await order.save({ session });
    await MaterialIssue.deleteOne({ _id: current._id }, { session });
    await executionService.issueMaterials(ctx, order._id, voucherService.issuePayload(check, body, body.lines, overrides), {
      canOverIssue: !!permissions.overIssueMaterials,
      session,
      settings,
      reuse: { issueId: current._id, issueNumber: current.issueNumber },
    });
    // Same document as before (id, number, who created it and when) — one revision on.
    await MaterialIssue.collection.updateOne(
      { _id: current._id },
      {
        $set: {
          createdAt: current.createdAt,
          createdBy: current.createdBy,
          revision: (current.revision || 0) + 1,
          editHistory: [
            ...(current.editHistory || []).map((h) => (h.toObject ? h.toObject() : h)),
            {
              at: new Date(),
              by,
              kind: 'lines',
              summary,
              note: body.editNote || '',
              previousTotal: current.totalCost,
            },
          ],
        },
      },
      { session }
    );
    const updated = await MaterialIssue.findById(current._id).session(session);
    await MaterialIssue.collection.updateOne(
      { _id: current._id },
      { $set: { [`editHistory.${updated.editHistory.length - 1}.newTotal`]: updated.totalCost } },
      { session }
    );
    return MaterialIssue.findById(current._id).session(session);
  });
};

module.exports = { getReversalPreview, cancelIssue, editIssue, reversalPlan, linesChanged };
