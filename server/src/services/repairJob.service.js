const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { RepairJob, Product, User, Organization, RepairStockItem, Membership } = require('../models');
const ApiError = require('../utils/ApiError');
const {
  parseBusinessDateTime,
  applyBusinessDateRange,
  getBusinessDayRange,
  startOfBusinessDay,
  toBusinessCalendarDate,
} = require('../utils/businessTimezone');
const { escapeRegex } = require('../utils/listSearchFilter');
const cashBookService = require('./cashBook.service');
const walletEntryService = require('./walletEntry.service');
const commissionEngineService = require('./commissionEngine.service');
const stockAdjustmentService = require('./stockAdjustment.service');

/**
 * Repair tickets: intake → diagnosis → estimate approval → parts → repair → ready →
 * delivered (or cancelled), with parts taken from real inventory and every payment posted
 * to the cash book / wallet on its own. See repairJob.model.js for the field contract the
 * reports rely on.
 */

const { OPEN_STATUSES } = RepairJob;
const CLOSED_STATUSES = ['delivered', 'cancelled'];

const STATUS_LABELS = {
  pending: 'Received',
  diagnosing: 'Diagnosing',
  waiting_approval: 'Waiting for approval',
  waiting_parts: 'Waiting for parts',
  in_progress: 'In repair',
  completed: 'Ready for pickup',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const oid = (id) => (id && mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(String(id)) : null);
const isWallet = (method, wallet) => method === 'wallet' && !!wallet;

const parseDate = (value) => {
  if (value == null || value === '') return undefined;
  return parseBusinessDateTime(value) || new Date(value);
};

/** RJ-1001, RJ-1002, … per organization (same _sequences pattern as warranty claims). */
const generateJobNumber = async (organizationId) => {
  const result = await mongoose.connection.db
    .collection('_sequences')
    .findOneAndUpdate(
      { _id: `repairJob_${organizationId}` },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
  const seq = Number(result?.seq ?? result?.value?.seq) || 1;
  return `RJ-${1000 + seq}`;
};

const actorName = async (actor) => {
  if (!actor) return '';
  if (actor.name) return actor.name;
  if (!actor.id) return '';
  return (await User.findById(actor.id).select('name').lean())?.name || '';
};

const pushTimeline = async (job, entry, actor) => {
  job.timeline.push({ at: new Date(), byUserId: actor?.id || null, byUserName: await actorName(actor), ...entry });
};

const ledgerText = (job) => `Repair ${job.jobNumber ? `${job.jobNumber} ` : ''}— ${job.deviceModel} (${job.customerName})`;

// ─── Totals ──────────────────────────────────────────────────────────────────

const signedPayment = (p) => (p.kind === 'refund' ? -1 : 1) * (Number(p.amount) || 0);

/** Derives charges / cost / advanceAmount (the fields reports read) from items + payments. */
const recalc = (job) => {
  const items = job.items || [];
  if (items.length) {
    const subtotal = items.reduce((s, i) => s + i.quantity * (i.unitPrice || 0), 0);
    job.charges = round2(Math.max(0, subtotal - (job.discount || 0)));
    job.cost = round2(items.reduce((s, i) => s + i.quantity * (i.unitCost || 0), 0) + (job.directCost || 0));
  } else {
    job.charges = job.status === 'cancelled' ? 0 : round2(Math.max(0, (job.estimatedCharges || 0) - (job.discount || 0)));
    job.cost = round2(job.directCost || 0);
  }
  if (job.paymentsVersion >= 2) {
    job.advanceAmount = round2(
      Math.max(
        0,
        (job.payments || []).reduce((s, p) => s + signedPayment(p), 0)
      )
    );
    const last = [...(job.payments || [])].reverse().find((p) => p.kind !== 'refund');
    if (last) {
      job.paymentMethod = last.paymentMethod;
      job.walletType = last.walletType;
    }
  }
};

const balanceOf = (job) => round2((job.charges || 0) - (job.advanceAmount || 0));

/**
 * Brings a job saved before itemised billing onto payments[] / items[] without moving
 * money: its one cash book / wallet line (keyed by the job id) becomes a legacy payment
 * keyed by the same id, and its flat charges/cost become one service line.
 */
const ensureV2 = (job) => {
  if (job.paymentsVersion >= 2) return false;
  const settled = job.status === 'delivered' || job.status === 'completed';
  // Exactly what the old sync posted (see git history of this file: computeRepairCashAmount).
  const posted = settled ? Number(job.charges || 0) : Number(job.advanceAmount || 0);
  if (posted > 0) {
    job.payments.push({
      amount: posted,
      paymentMethod: job.paymentMethod || 'cash',
      walletType: job.walletType,
      date: job.date,
      kind: 'advance',
      note: 'Recorded before itemised payments',
      ledgerRefId: job._id,
      legacy: true,
    });
  }
  if (!job.items.length && (Number(job.charges) > 0 || Number(job.cost) > 0)) {
    job.items.push({
      kind: 'service',
      name: 'Repair charges',
      quantity: 1,
      unitPrice: Number(job.charges) || 0,
      unitCost: Number(job.cost) || 0,
      addedAt: job.date,
    });
  }
  if (!job.estimatedCharges) job.estimatedCharges = Number(job.charges) || 0;
  job.paymentsVersion = 2;
  recalc(job);
  return true;
};

// ─── Money posting ───────────────────────────────────────────────────────────

/** Posts one payment (income) or refund (out) to the cash book or its wallet. */
const postPayment = async (job, p, actor) => {
  const refund = p.kind === 'refund';
  const description = `${refund ? 'Refund — ' : ''}${ledgerText(job)}`;
  if (!isWallet(p.paymentMethod, p.walletType) && p.amount > 0) {
    await cashBookService.upsertReferenceEntry({
      organizationId: job.organizationId,
      branchId: job.branchId,
      type: refund ? 'expense' : 'income',
      source: 'repair',
      amount: p.amount,
      paymentMethod: p.paymentMethod,
      referenceId: p.ledgerRefId,
      referenceModel: 'RepairJob',
      description,
      date: p.date,
      createdBy: actor?.id || job.createdBy,
    });
  }
  await walletEntryService.syncWalletPayment({
    organizationId: job.organizationId,
    branchId: job.branchId,
    referenceId: p.ledgerRefId,
    referenceModel: 'RepairJob',
    direction: refund ? 'out' : 'in',
    amount: p.amount,
    paymentMethod: p.paymentMethod,
    walletType: p.walletType,
    description,
    date: p.date,
    createdBy: actor?.id || job.createdBy,
  });
};

const unpostPayment = async (job, p, actor) => {
  const refund = p.kind === 'refund';
  await cashBookService.deleteEntryByReferenceAndType(p.ledgerRefId, 'RepairJob', refund ? 'expense' : 'income', 'repair');
  await walletEntryService.reverseWalletPayment({
    organizationId: job.organizationId,
    branchId: job.branchId,
    referenceId: p.ledgerRefId,
    referenceModel: 'RepairJob',
    direction: refund ? 'out' : 'in',
    amount: p.amount,
    paymentMethod: p.paymentMethod,
    walletType: p.walletType,
    userId: actor?.id,
  });
};

/** A part bought outside for this job and paid from a cash/bank/wallet account. */
const postPartPurchase = async (job, item, actor) => {
  if (!item.paidOutMethod || !(item.quantity * item.unitCost > 0)) return;
  const amount = round2(item.quantity * item.unitCost);
  const description = `Part for ${job.jobNumber || 'repair'}: ${item.name}`;
  if (!isWallet(item.paidOutMethod, item.paidOutWallet)) {
    await cashBookService.upsertReferenceEntry({
      organizationId: job.organizationId,
      branchId: job.branchId,
      type: 'expense',
      source: 'purchase',
      amount,
      paymentMethod: item.paidOutMethod,
      referenceId: item._id,
      referenceModel: 'RepairJob',
      description,
      date: item.addedAt,
      createdBy: actor?.id,
    });
  }
  await walletEntryService.syncWalletPayment({
    organizationId: job.organizationId,
    branchId: job.branchId,
    referenceId: item._id,
    referenceModel: 'RepairJob',
    direction: 'out',
    amount,
    paymentMethod: item.paidOutMethod,
    walletType: item.paidOutWallet,
    description,
    date: item.addedAt,
    createdBy: actor?.id,
  });
};

const unpostPartPurchase = async (job, item, actor) => {
  if (!item.paidOutMethod) return;
  await cashBookService.deleteEntryByReferenceAndType(item._id, 'RepairJob', 'expense', 'purchase');
  await walletEntryService.reverseWalletPayment({
    organizationId: job.organizationId,
    branchId: job.branchId,
    referenceId: item._id,
    referenceModel: 'RepairJob',
    direction: 'out',
    amount: round2(item.quantity * item.unitCost),
    paymentMethod: item.paidOutMethod,
    walletType: item.paidOutWallet,
    userId: actor?.id,
  });
};

/** Puts an inventory part back on the shelf. */
const returnPartToStock = async (job, item, actor) => {
  if (!item.adjustmentId) return;
  await stockAdjustmentService.reverseAdjustment({
    adjustmentId: item.adjustmentId,
    organizationId: job.organizationId,
    reversedBy: actor?.id,
    fromRepairJob: true,
  });
};

/** Keeps the job's one repair-stock usage entry (its direct repair cost) in step. */
const syncDirectCost = async (job, actor) => {
  const amount = round2(job.directCost || 0);
  if (amount > 0) {
    await RepairStockItem.findOneAndUpdate(
      { repairJobId: job._id, type: 'repair_usage' },
      {
        $set: {
          organizationId: job.organizationId,
          branchId: job.branchId,
          amount,
          description: `Repair ${job.jobNumber || ''} — ${job.deviceModel} (${job.customerName})`
            .replace(/\s+/g, ' ')
            .trim(),
          repairJobRef: job.jobNumber || String(job._id).slice(-6).toUpperCase(),
          updatedBy: actor?.id,
        },
        $setOnInsert: { date: new Date(), createdBy: actor?.id },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } else {
    await RepairStockItem.deleteMany({ repairJobId: job._id });
  }
};

const syncCommission = (job, actor) => {
  commissionEngineService.syncCommissionForRepairJob(job, actor?.id || job.createdBy).catch(() => {});
};

// ─── Lookups ─────────────────────────────────────────────────────────────────

const scopeFilter = (scope) => {
  const filter = { organizationId: oid(scope.organizationId) };
  if (scope.branchId) filter.branchId = oid(scope.branchId);
  return filter;
};

const findJobOrThrow = async (scope, repairJobId) => {
  const job = oid(repairJobId) ? await RepairJob.findOne({ _id: repairJobId, ...scopeFilter(scope) }) : null;
  if (!job) throw new ApiError(httpStatus.NOT_FOUND, 'Repair job not found');
  return job;
};

const populateJob = (job) => job.populate([{ path: 'salesmanId', select: 'name salesmanCode' }]);

const getRepairJobById = async (scope, repairJobId) => {
  const job = await findJobOrThrow(scope, repairJobId);
  // Reading a legacy job shows it in its converted shape; nothing is saved (or posted) here.
  ensureV2(job);
  return populateJob(job);
};

const applySearch = (filter, q) => {
  const text = String(q || '').trim();
  if (!text) return;
  const rx = new RegExp(escapeRegex(text), 'i');
  const digits = text.replace(/\D/g, '');
  filter.$or = [
    { jobNumber: rx },
    { customerName: rx },
    { deviceModel: rx },
    { brand: rx },
    { serialNumber: rx },
    { issue: rx },
    { phone: digits.length >= 3 ? new RegExp(escapeRegex(digits)) : rx },
  ];
};

const queryRepairJobs = async (filter, options) => {
  const queryFilter = { ...filter };
  const queryOptions = { ...options };
  const { q, view } = queryOptions;
  delete queryOptions.q;
  delete queryOptions.view;

  applyBusinessDateRange(queryOptions, 'date');
  if (queryOptions.date) {
    queryFilter.date = queryOptions.date;
    delete queryOptions.date;
  }

  if (typeof queryFilter.status === 'string' && queryFilter.status.includes(',')) {
    queryFilter.status = {
      $in: queryFilter.status
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  if (view === 'open') queryFilter.status = { $in: OPEN_STATUSES };
  if (view === 'overdue') {
    queryFilter.status = { $in: [...OPEN_STATUSES] };
    queryFilter.dueDate = { $ne: null, $lt: new Date() };
  }
  if (view === 'unpaid') {
    queryFilter.status = { $in: ['completed', 'delivered'] };
    queryFilter.$expr = { $gt: [{ $ifNull: ['$charges', 0] }, { $ifNull: ['$advanceAmount', 0] }] };
  }
  if (queryFilter.technicianId) queryFilter.technicianId = oid(queryFilter.technicianId);
  applySearch(queryFilter, q);

  const result = await RepairJob.paginate(queryFilter, {
    ...queryOptions,
    sortBy: queryOptions.sortBy || 'date:desc',
    populate: [{ path: 'salesmanId', select: 'name salesmanCode' }],
  });
  // Show legacy jobs in their converted shape so the list and the job agree (nothing saved).
  result.results.forEach((job) => {
    if (job instanceof mongoose.Document) ensureV2(job);
  });
  return result;
};

/** Header numbers + per-status counts for the queue tabs. */
const getStats = async (filter) => {
  const match = {
    organizationId: oid(filter.organizationId),
    ...(filter.branchId ? { branchId: oid(filter.branchId) } : {}),
  };
  const now = new Date();
  const today = toBusinessCalendarDate(now);
  const monthStart = startOfBusinessDay(`${today.slice(0, 7)}-01`);
  const dayStart = getBusinessDayRange(now).start;
  const [byStatus, money] = await Promise.all([
    RepairJob.aggregate([{ $match: match }, { $group: { _id: { $ifNull: ['$status', 'pending'] }, count: { $sum: 1 } } }]),
    RepairJob.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          overdue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $in: ['$status', OPEN_STATUSES] },
                    { $ne: [{ $ifNull: ['$dueDate', null] }, null] },
                    { $lt: ['$dueDate', now] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          receivedToday: { $sum: { $cond: [{ $gte: ['$date', dayStart] }, 1, 0] } },
          outstanding: {
            $sum: {
              $cond: [
                { $in: ['$status', ['completed', 'delivered']] },
                { $max: [0, { $subtract: [{ $ifNull: ['$charges', 0] }, { $ifNull: ['$advanceAmount', 0] }] }] },
                0,
              ],
            },
          },
          deliveredThisMonth: {
            $sum: { $cond: [{ $and: [{ $eq: ['$status', 'delivered'] }, { $gte: ['$deliveredAt', monthStart] }] }, 1, 0] },
          },
          revenueThisMonth: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'delivered'] }, { $gte: ['$deliveredAt', monthStart] }] },
                { $ifNull: ['$charges', 0] },
                0,
              ],
            },
          },
          profitThisMonth: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'delivered'] }, { $gte: ['$deliveredAt', monthStart] }] },
                { $subtract: [{ $ifNull: ['$charges', 0] }, { $ifNull: ['$cost', 0] }] },
                0,
              ],
            },
          },
          turnaroundMs: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$status', 'delivered'] }, { $gte: ['$deliveredAt', monthStart] }] },
                { $subtract: ['$deliveredAt', '$date'] },
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);
  const counts = Object.fromEntries(byStatus.map((r) => [r._id, r.count]));
  const total = byStatus.reduce((s, r) => s + r.count, 0);
  const m = money[0] || {};
  return {
    total,
    counts,
    open: OPEN_STATUSES.reduce((s, k) => s + (counts[k] || 0), 0),
    overdue: m.overdue || 0,
    receivedToday: m.receivedToday || 0,
    readyForPickup: counts.completed || 0,
    outstanding: round2(m.outstanding || 0),
    deliveredThisMonth: m.deliveredThisMonth || 0,
    revenueThisMonth: round2(m.revenueThisMonth || 0),
    profitThisMonth: round2(m.profitThisMonth || 0),
    avgTurnaroundHours: m.deliveredThisMonth ? Math.round(m.turnaroundMs / m.deliveredThisMonth / 3600000) : null,
  };
};

