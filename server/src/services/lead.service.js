const httpStatus = require('http-status');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const { Lead, Customer, CommunicationLog, Reminder, Invoice } = require('../models');
const customerService = require('./customer.service');

/** Mongoose auto-casts query filters for find()/countDocuments(), but NOT for the
 * $match stage of aggregate() — that goes to MongoDB's driver largely as-is. A plain
 * string org/branch/user id there silently matches nothing against the real
 * ObjectId-typed fields. Mirrors reports.controller.js's buildScope for the same
 * reason. Always run a $match filter through this before handing it to aggregate(). */
const toObjectId = (value) => {
  if (value && mongoose.Types.ObjectId.isValid(value)) {
    return new mongoose.Types.ObjectId(String(value));
  }
  return value;
};

const castMatchIds = (filter) => {
  const cast = { ...filter };
  for (const key of ['organizationId', 'branchId', 'assignedTo']) {
    if (cast[key] !== undefined) cast[key] = toObjectId(cast[key]);
  }
  return cast;
};

// 'lost' is a side-branch, not a pipeline rung — reachable from any active stage
// without confirmation. Reopening a lost lead back into the active pipeline is the
// one transition that always needs confirmation, same as skipping stages forward.
const ACTIVE_ORDER = ['new', 'contacted', 'qualified', 'proposal_sent', 'won'];

const STAGE_LABELS = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  proposal_sent: 'Proposal Sent',
  won: 'Won',
  lost: 'Lost',
};

const formatStage = (stage) => STAGE_LABELS[stage] || stage;

const isSkippedTransition = (fromStage, toStage) => {
  if (toStage === 'lost') return false;
  if (fromStage === 'lost') return true;
  const fromIdx = ACTIVE_ORDER.indexOf(fromStage);
  const toIdx = ACTIVE_ORDER.indexOf(toStage);
  if (fromIdx === -1 || toIdx === -1) return true;
  return toIdx - fromIdx > 1;
};

/** Scope-aware read: reps without viewAllLeads only ever see their own assigned leads. */
const applyVisibilityScope = (filter, { userId, canViewAll }) => {
  if (!canViewAll) {
    filter.assignedTo = userId;
  }
  return filter;
};

const getLeadScoped = async (id, { organizationId, branchId, userId, canViewAll }) => {
  const filter = applyVisibilityScope({ _id: id, organizationId, branchId }, { userId, canViewAll });
  const lead = await Lead.findOne(filter);
  if (!lead) throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
  return lead;
};

const createLead = async (data, { organizationId, branchId, userId }) => {
  if (!data.name || !String(data.name).trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Lead name is required');
  }

  const now = new Date();
  const lead = await Lead.create({
    organizationId,
    branchId,
    name: String(data.name).trim(),
    companyName: data.companyName,
    email: data.email,
    phone: data.phone,
    whatsapp: data.whatsapp,
    address: data.address,
    source: data.source || 'manual',
    estimatedValue: data.estimatedValue || 0,
    assignedTo: data.assignedTo || userId,
    createdBy: userId,
    stage: 'new',
    stageEnteredAt: now,
    stageHistory: [{ stage: 'new', enteredAt: now, changedBy: userId, note: 'Lead created' }],
  });

  return lead;
};

const listLeads = async (query, scope) => {
  const filter = applyVisibilityScope(
    { organizationId: scope.organizationId, branchId: scope.branchId },
    scope,
  );
  if (query.stage) filter.stage = query.stage;
  if (query.source) filter.source = query.source;
  // A caller with broad visibility may further narrow to one rep; a caller without
  // it is already pinned to themselves above and can't widen it via the query.
  if (query.assignedTo && scope.canViewAll) filter.assignedTo = query.assignedTo;
  if (query.search) {
    const re = { $regex: query.search, $options: 'i' };
    filter.$or = [{ name: re }, { companyName: re }, { phone: re }, { whatsapp: re }, { email: re }];
  }

  const options = {
    sortBy: query.sortBy || 'stageEnteredAt:desc',
    limit: query.limit ? Number(query.limit) : 500,
    page: query.page ? Number(query.page) : 1,
    populate: 'assignedTo,createdBy',
  };

  return Lead.paginate(filter, options);
};

const getLead = async (id, scope) => {
  const lead = await getLeadScoped(id, scope);
  await lead.populate(['assignedTo', 'createdBy']);
  return lead;
};

