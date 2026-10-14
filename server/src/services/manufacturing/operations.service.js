const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { ProductionOrder, User } = require('../../models');
const ApiError = require('../../utils/ApiError');
const { MAX_OPERATIONS } = require('../../config/manufacturing');
const { requireBranch, scopeFilter } = require('./common');

/**
 * Routing operations on a production order — the steps the product goes through on the
 * floor (Cutting → Welding → Painting → Assembly …). They are snapshotted from the BOM's
 * routing when the order is created (or its recipe changes before anything has started),
 * can be adjusted on the order while it's open, and are tracked one by one:
 *
 *   pending ──start──▶ in_progress ──complete──▶ completed
 *      │                                   ▲          │
 *      └────────────complete───────────────┘          │ reopen
 *      └──skip──▶ skipped ──reopen──▶ pending ◀───────┘ (or in_progress if it had started)
 *
 * Steps are not forced into sequence — shops overlap them — but starting or completing a
 * step on a Released order moves the order to In Production, as issuing material does.
 * Operations never move stock; Quality and Finished Goods stay driven by output, QC and
 * receipts, which the detail page shows after the routing.
 */

/** Elapsed time longer than a shift is not taken as time worked (see operationAction). */
const MAX_ELAPSED_AS_WORKED_MINUTES = 12 * 60;

const OPEN_FOR_ROUTING_EDITS = (order) => !['completed', 'cancelled'].includes(order.status);
const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10;

const findOrderOrThrow = async ({ organizationId, branchId }, orderId) => {
  const order = await ProductionOrder.findOne({ _id: orderId, ...scopeFilter({ organizationId, branchId }) });
  if (!order) throw new ApiError(httpStatus.NOT_FOUND, 'Production order not found');
  return order;
};

const findOperationOrThrow = (order, operationId) => {
  const op = order.operations.id(operationId);
  if (!op) throw new ApiError(httpStatus.NOT_FOUND, 'Operation not found on this order');
  return op;
};

const userName = async (organizationId, userId) => {
  if (!userId) return '';
  const user = await User.findOne({ _id: userId, organizationId }).select('name').lean();
  return (user && user.name) || '';
};

/** Order operations planned from a BOM's routing for `quantity` units of output. */
const planFromBom = (bom, quantity) =>
  ((bom && bom.operations) || []).map((op, index) => ({
    name: op.name,
    workCenter: op.workCenter || '',
    sequence: (index + 1) * 10,
    plannedMinutes: round1((op.setupMinutes || 0) + (op.runMinutesPerUnit || 0) * quantity),
    costPerHour: op.costPerHour || 0,
    instructions: op.instructions || '',
    status: 'pending',
  }));

/** Whether the routing can still be re-planned from the BOM (nothing has started). */
const canReplan = (order) => (order.operations || []).every((op) => op.status === 'pending');

const resequence = (order) => {
  order.operations.forEach((op, index) => {
    op.sequence = (index + 1) * 10; // eslint-disable-line no-param-reassign
  });
};

const assertRoutingEditable = (order) => {
  if (!OPEN_FOR_ROUTING_EDITS(order)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `A ${order.status} order's routing can no longer be changed`);
  }
};

const addOperation = async ({ organizationId, branchId, createdBy }, orderId, body) => {
  requireBranch(branchId);
  const order = await findOrderOrThrow({ organizationId, branchId }, orderId);
  assertRoutingEditable(order);
  if (order.operations.length >= MAX_OPERATIONS) {
    throw new ApiError(httpStatus.BAD_REQUEST, `An order can have at most ${MAX_OPERATIONS} operations`);
  }
  const op = {
    name: body.name,
    workCenter: body.workCenter || '',
    plannedMinutes: round1(body.plannedMinutes),
    costPerHour: Number(body.costPerHour) || 0,
    instructions: body.instructions || '',
    status: 'pending',
  };
  const afterIndex = body.afterOperationId
    ? order.operations.findIndex((o) => String(o._id) === String(body.afterOperationId))
    : -1;
  if (body.afterOperationId && afterIndex < 0) throw new ApiError(httpStatus.NOT_FOUND, 'Operation not found on this order');
  if (afterIndex >= 0) order.operations.splice(afterIndex + 1, 0, op);
  else order.operations.push(op);
  resequence(order);
  order.updatedBy = createdBy;
  await order.save();
  return order;
};