/** Earlier jobs for the same device (serial) or customer (phone) — shown at intake. */
const lookupHistory = async (filter, { serial, phone, excludeId }) => {
  const or = [];
  const s = String(serial || '').trim();
  if (s.length >= 4) or.push({ serialNumber: new RegExp(`^${escapeRegex(s)}$`, 'i') });
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 7) or.push({ phone: new RegExp(`${escapeRegex(digits.slice(-10))}$`) });
  if (!or.length) return [];
  const rows = await RepairJob.find({
    ...scopeFilter(filter),
    $or: or,
    ...(oid(excludeId) ? { _id: { $ne: oid(excludeId) } } : {}),
  })
    .sort({ date: -1 })
    .limit(8)
    .select(
      'jobNumber customerName phone deviceType brand deviceModel serialNumber issue status date deliveredAt warrantyUntil charges advanceAmount'
    )
    .lean();
  const now = Date.now();
  return rows.map((r) => ({
    id: String(r._id),
    jobNumber: r.jobNumber || null,
    customerName: r.customerName,
    phone: r.phone,
    deviceType: r.deviceType || 'mobile',
    brand: r.brand,
    deviceModel: r.deviceModel,
    serialNumber: r.serialNumber,
    issue: r.issue,
    status: r.status,
    date: r.date,
    deliveredAt: r.deliveredAt,
    warrantyUntil: r.warrantyUntil,
    inWarranty: !!(r.warrantyUntil && new Date(r.warrantyUntil).getTime() >= now),
    sameDevice: !!(s && r.serialNumber && r.serialNumber.toLowerCase() === s.toLowerCase()),
  }));
};