const updateLead = async (id, data, scope) => {
  const lead = await getLeadScoped(id, scope);
  if (lead.convertedCustomerId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This lead has already been converted and is read-only');
  }

  const patch = { ...data };
  delete patch.organizationId;
  delete patch.branchId;
  delete patch.createdBy;
  delete patch.stage;
  delete patch.stageHistory;
  delete patch.stageEnteredAt;
  delete patch.convertedCustomerId;
  delete patch.convertedAt;

  Object.assign(lead, patch);
  await lead.save();
  return lead;
};

const changeStage = async (id, data, scope) => {
  const lead = await getLeadScoped(id, scope);
  const toStage = data.stage;

  if (!Lead.STAGES.includes(toStage)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid pipeline stage');
  }
  if (lead.convertedCustomerId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This lead has already been converted and is read-only');
  }
  if (toStage === lead.stage) {
    return lead;
  }
  if (isSkippedTransition(lead.stage, toStage) && !data.confirmSkip) {
    throw new ApiError(
      httpStatus.CONFLICT,
      `Moving from "${formatStage(lead.stage)}" to "${formatStage(toStage)}" skips one or more pipeline stages. Confirm to proceed.`,
    );
  }

  const now = new Date();
  const fromStage = lead.stage;
  lead.stage = toStage;
  lead.stageEnteredAt = now;
  lead.stageHistory.push({ stage: toStage, enteredAt: now, changedBy: scope.userId, note: data.note });

  if (toStage === 'won') lead.wonAt = now;
  if (toStage === 'lost') {
    lead.lostAt = now;
    lead.lostReason = data.lostReason || lead.lostReason;
  }
  // Reopening out of a terminal stage clears its terminal timestamp.
  if (fromStage === 'won' && toStage !== 'won') lead.wonAt = undefined;
  if (fromStage === 'lost' && toStage !== 'lost') { lead.lostAt = undefined; lead.lostReason = undefined; }

  await lead.save();
  return lead;
};

/** Advisory, non-blocking: callers show a warning and let the rep decide whether to proceed. */
const checkDuplicates = async ({ phone, whatsapp, email }, scope, excludeId) => {
  const or = [];
  if (phone) or.push({ phone });
  if (whatsapp) or.push({ whatsapp });
  if (email) or.push({ email });
  if (!or.length) return [];

  const filter = { organizationId: scope.organizationId, branchId: scope.branchId, $or: or };
  if (excludeId) filter._id = { $ne: excludeId };

  return Lead.find(filter).select('name companyName stage phone whatsapp email assignedTo createdAt').limit(10);
};

const findExistingCustomerMatch = async ({ organizationId, branchId }, { phone, whatsapp, email }) => {
  const or = [];
  if (phone) or.push({ phone });
  if (whatsapp) or.push({ whatsapp });
  if (email) or.push({ email });
  if (!or.length) return null;

  return Customer.findOne({
    organizationId,
    branchId,
    $or: or,
    isEmployeeAccount: { $ne: true },
    isSupplierAccount: { $ne: true },
  });
};

const convertLead = async (id, payload, scope) => {
  const lead = await getLeadScoped(id, scope);

  if (lead.convertedCustomerId) {
    const customer = await Customer.findById(lead.convertedCustomerId);
    return { lead, customer, alreadyConverted: true };
  }
  if (lead.stage !== 'won') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Only a lead in the Won stage can be converted to a customer');
  }

  let customer = null;
  let linkedExisting = false;
  if (!payload.forceCreateNew) {
    customer = await findExistingCustomerMatch(scope, {
      phone: lead.phone,
      whatsapp: lead.whatsapp,
      email: lead.email,
    });
    if (customer) linkedExisting = true;
  }

  if (!customer) {
    customer = await customerService.createCustomer({
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      createdBy: scope.userId,
      name: payload.name || lead.companyName || lead.name,
      email: payload.email ?? lead.email,
      phone: payload.phone ?? lead.phone,
      whatsapp: payload.whatsapp ?? lead.whatsapp,
      address: payload.address ?? lead.address,
      balance: 0,
    });
  }

  lead.convertedCustomerId = customer._id;
  lead.convertedAt = new Date();
  await lead.save();

  return { lead, customer, alreadyConverted: false, linkedExisting };
};