const updateOperation = async ({ organizationId, branchId, createdBy }, orderId, operationId, body) => {
  requireBranch(branchId);
  const order = await findOrderOrThrow({ organizationId, branchId }, orderId);
  assertRoutingEditable(order);
  const op = findOperationOrThrow(order, operationId);
  ['name', 'workCenter', 'instructions'].forEach((field) => {
    if (body[field] !== undefined) op[field] = body[field];
  });
  if (body.plannedMinutes !== undefined) op.plannedMinutes = round1(body.plannedMinutes);
  if (body.costPerHour !== undefined) op.costPerHour = Number(body.costPerHour) || 0;
  order.updatedBy = createdBy;
  await order.save();
  return order;
};

const removeOperation = async ({ organizationId, branchId, createdBy }, orderId, operationId) => {
  requireBranch(branchId);
  const order = await findOrderOrThrow({ organizationId, branchId }, orderId);
  assertRoutingEditable(order);
  const op = findOperationOrThrow(order, operationId);
  if (!['pending', 'skipped'].includes(op.status)) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `“${op.name}” has already started — reopen or skip it instead of removing it`
    );
  }
  op.deleteOne();
  resequence(order);
  order.updatedBy = createdBy;
  await order.save();
  return order;
};

const reorderOperations = async ({ organizationId, branchId, createdBy }, orderId, { operationIds }) => {
  requireBranch(branchId);
  const order = await findOrderOrThrow({ organizationId, branchId }, orderId);
  assertRoutingEditable(order);
  const current = order.operations.map((op) => String(op._id));
  const next = operationIds.map(String);
  if (next.length !== current.length || new Set(next).size !== next.length || next.some((x) => !current.includes(x))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Send every operation of the order exactly once');
  }
  const byId = new Map(order.operations.map((op) => [String(op._id), op.toObject()]));
  order.operations = next.map((x) => byId.get(x));
  resequence(order);
  order.updatedBy = createdBy;
  await order.save();
  return order;
};

const STARTABLE_ORDER_STATUSES = ['released', 'in_production'];
const COMPLETABLE_ORDER_STATUSES = ['released', 'in_production', 'paused'];

const orderStateError = (order, verb) => {
  if (order.status === 'paused') return `The order is paused — resume it before you ${verb} a step`;
  if (['draft', 'planned'].includes(order.status)) return `Release the order before you ${verb} a step`;
  return `A ${order.status.replace('_', ' ')} order's steps can no longer be changed`;
};

/**
 * Start / complete / skip / reopen one step. The write is conditional on the step's status
 * (and the order's) as read here, so two people tapping at once can't both win.
 */