/** Staff who can be assigned — users of the organization plus names typed on older jobs. */
/**
 * Who a job can be assigned to: the branch's active staff, then names typed on earlier
 * jobs (the old free-text field) — merged case-insensitively ("abd" = "ABD"), skipping
 * any that match a staff name, most-used first and capped so the list stays usable.
 */
const getTechnicians = async (filter) => {
  const orgId = oid(filter.organizationId);
  const branchId = filter.branchId ? oid(filter.branchId) : null;
  const memberIds = branchId
    ? (
        await Membership.find({ organizationId: orgId, branchId, isActive: { $ne: false } })
          .select('userId')
          .lean()
      ).map((m) => m.userId)
    : null;
  const [users, typed] = await Promise.all([
    User.find({ organizationId: orgId, isActive: { $ne: false }, ...(memberIds ? { _id: { $in: memberIds } } : {}) })
      .select('name')
      .sort({ name: 1 })
      .lean(),
    RepairJob.aggregate([
      { $match: { ...scopeFilter(filter), technician: { $nin: [null, ''] } } },
      { $sort: { date: -1 } },
      {
        $group: {
          _id: { $toLower: { $trim: { input: '$technician' } } },
          name: { $first: { $trim: { input: '$technician' } } },
          jobs: { $sum: 1 },
          last: { $first: '$date' },
        },
      },
      { $sort: { jobs: -1, last: -1 } },
      { $limit: 60 },
    ]),
  ]);
  const seen = new Set();
  const staff = [];
  users.forEach((u) => {
    const name = String(u.name || '').trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    staff.push({ id: String(u._id), name, source: 'staff' });
  });
  const earlier = typed
    .filter((t) => t._id && !seen.has(t._id))
    .slice(0, 20)
    .map((t) => ({ id: null, name: t.name, source: 'typed', jobs: t.jobs }));
  return [...staff, ...earlier];
};

