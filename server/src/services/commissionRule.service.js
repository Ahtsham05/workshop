const httpStatus = require('http-status');
const { CommissionRule, SalesmanProfile } = require('../models');
const ApiError = require('../utils/ApiError');

const MODULES = ['Invoice', 'SimSale', 'LoadTransaction', 'RepairJob', 'ServiceInvoice'];

/** The fields that identify "the same rule slot" a new rule would replace — now includes
 * `module`, so a Sim Sale rate change doesn't supersede that salesman's Services rate. */
const scopeTargetFilter = (body) => {
  const filter = { organizationId: body.organizationId, scope: body.scope, module: body.module || null };
  if (body.scope === 'branch') filter.branchId = body.branchId;
  if (body.scope === 'salesman') filter.salesmanUserId = body.salesmanUserId;
  return filter;
};

/**
 * Create a commission rule. If an open-ended active rule already exists for the same
 * scope+target+module (org / branch / salesman, general or a specific module), it's
 * automatically closed off the day before this new rule's effectiveFrom — so "effective
 * dates" behave like a real rate change instead of leaving two open-ended rules whose
 * precedence would be ambiguous.
 * @param {Object} ruleBody
 * @returns {Promise<CommissionRule>}
 */
const createCommissionRule = async (ruleBody) => {
  if (ruleBody.scope === 'branch' && !ruleBody.branchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'branchId is required for a branch-scoped rule');
  }
  if (ruleBody.scope === 'salesman' && !ruleBody.salesmanUserId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'salesmanUserId is required for a salesman-scoped rule');
  }
  if (ruleBody.module && !MODULES.includes(ruleBody.module)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `module must be one of: ${MODULES.join(', ')}`);
  }

  const effectiveFrom = ruleBody.effectiveFrom ? new Date(ruleBody.effectiveFrom) : new Date();

  const openEndedPrior = await CommissionRule.findOne({
    ...scopeTargetFilter(ruleBody),
    isActive: true,
    effectiveTo: null,
  }).sort({ effectiveFrom: -1 });

  if (openEndedPrior && openEndedPrior.effectiveFrom < effectiveFrom) {
    openEndedPrior.effectiveTo = new Date(effectiveFrom.getTime() - 24 * 60 * 60 * 1000);
    await openEndedPrior.save();
  }

  return CommissionRule.create({ ...ruleBody, module: ruleBody.module || null, effectiveFrom });
};

/**
 * Query for commission rules
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryCommissionRules = async (filter, options) => {
  const opts = {
    ...options,
    sortBy: options.sortBy || 'effectiveFrom:desc',
    populate: [
      { path: 'branchId', select: 'name' },
      { path: 'salesmanUserId', select: 'name email' },
    ],
  };
  return CommissionRule.paginate(filter, opts);
};

const getCommissionRuleById = async (id) => {
  return CommissionRule.findById(id)
    .populate('branchId', 'name')
    .populate('salesmanUserId', 'name email');
};

/**
 * Update commission rule by id
 * @param {ObjectId} ruleId
 * @param {Object} updateBody
 * @returns {Promise<CommissionRule>}
 */
const updateCommissionRuleById = async (ruleId, updateBody) => {
  const rule = await CommissionRule.findById(ruleId);
  if (!rule) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Commission rule not found');
  }
  Object.assign(rule, updateBody);
  await rule.save();
  return rule.populate([{ path: 'branchId', select: 'name' }, { path: 'salesmanUserId', select: 'name email' }]);
};

const deleteCommissionRuleById = async (ruleId) => {
  const rule = await CommissionRule.findById(ruleId);
  if (!rule) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Commission rule not found');
  }
  await rule.deleteOne();
  return rule;
};

/**
 * Resolve the commission rate that applies to a salesman on a given date for a given sale
 * module, preferring the most specific match: at each scope level (salesman > branch >
 * organization) a module-specific rule beats that scope's general (module: null) rule,
 * and the first scope level with ANY match wins outright — a salesman's general rate
 * still beats the organization's module-specific rate, since scope is the primary axis
 * and module is secondary. Falls back to SalesmanProfile.defaultCommissionRate, then 0.
 * @param {Object} params
 * @param {ObjectId} params.organizationId
 * @param {ObjectId} [params.branchId]
 * @param {ObjectId} params.salesmanUserId
 * @param {Date} [params.date] - defaults to now
 * @param {string} [params.module] - 'Invoice'|'SimSale'|'LoadTransaction'|'RepairJob'|'ServiceInvoice'
 * @returns {Promise<{ rate: number, source: 'salesman'|'branch'|'organization'|'profile_default'|'none', ruleId: ObjectId|null }>}
 */
const resolveCommissionRate = async ({ organizationId, branchId, salesmanUserId, date, module }) => {
  const asOf = date ? new Date(date) : new Date();
  const dateFilter = {
    effectiveFrom: { $lte: asOf },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: asOf } }],
    isActive: true,
  };

  const findAtScope = async (scopeFilter) => {
    if (module) {
      const specific = await CommissionRule.findOne({ ...scopeFilter, module, ...dateFilter }).sort({ effectiveFrom: -1 });
      if (specific) return specific;
    }
    return CommissionRule.findOne({ ...scopeFilter, module: null, ...dateFilter }).sort({ effectiveFrom: -1 });
  };

  const salesmanRule = await findAtScope({ organizationId, scope: 'salesman', salesmanUserId });
  if (salesmanRule) return { rate: salesmanRule.rate, source: 'salesman', ruleId: salesmanRule._id };

  if (branchId) {
    const branchRule = await findAtScope({ organizationId, scope: 'branch', branchId });
    if (branchRule) return { rate: branchRule.rate, source: 'branch', ruleId: branchRule._id };
  }

  const orgRule = await findAtScope({ organizationId, scope: 'organization' });
  if (orgRule) return { rate: orgRule.rate, source: 'organization', ruleId: orgRule._id };

  const profile = await SalesmanProfile.findOne({ organizationId, userId: salesmanUserId });
  if (profile && profile.defaultCommissionRate > 0) {
    return { rate: profile.defaultCommissionRate, source: 'profile_default', ruleId: null };
  }

  return { rate: 0, source: 'none', ruleId: null };
};

/**
 * Resolve a salesman's effective rate for every sale module at once — feeds the
 * "Commission Rates by Module" panel on the Add/Edit Salesman dialog.
 * @returns {Promise<Record<string, { rate: number, source: string, ruleId: ObjectId|null }>>}
 */
const getSalesmanModuleRates = async ({ organizationId, branchId, salesmanUserId, date }) => {
  const entries = await Promise.all(
    MODULES.map(async (module) => [module, await resolveCommissionRate({ organizationId, branchId, salesmanUserId, date, module })])
  );
  return Object.fromEntries(entries);
};

module.exports = {
  MODULES,
  createCommissionRule,
  queryCommissionRules,
  getCommissionRuleById,
  updateCommissionRuleById,
  deleteCommissionRuleById,
  resolveCommissionRate,
  getSalesmanModuleRates,
};