const deleteLead = async (id, scope) => {
  const lead = await getLeadScoped(id, scope);
  if (lead.convertedCustomerId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A converted lead is kept as a permanent record and cannot be deleted');
  }

  await Promise.all([
    CommunicationLog.deleteMany({ relatedType: 'Lead', relatedId: lead._id }),
    Reminder.deleteMany({ relatedType: 'Lead', relatedId: lead._id }),
    Invoice.updateMany({ leadId: lead._id }, { $unset: { leadId: 1 } }),
  ]);

  await lead.deleteOne();
};

/** Unified, chronological history: stage changes + communications + follow-ups + quotations. */
const getLeadTimeline = async (id, scope) => {
  const lead = await getLeadScoped(id, scope);

  const [logs, reminders, quotations] = await Promise.all([
    CommunicationLog.find({ relatedType: 'Lead', relatedId: lead._id }).populate('createdBy', 'name').lean(),
    Reminder.find({ relatedType: 'Lead', relatedId: lead._id }).populate('assignedTo', 'name').lean(),
    Invoice.find({ leadId: lead._id }).select('invoiceNumber type total status createdAt').lean(),
  ]);

  const events = [];

  for (const entry of lead.stageHistory) {
    events.push({
      kind: 'stage_change',
      timestamp: entry.enteredAt,
      stage: entry.stage,
      note: entry.note,
      changedBy: entry.changedBy,
    });
  }
  for (const log of logs) {
    events.push({ kind: 'communication', timestamp: log.createdAt, data: log });
  }
  for (const reminder of reminders) {
    events.push({ kind: 'reminder', timestamp: reminder.createdAt, data: reminder });
  }
  for (const quotation of quotations) {
    events.push({ kind: 'quotation', timestamp: quotation.createdAt, data: quotation });
  }

  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return { lead, events };
};

/** Reverse lookup for the Customer ledger page's "Converted from Lead" banner. */
const getLeadByCustomerId = async (customerId, { organizationId, branchId }) => {
  return Lead.findOne({ convertedCustomerId: customerId, organizationId, branchId });
};

const getLeadStats = async (scope) => {
  const baseMatch = applyVisibilityScope(
    { organizationId: scope.organizationId, branchId: scope.branchId },
    scope,
  );
  const aggregateMatch = castMatchIds(baseMatch);

  const [byStage, bySource, closedAgg, totalCount] = await Promise.all([
    Lead.aggregate([
      { $match: aggregateMatch },
      { $group: { _id: '$stage', count: { $sum: 1 }, totalValue: { $sum: '$estimatedValue' } } },
    ]),
    Lead.aggregate([
      { $match: aggregateMatch },
      { $group: { _id: '$source', count: { $sum: 1 } } },
    ]),
    Lead.aggregate([
      { $match: { ...aggregateMatch, stage: 'won', wonAt: { $ne: null } } },
      {
        $group: {
          _id: null,
          wonCount: { $sum: 1 },
          avgDaysToClose: { $avg: { $divide: [{ $subtract: ['$wonAt', '$createdAt'] }, 1000 * 60 * 60 * 24] } },
        },
      },
    ]),
    // countDocuments() (built on find()) auto-casts, so the uncast baseMatch is fine here.
    Lead.countDocuments(baseMatch),
  ]);

  const wonCount = closedAgg[0]?.wonCount || 0;
  const lostCount = byStage.find((s) => s._id === 'lost')?.count || 0;
  const avgDaysToClose = closedAgg[0]?.avgDaysToClose ?? null;

  return {
    totalCount,
    byStage: byStage.map((s) => ({ stage: s._id, count: s.count, totalValue: s.totalValue })),
    bySource: bySource.map((s) => ({ source: s._id, count: s.count })),
    wonCount,
    lostCount,
    conversionRate: totalCount ? Math.round((wonCount / totalCount) * 1000) / 10 : 0,
    avgDaysToClose: avgDaysToClose !== null ? Math.round(avgDaysToClose * 10) / 10 : null,
  };
};

module.exports = {
  createLead,
  listLeads,
  getLead,
  updateLead,
  changeStage,
  checkDuplicates,
  convertLead,
  deleteLead,
  getLeadTimeline,
  getLeadStats,
  getLeadByCustomerId,
  isSkippedTransition,
};