/** Most recent parts fitted across jobs. */
const getPartsUsage = async (filter, { limit = 25 } = {}) => {
  const rows = await RepairJob.aggregate([
    { $match: { ...scopeFilter(filter), 'items.kind': 'part' } },
    { $unwind: '$items' },
    { $match: { 'items.kind': 'part' } },
    { $sort: { 'items.addedAt': -1 } },
    { $limit: Math.min(Number(limit) || 25, 100) },
    {
      $project: {
        jobId: '$_id',
        jobNumber: 1,
        customerName: 1,
        deviceModel: 1,
        status: 1,
        name: '$items.name',
        quantity: '$items.quantity',
        unitCost: '$items.unitCost',
        unitPrice: '$items.unitPrice',
        fromStock: { $ne: [{ $ifNull: ['$items.productId', null] }, null] },
        addedAt: '$items.addedAt',
      },
    },
  ]);
  return rows.map(({ _id, jobId, ...r }) => ({ ...r, jobId: String(jobId) }));
};

// ─── Writes ──────────────────────────────────────────────────────────────────

const DETAIL_FIELDS = [
  'customerName',
  'phone',
  'customerId',
  'deviceType',
  'brand',
  'deviceModel',
  'serialNumber',
  'color',
  'accessories',
  'lockType',
  'lockCode',
  'conditionChecks',
  'conditionNotes',
  'problems',
  'issue',
  'diagnosis',
  'internalNotes',
  'priority',
  'dueDate',
  'technician',
  'technicianId',
  'estimatedCharges',
  'discount',
  'directCost',
  'warrantyDays',
  'salesmanId',
  'date',
];

const applyDetails = (job, body) => {
  DETAIL_FIELDS.forEach((key) => {
    if (!(key in body)) return;
    let value = body[key];
    if (key === 'dueDate' || key === 'date') value = value ? parseDate(value) : key === 'date' ? job.date : null;
    if (['customerId', 'technicianId', 'salesmanId'].includes(key)) value = value || null;
    job[key] = value;
  });
};

const resolveTechnicianName = async (job) => {
  if (job.technicianId && !job.technician) {
    job.technician = (await User.findById(job.technicianId).select('name').lean())?.name || '';
  }
};

const createRepairJob = async (body, actor) => {
  const { advance, status, ...rest } = body;
  // Older clients (and the AI assistant) sent the estimate as `charges`.
  if (rest.estimatedCharges == null && rest.charges != null) rest.estimatedCharges = rest.charges;
  const job = new RepairJob({
    organizationId: body.organizationId,
    branchId: body.branchId,
    createdBy: body.createdBy || actor?.id,
    updatedBy: actor?.id,
    status: status && OPEN_STATUSES.includes(status) ? status : 'pending',
    paymentsVersion: 2,
    jobNumber: await generateJobNumber(body.organizationId),
  });
  applyDetails(job, rest);
  if (!job.date) job.date = new Date();
  await resolveTechnicianName(job);
  recalc(job);

  // Legacy clients sent `advanceAmount` + `paymentMethod` on the job itself.
  const advanceAmount = Number(advance?.amount ?? body.advanceAmount ?? 0);
  let advancePayment = null;
  if (advanceAmount > 0) {
    if (job.charges > 0 && advanceAmount > job.charges) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Advance is more than the estimated charges');
    }
    const paymentId = new mongoose.Types.ObjectId();
    advancePayment = {
      _id: paymentId,
      ledgerRefId: paymentId,
      amount: round2(advanceAmount),
      paymentMethod: advance?.paymentMethod || body.paymentMethod || 'cash',
      walletType: advance?.walletType || body.walletType || undefined,
      date: job.date,
      kind: 'advance',
      receivedBy: actor?.id,
    };
    job.payments.push(advancePayment);
  }
  await pushTimeline(job, { action: 'created', status: job.status, note: 'Device received' }, actor);
  recalc(job);
  await job.save();

  if (advancePayment) await postPayment(job, job.payments[0], actor);
  syncCommission(job, actor);
  return populateJob(job);
};