const operationAction = async ({ organizationId, branchId, createdBy }, orderId, operationId, body) => {
  requireBranch(branchId);
  const order = await findOrderOrThrow({ organizationId, branchId }, orderId);
  const op = findOperationOrThrow(order, operationId);
  const { action } = body;
  const at = body.at ? new Date(body.at) : new Date();
  const name = await userName(organizationId, createdBy);
  const set = {};
  const p = (field) => `operations.$[op].${field}`;

  if (action === 'start') {
    if (!STARTABLE_ORDER_STATUSES.includes(order.status)) {
      throw new ApiError(httpStatus.BAD_REQUEST, orderStateError(order, 'start'));
    }
    if (op.status !== 'pending')
      throw new ApiError(httpStatus.BAD_REQUEST, `“${op.name}” is already ${op.status.replace('_', ' ')}`);
    Object.assign(set, {
      [p('status')]: 'in_progress',
      [p('startedAt')]: at,
      [p('startedBy')]: createdBy,
      [p('startedByName')]: name,
    });
  } else if (action === 'complete') {
    if (!COMPLETABLE_ORDER_STATUSES.includes(order.status)) {
      throw new ApiError(httpStatus.BAD_REQUEST, orderStateError(order, 'complete'));
    }
    if (!['pending', 'in_progress'].includes(op.status)) {
      throw new ApiError(httpStatus.BAD_REQUEST, `“${op.name}” is already ${op.status.replace('_', ' ')}`);
    }
    const startedAt = op.startedAt || null;
    if (startedAt && at < startedAt) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'A step cannot finish before it started');
    }
    // Explicit minutes win. Otherwise the elapsed time since the step started — but only
    // when it fits in a shift: a step started on Monday and closed on Tuesday wasn't worked
    // overnight, so longer spans (and steps never started) are left unrecorded (null, not
    // 0) and costed at plan.
    let actualMinutes = body.actualMinutes ?? null;
    if (actualMinutes === null && startedAt) {
      const elapsed = (at - startedAt) / 60000;
      if (elapsed <= MAX_ELAPSED_AS_WORKED_MINUTES) actualMinutes = round1(elapsed);
    }
    Object.assign(set, {
      [p('status')]: 'completed',
      [p('completedAt')]: at,
      [p('completedBy')]: createdBy,
      [p('completedByName')]: name,
      [p('actualMinutes')]: actualMinutes === null ? null : round1(actualMinutes),
    });
    if (!startedAt) Object.assign(set, { [p('startedAt')]: at, [p('startedBy')]: createdBy, [p('startedByName')]: name });
  } else if (action === 'skip') {
    if (!OPEN_FOR_ROUTING_EDITS(order)) throw new ApiError(httpStatus.BAD_REQUEST, orderStateError(order, 'skip'));
    if (op.status !== 'pending') throw new ApiError(httpStatus.BAD_REQUEST, `Only a pending step can be skipped`);
    Object.assign(set, {
      [p('status')]: 'skipped',
      [p('completedAt')]: at,
      [p('completedBy')]: createdBy,
      [p('completedByName')]: name,
    });
  } else if (action === 'reopen') {
    if (!OPEN_FOR_ROUTING_EDITS(order)) throw new ApiError(httpStatus.BAD_REQUEST, orderStateError(order, 'reopen'));
    if (!['completed', 'skipped'].includes(op.status)) {
      throw new ApiError(httpStatus.BAD_REQUEST, `Only a completed or skipped step can be reopened`);
    }
    const hadStarted = op.status === 'completed';
    Object.assign(set, {
      [p('status')]: hadStarted ? 'in_progress' : 'pending',
      [p('completedAt')]: null,
      [p('completedBy')]: null,
      [p('completedByName')]: '',
      [p('actualMinutes')]: null,
    });
    if (!hadStarted) Object.assign(set, { [p('startedAt')]: null, [p('startedBy')]: null, [p('startedByName')]: '' });
  }
  if (body.note !== undefined) set[p('note')] = body.note;
  set.updatedBy = createdBy;

  const update = { $set: set };
  // Work on the floor means production has started (mirrors the first material issue).
  if (['start', 'complete'].includes(action) && order.status === 'released') {
    set.status = 'in_production';
    if (!order.actualStartDate) set.actualStartDate = at;
    update.$push = {
      statusHistory: {
        from: 'released',
        to: 'in_production',
        note: `Operation “${op.name}” ${action === 'start' ? 'started' : 'completed'}`,
        by: createdBy,
        at: new Date(),
      },
    };
  }

  const updated = await ProductionOrder.findOneAndUpdate(
    {
      _id: order._id,
      organizationId,
      status: order.status,
      operations: { $elemMatch: { _id: op._id, status: op.status } },
    },
    update,
    { new: true, arrayFilters: [{ 'op._id': new mongoose.Types.ObjectId(String(op._id)) }] }
  );
  if (!updated) throw new ApiError(httpStatus.CONFLICT, 'This step was changed by someone else — refresh and try again');
  return updated;
};

module.exports = {
  MAX_ELAPSED_AS_WORKED_MINUTES,
  planFromBom,
  canReplan,
  addOperation,
  updateOperation,
  removeOperation,
  reorderOperations,
  operationAction,
};