/** Edits the ticket's details (customer, device, problem, estimate, technician, …). */
const updateRepairJob = async (scope, repairJobId, body, actor) => {
  const job = await findJobOrThrow(scope, repairJobId);
  ensureV2(job);
  const prevTechnicianId = job.technicianId ? String(job.technicianId) : null;
  const prevDirectCost = round2(job.directCost || 0);
  if ('directCost' in body && CLOSED_STATUSES.includes(job.status) && round2(body.directCost) !== prevDirectCost) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This job is closed — reopen it to change the repair cost');
  }
  applyDetails(job, body);
  if (
    'technicianId' in body &&
    String(body.technicianId || '') !== String(prevTechnicianId || '') &&
    !('technician' in body)
  ) {
    job.technician = '';
  }
  await resolveTechnicianName(job);
  if (job.discount > 0) {
    const gross = job.items.length
      ? job.items.reduce((s, i) => s + i.quantity * (i.unitPrice || 0), 0)
      : job.estimatedCharges || 0;
    if (job.discount > gross) throw new ApiError(httpStatus.BAD_REQUEST, 'Discount is more than the bill');
  }
  recalc(job);
  job.updatedBy = actor?.id;
  if ('technicianId' in body && String(body.technicianId || '') !== String(prevTechnicianId || '')) {
    await pushTimeline(
      job,
      { action: 'edit', note: job.technician ? `Assigned to ${job.technician}` : 'Technician unassigned' },
      actor
    );
  }
  if ('diagnosis' in body && body.diagnosis) {
    await pushTimeline(job, { action: 'note', note: `Diagnosis: ${body.diagnosis}` }, actor);
  }
  const directCostChanged = 'directCost' in body && round2(job.directCost || 0) !== prevDirectCost;
  if (directCostChanged) {
    await pushTimeline(
      job,
      { action: 'part', note: `Repair cost from repair stock: ${prevDirectCost} → ${round2(job.directCost || 0)}` },
      actor
    );
  }
  await job.save();
  if (directCostChanged) await syncDirectCost(job, actor);
  syncCommission(job, actor);
  return populateJob(job);
};

/**
 * Moves the ticket along. Delivering needs the bill settled unless `allowCredit`;
 * cancelling puts inventory parts back on the shelf and bills only the optional fee.
 */
const changeStatus = async (scope, repairJobId, { status, note, outcome, cancelReason, fee, allowCredit }, actor) => {
  const job = await findJobOrThrow(scope, repairJobId);
  ensureV2(job);
  const from = job.status || 'pending';
  if (from === status) throw new ApiError(httpStatus.BAD_REQUEST, `Job is already ${STATUS_LABELS[status] || status}`);
  if (from === 'delivered' && status !== 'completed') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A delivered job can only be moved back to Ready for pickup');
  }

  if (status === 'cancelled') {
    // Inventory parts go back on the shelf; outside parts and service lines are dropped too —
    // a cancelled job bills only the checking fee, if any.
    for (const item of job.items.filter((i) => i.adjustmentId)) {
      // eslint-disable-next-line no-await-in-loop
      await returnPartToStock(job, item, actor);
    }
    // A part bought outside was really paid for — keep it (and its expense) at no charge.
    const keptOutside = job.items.filter((i) => !i.adjustmentId && i.kind === 'part' && i.paidOutMethod);
    job.items = keptOutside.map((i) => ({ ...i.toObject(), unitPrice: 0 }));
    job.discount = 0;
    if (Number(fee) > 0)
      job.items.push({
        kind: 'service',
        name: 'Checking / cancellation fee',
        quantity: 1,
        unitPrice: round2(fee),
        unitCost: 0,
        addedBy: actor?.id,
      });
    job.cancelReason = cancelReason || note || '';
    job.cancelledAt = new Date();
    // The repair cost goes back to the repair stock balance, like stock parts go back on the shelf.
    job.directCost = 0;
  }
  if (status === 'completed') {
    job.completedAt = job.completedAt || new Date();
    job.outcome = outcome || job.outcome || 'repaired';
  }

  job.status = status;
  recalc(job);

  if (status === 'delivered') {
    if (balanceOf(job) > 0 && !allowCredit) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `Balance of ${balanceOf(job)} is still due — collect it or deliver on credit`
      );
    }
    job.completedAt = job.completedAt || new Date();
    job.outcome = job.outcome || 'repaired';
    job.deliveredAt = new Date();
    job.warrantyUntil =
      job.warrantyDays > 0 && job.outcome === 'repaired'
        ? new Date(job.deliveredAt.getTime() + job.warrantyDays * 86400000)
        : null;
  }
  if (from === 'delivered') {
    job.deliveredAt = undefined;
    job.warrantyUntil = null;
  }
  if (from === 'cancelled') job.cancelledAt = undefined;

  const extra = status === 'cancelled' && job.cancelReason ? job.cancelReason : note;
  await pushTimeline(
    job,
    {
      action: 'status',
      status,
      note: [`${STATUS_LABELS[from] || from} → ${STATUS_LABELS[status] || status}`, extra].filter(Boolean).join(' · '),
    },
    actor
  );
  job.updatedBy = actor?.id;
  await job.save();
  if (status === 'cancelled') await syncDirectCost(job, actor);
  syncCommission(job, actor);
  return populateJob(job);
};

const addItem = async (scope, repairJobId, body, actor) => {
  const job = await findJobOrThrow(scope, repairJobId);
  ensureV2(job);
  if (CLOSED_STATUSES.includes(job.status))
    throw new ApiError(httpStatus.BAD_REQUEST, 'This job is closed — reopen it to change the bill');

  const quantity = Number(body.quantity) || 1;
  const item = {
    _id: new mongoose.Types.ObjectId(),
    kind: body.kind,
    name: (body.name || '').trim(),
    quantity,
    unitPrice: round2(body.unitPrice),
    unitCost: round2(body.unitCost),
    addedAt: new Date(),
    addedBy: actor?.id,
  };

  if (body.kind === 'part' && body.productId) {
    const product = await Product.findOne({
      _id: body.productId,
      organizationId: job.organizationId,
      branchId: job.branchId,
    });
    if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'Part not found in this branch');
    if (product.trackImei || product.trackSerial) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `${product.name} is tracked by IMEI/serial — it can't be used as a repair part`
      );
    }
    const adjustment = await stockAdjustmentService.createAdjustment({
      organizationId: job.organizationId,
      branchId: job.branchId,
      productId: product._id,
      variantId: body.variantId || undefined,
      batchId: body.batchId || undefined,
      quantity,
      type: 'repair_part',
      reason: `Repair ${job.jobNumber || ''} — ${job.customerName}`.trim(),
      repairJobId: job._id,
      createdBy: actor?.id,
    });
    Object.assign(item, {
      productId: product._id,
      variantId: body.variantId || null,
      batchId: body.batchId || null,
      adjustmentId: adjustment._id,
      name: item.name || adjustment.productName || product.name,
      unitCost: round2(adjustment.unitCost || 0),
      unitPrice: body.unitPrice != null ? round2(body.unitPrice) : round2(product.price),
    });
  } else if (!item.name) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Enter a name for this line');
  }
  if (body.kind === 'part' && !body.productId && body.paidOutMethod) {
    item.paidOutMethod = body.paidOutMethod;
    item.paidOutWallet = body.paidOutMethod === 'wallet' ? body.paidOutWallet : undefined;
  }

  job.items.push(item);
  // The part the job was waiting for has arrived — work resumes without an extra click.
  if (body.kind === 'part' && job.status === 'waiting_parts') job.status = 'in_progress';
  recalc(job);
  await pushTimeline(
    job,
    {
      action: 'part',
      note: `Added ${item.kind === 'part' ? 'part' : 'service'}: ${item.name} × ${quantity}${
        item.adjustmentId ? ' (from stock)' : ''
      }`,
    },
    actor
  );
  job.updatedBy = actor?.id;
  try {
    await job.save();
  } catch (err) {
    // Saving failed after the part left the shelf — put it back.
    if (item.adjustmentId) await returnPartToStock(job, item, actor).catch(() => {});
    throw err;
  }
  const saved = job.items.id(item._id);
  await postPartPurchase(job, saved, actor);
  syncCommission(job, actor);
  return populateJob(job);
};

/**
 * Saves the whole bill in one go, the way an invoice is saved: lines added, changed and
 * removed, plus discount and repair cost. Stock only moves here. New stock lines are
 * validated up front; if a stock move or the save fails part-way, this batch's own stock
 * moves are put back, so a failed save leaves stock as it was.
 */
const saveBill = async (scope, repairJobId, body, actor) => {
  const job = await findJobOrThrow(scope, repairJobId);
  ensureV2(job);
  if (CLOSED_STATUSES.includes(job.status)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This job is closed — reopen it to change the bill');
  }
  const add = body.add || [];
  const update = body.update || [];
  const remove = [...new Set((body.remove || []).map(String))];

  // ── Validate everything before anything moves ──
  for (const id of remove) {
    if (!job.items.id(id))
      throw new ApiError(httpStatus.NOT_FOUND, 'A line being removed no longer exists — refresh the job');
  }
  for (const u of update) {
    const item = job.items.id(u.itemId);
    if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'A line being changed no longer exists — refresh the job');
    if (remove.includes(String(u.itemId))) continue;
    if (
      item.adjustmentId &&
      ((u.quantity != null && Number(u.quantity) !== item.quantity) ||
        (u.unitCost != null && round2(u.unitCost) !== item.unitCost))
    ) {
      throw new ApiError(
        httpStatus.BAD_REQUEST,
        `${item.name}: quantity and cost of a part from stock come from inventory — remove it and add it again`
      );
    }
  }
  const productIds = [...new Set(add.filter((a) => a.kind === 'part' && a.productId).map((a) => String(a.productId)))];
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds }, organizationId: job.organizationId, branchId: job.branchId })
    : [];
  const productById = new Map(products.map((p) => [String(p._id), p]));
  for (const a of add) {
    if (a.kind === 'part' && a.productId) {
      const product = productById.get(String(a.productId));
      if (!product) throw new ApiError(httpStatus.NOT_FOUND, 'A part is no longer in this branch — refresh and try again');
      if (product.trackImei || product.trackSerial) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `${product.name} is tracked by IMEI/serial — it can't be used as a repair part`
        );
      }
    } else if (!String(a.name || '').trim()) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Every line needs a name');
    }
  }

  const moved = []; // stock moves made by this save — undone if it fails
  const undo = async () => {
    for (const item of moved) {
      // eslint-disable-next-line no-await-in-loop
      await returnPartToStock(job, item, actor).catch(() => {});
    }
  };
  const notes = [];
  const newItems = [];
  const reposts = [];
  try {
    // ── Added lines (stock leaves the shelf here) ──
    for (const a of add) {
      const quantity = Number(a.quantity) || 1;
      const item = {
        _id: new mongoose.Types.ObjectId(),
        kind: a.kind,
        name: String(a.name || '').trim(),
        quantity,
        unitPrice: round2(a.unitPrice),
        unitCost: round2(a.unitCost),
        addedAt: new Date(),
        addedBy: actor?.id,
      };
      if (a.kind === 'part' && a.productId) {
        const product = productById.get(String(a.productId));
        // eslint-disable-next-line no-await-in-loop
        const adjustment = await stockAdjustmentService.createAdjustment({
          organizationId: job.organizationId,
          branchId: job.branchId,
          productId: product._id,
          variantId: a.variantId || undefined,
          batchId: a.batchId || undefined,
          quantity,
          type: 'repair_part',
          reason: `Repair ${job.jobNumber || ''} — ${job.customerName}`.trim(),
          repairJobId: job._id,
          createdBy: actor?.id,
        });
        Object.assign(item, {
          productId: product._id,
          variantId: a.variantId || null,
          batchId: a.batchId || null,
          adjustmentId: adjustment._id,
          name: item.name || adjustment.productName || product.name,
          unitCost: round2(adjustment.unitCost || 0),
          unitPrice: a.unitPrice != null ? round2(a.unitPrice) : round2(product.price),
        });
        moved.push(item);
      }
      if (a.kind === 'part' && !a.productId && a.paidOutMethod) {
        item.paidOutMethod = a.paidOutMethod;
        item.paidOutWallet = a.paidOutMethod === 'wallet' ? a.paidOutWallet : undefined;
      }
      newItems.push(item);
      notes.push(`+ ${item.name} × ${quantity}${item.adjustmentId ? ' (stock)' : ''}`);
    }

    // ── Changed lines ──
    for (const u of update) {
      if (remove.includes(String(u.itemId))) continue;
      const item = job.items.id(u.itemId);
      const before = { quantity: item.quantity, unitPrice: item.unitPrice, unitCost: item.unitCost };
      const touchesExpense =
        !!item.paidOutMethod &&
        ((u.quantity != null && Number(u.quantity) !== item.quantity) ||
          (u.unitCost != null && round2(u.unitCost) !== item.unitCost));
      if (touchesExpense) {
        // eslint-disable-next-line no-await-in-loop
        await unpostPartPurchase(job, item, actor);
        reposts.push(String(item._id));
      }
      if (!item.adjustmentId) {
        if (u.name != null && String(u.name).trim()) item.name = String(u.name).trim();
        if (u.quantity != null) item.quantity = Number(u.quantity);
        if (u.unitCost != null) item.unitCost = round2(u.unitCost);
      }
      if (u.unitPrice != null) item.unitPrice = round2(u.unitPrice);
      const changes = ['quantity', 'unitPrice', 'unitCost']
        .filter((k) => before[k] !== item[k])
        .map((k) => `${{ quantity: 'qty', unitPrice: 'price', unitCost: 'cost' }[k]} ${before[k]}→${item[k]}`);
      if (changes.length) notes.push(`${item.name}: ${changes.join(', ')}`);
    }

    // ── Removed lines (stock goes back on the shelf) ──
    for (const id of remove) {
      const item = job.items.id(id);
      // eslint-disable-next-line no-await-in-loop
      await returnPartToStock(job, item, actor);
      // eslint-disable-next-line no-await-in-loop
      await unpostPartPurchase(job, item, actor);
      job.items.pull(item._id);
      notes.push(`− ${item.name}${item.adjustmentId ? ' (back to stock)' : ''}`);
    }

    newItems.forEach((item) => job.items.push(item));
    if (body.discount != null) job.discount = round2(body.discount);
    const prevDirectCost = round2(job.directCost || 0);
    if (body.directCost != null) job.directCost = round2(body.directCost);
    const directCostChanged = round2(job.directCost || 0) !== prevDirectCost;
    if (directCostChanged) notes.push(`repair cost ${prevDirectCost}→${round2(job.directCost || 0)}`);

    if (job.discount > 0) {
      const gross = job.items.length
        ? job.items.reduce((sum, i) => sum + i.quantity * (i.unitPrice || 0), 0)
        : job.estimatedCharges || 0;
      if (job.discount > gross) throw new ApiError(httpStatus.BAD_REQUEST, 'Discount is more than the bill');
    }
    // The part the job was waiting for has arrived — work resumes without an extra click.
    if (newItems.some((i) => i.kind === 'part') && job.status === 'waiting_parts') job.status = 'in_progress';
    recalc(job);
    if (notes.length) await pushTimeline(job, { action: 'part', note: `Bill saved: ${notes.join(' · ')}` }, actor);
    job.updatedBy = actor?.id;
    await job.save();

    for (const item of newItems) {
      // eslint-disable-next-line no-await-in-loop
      await postPartPurchase(job, job.items.id(item._id), actor);
    }
    for (const id of reposts) {
      // eslint-disable-next-line no-await-in-loop
      await postPartPurchase(job, job.items.id(id), actor);
    }
    if (directCostChanged) await syncDirectCost(job, actor);
  } catch (err) {
    await undo();
    throw err;
  }
  syncCommission(job, actor);
  return populateJob(job);
};

/**
 * Corrects a bill line — price, and for lines not taken from stock also name, quantity and
 * cost (a stock part's quantity/cost belong to its stock move: remove and re-add it). A part
 * bought outside and paid from an account has its expense re-posted at the new amount.
 */
const updateItem = async (scope, repairJobId, itemId, body, actor) => {
  const job = await findJobOrThrow(scope, repairJobId);
  ensureV2(job);
  if (CLOSED_STATUSES.includes(job.status))
    throw new ApiError(httpStatus.BAD_REQUEST, 'This job is closed — reopen it to change the bill');
  const item = job.items.id(itemId);
  if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Line not found');
  const fromStock = !!item.adjustmentId;
  if (
    fromStock &&
    ((body.quantity != null && Number(body.quantity) !== item.quantity) ||
      (body.unitCost != null && round2(body.unitCost) !== item.unitCost))
  ) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'Quantity and cost of a part from stock come from inventory — remove it and add it again'
    );
  }
  const before = { name: item.name, quantity: item.quantity, unitPrice: item.unitPrice, unitCost: item.unitCost };
  const repost = !!item.paidOutMethod && (body.quantity != null || body.unitCost != null);
  if (repost) await unpostPartPurchase(job, item, actor);
  if (body.name != null && !fromStock && body.name.trim()) item.name = body.name.trim();
  if (body.quantity != null && !fromStock) item.quantity = Number(body.quantity);
  if (body.unitPrice != null) item.unitPrice = round2(body.unitPrice);
  if (body.unitCost != null && !fromStock) item.unitCost = round2(body.unitCost);
  recalc(job);
  const changes = ['quantity', 'unitPrice', 'unitCost']
    .filter((k) => before[k] !== item[k])
    .map((k) => `${{ quantity: 'qty', unitPrice: 'price', unitCost: 'cost' }[k]} ${before[k]} → ${item[k]}`);
  if (changes.length) await pushTimeline(job, { action: 'part', note: `${item.name}: ${changes.join(', ')}` }, actor);
  job.updatedBy = actor?.id;
  await job.save();
  if (repost) await postPartPurchase(job, job.items.id(itemId), actor);
  syncCommission(job, actor);
  return populateJob(job);
};

const removeItem = async (scope, repairJobId, itemId, actor) => {
  const job = await findJobOrThrow(scope, repairJobId);
  ensureV2(job);
  if (CLOSED_STATUSES.includes(job.status))
    throw new ApiError(httpStatus.BAD_REQUEST, 'This job is closed — reopen it to change the bill');
  const item = job.items.id(itemId);
  if (!item) throw new ApiError(httpStatus.NOT_FOUND, 'Line not found');
  await returnPartToStock(job, item, actor);
  await unpostPartPurchase(job, item, actor);
  job.items.pull(item._id);
  recalc(job);
  await pushTimeline(
    job,
    { action: 'part', note: `Removed ${item.name}${item.adjustmentId ? ' (returned to stock)' : ''}` },
    actor
  );
  job.updatedBy = actor?.id;
  await job.save();
  syncCommission(job, actor);
  return populateJob(job);
};

const addPayment = async (scope, repairJobId, body, actor) => {
  const job = await findJobOrThrow(scope, repairJobId);
  const converted = ensureV2(job);
  const amount = round2(body.amount);
  if (!(amount > 0)) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter an amount');
  const refund = body.kind === 'refund';
  if (refund && amount > job.advanceAmount) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Only ${job.advanceAmount} has been collected — can't refund more`);
  }
  if (!refund && job.charges > 0 && job.advanceAmount + amount > job.charges + 0.009) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Only ${balanceOf(job)} is due on this job`);
  }
  const paymentId = new mongoose.Types.ObjectId();
  job.payments.push({
    _id: paymentId,
    ledgerRefId: paymentId,
    amount,
    paymentMethod: body.paymentMethod || 'cash',
    walletType: body.paymentMethod === 'wallet' ? body.walletType : undefined,
    date: parseDate(body.date) || new Date(),
    kind: refund ? 'refund' : CLOSED_STATUSES.includes(job.status) || job.status === 'completed' ? 'payment' : 'advance',
    note: body.note,
    receivedBy: actor?.id,
  });
  recalc(job);
  await pushTimeline(
    job,
    {
      action: 'payment',
      note: `${refund ? 'Refunded' : 'Received'} ${amount} (${
        body.paymentMethod === 'wallet' ? body.walletType : body.paymentMethod || 'cash'
      })`,
    },
    actor
  );
  job.updatedBy = actor?.id;
  await job.save();
  await postPayment(job, job.payments.id(paymentId), actor);
  if (converted) syncCommission(job, actor);

  // Collect & deliver in one go.
  if (body.deliver && !refund) {
    return changeStatus(
      scope,
      repairJobId,
      { status: 'delivered', note: body.note, allowCredit: !!body.allowCredit },
      actor
    );
  }
  return populateJob(job);
};

/** Deletes a payment entered by mistake — its cash book / wallet line goes with it. */
const removePayment = async (scope, repairJobId, paymentId, actor) => {
  const job = await findJobOrThrow(scope, repairJobId);
  ensureV2(job);
  const payment = job.payments.id(paymentId);
  if (!payment) throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  await unpostPayment(job, payment, actor);
  job.payments.pull(payment._id);
  recalc(job);
  await pushTimeline(
    job,
    { action: 'payment', note: `Deleted ${payment.kind === 'refund' ? 'refund' : 'payment'} of ${payment.amount}` },
    actor
  );
  job.updatedBy = actor?.id;
  await job.save();
  return populateJob(job);
};

const addNote = async (scope, repairJobId, { note }, actor) => {
  const job = await findJobOrThrow(scope, repairJobId);
  ensureV2(job);
  await pushTimeline(job, { action: 'note', note }, actor);
  await job.save();
  return populateJob(job);
};

const deleteRepairJob = async (scope, repairJobId, actor) => {
  const job = await findJobOrThrow(scope, repairJobId);
  ensureV2(job);
  for (const item of job.items) {
    // eslint-disable-next-line no-await-in-loop
    await returnPartToStock(job, item, actor);
    // eslint-disable-next-line no-await-in-loop
    await unpostPartPurchase(job, item, actor);
  }
  for (const payment of job.payments) {
    // eslint-disable-next-line no-await-in-loop
    await unpostPayment(job, payment, actor);
  }
  // Anything else still keyed by the job id (a legacy aggregate line).
  await cashBookService.deleteEntriesByReference(job._id, 'RepairJob');
  await RepairStockItem.deleteMany({ repairJobId: job._id });

  await commissionEngineService.reverseCommissionOnDelete({
    sale: job,
    referenceModel: 'RepairJob',
    reason: 'Repair job deleted',
    userId: actor?.id || job.updatedBy || job.createdBy,
  });

  await job.deleteOne();
  return job;
};

const getSettings = async (organizationId) => {
  const org = await Organization.findById(organizationId).select('repairSettings').lean();
  return { partCategories: org?.repairSettings?.partCategories || [] };
};

const updateSettings = async (organizationId, { partCategories }) => {
  const clean = [...new Set((partCategories || []).map((c) => String(c).trim()).filter(Boolean))].slice(0, 100);
  await Organization.updateOne({ _id: organizationId }, { $set: { 'repairSettings.partCategories': clean } });
  return { partCategories: clean };
};

module.exports = {
  STATUS_LABELS,
  getSettings,
  updateSettings,
  createRepairJob,
  queryRepairJobs,
  getRepairJobById,
  getStats,
  lookupHistory,
  getTechnicians,
  getPartsUsage,
  updateRepairJob,
  changeStatus,
  addItem,
  saveBill,
  updateItem,
  removeItem,
  addPayment,
  removePayment,
  addNote,
  deleteRepairJob,
  // exported for tests
  ensureV2,
  recalc,
};
