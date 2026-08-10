const httpStatus = require('http-status');
const { PartnerProfitShareRule } = require('../models');
const ApiError = require('../utils/ApiError');

const SHARE_TYPES = ['percentage_of_profit', 'fixed_per_unit'];

/** The fields that identify "the same rule slot" a new rule would replace, so a rate
 * change behaves like a real update instead of leaving two open-ended rules whose
 * precedence would be ambiguous. Mirrors commissionRule.service.js's scopeTargetFilter. */
const scopeTargetFilter = (body) => {
  const filter = { organizationId: body.organizationId, partnerId: body.partnerId, scope: body.scope };
  if (body.scope === 'branch') filter.branchId = body.branchId;
  if (body.scope === 'product') filter.productId = body.productId;
  return filter;
};

/**
 * Create a profit-share rule for a partner. If an open-ended active rule already exists
 * for the same partner+scope+target, it's automatically closed off the day before this new
 * rule's effectiveFrom — same "effective dates behave like a real rate change" reasoning as
 * commissionRule.service.js's createCommissionRule.
 * @param {Object} ruleBody
 * @returns {Promise<PartnerProfitShareRule>}
 */
const createProfitShareRule = async (ruleBody) => {
  if (ruleBody.scope === 'branch' && !ruleBody.branchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'branchId is required for a branch-scoped rule');
  }
  if (ruleBody.scope === 'product' && !ruleBody.productId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'productId is required for a product-scoped rule');
  }
  if (!SHARE_TYPES.includes(ruleBody.shareType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `shareType must be one of: ${SHARE_TYPES.join(', ')}`);
  }
  if (ruleBody.shareType === 'percentage_of_profit' && Number(ruleBody.rate) > 100) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A percentage-of-profit rate cannot exceed 100');
  }

  const effectiveFrom = ruleBody.effectiveFrom ? new Date(ruleBody.effectiveFrom) : new Date();

  const openEndedPrior = await PartnerProfitShareRule.findOne({
    ...scopeTargetFilter(ruleBody),
    isActive: true,
    effectiveTo: null,
  }).sort({ effectiveFrom: -1 });

  if (openEndedPrior && openEndedPrior.effectiveFrom < effectiveFrom) {
    openEndedPrior.effectiveTo = new Date(effectiveFrom.getTime() - 24 * 60 * 60 * 1000);
    await openEndedPrior.save();
  }

  return PartnerProfitShareRule.create({
    ...ruleBody,
    branchId: ruleBody.scope === 'branch' ? ruleBody.branchId : null,
    productId: ruleBody.scope === 'product' ? ruleBody.productId : null,
    effectiveFrom,
  });
};

const POPULATE = [
  { path: 'partnerId', select: 'name partnerType' },
  { path: 'branchId', select: 'name' },
  { path: 'productId', select: 'name' },
  { path: 'sourcePurchaseId', select: 'invoiceNumber' },
];

/**
 * Query for profit-share rules
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryProfitShareRules = async (filter, options) => {
  const opts = {
    ...options,
    sortBy: options.sortBy || 'effectiveFrom:desc',
    populate: POPULATE,
  };
  return PartnerProfitShareRule.paginate(filter, opts);
};

const getProfitShareRuleById = async (id) => {
  return PartnerProfitShareRule.findById(id).populate(POPULATE);
};

/**
 * Update a profit-share rule by id. Only the rate/shareType/dates/status/notes can change —
 * scope, partnerId, branchId, productId define the rule's identity, so changing what a rule
 * targets should be a new rule, same as commissionRule.service.js's updateCommissionRule.
 * @param {ObjectId} ruleId
 * @param {Object} updateBody
 * @returns {Promise<PartnerProfitShareRule>}
 */
const updateProfitShareRuleById = async (ruleId, updateBody) => {
  const rule = await PartnerProfitShareRule.findById(ruleId);
  if (!rule) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Profit-share rule not found');
  }
  if (updateBody.shareType && !SHARE_TYPES.includes(updateBody.shareType)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `shareType must be one of: ${SHARE_TYPES.join(', ')}`);
  }
  const nextShareType = updateBody.shareType || rule.shareType;
  const nextRate = updateBody.rate !== undefined ? Number(updateBody.rate) : rule.rate;
  if (nextShareType === 'percentage_of_profit' && nextRate > 100) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A percentage-of-profit rate cannot exceed 100');
  }

  Object.assign(rule, updateBody);
  await rule.save();
  return rule.populate(POPULATE);
};

const deleteProfitShareRuleById = async (ruleId) => {
  const rule = await PartnerProfitShareRule.findById(ruleId);
  if (!rule) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Profit-share rule not found');
  }
  await rule.deleteOne();
  return rule;
};

const activeDateFilter = (asOf) => ({
  isActive: true,
  effectiveFrom: { $lte: asOf },
  $or: [{ effectiveTo: null }, { effectiveTo: { $gte: asOf } }],
});

/**
 * Every currently-active, date-effective product-scoped rule for a product — NOT a single
 * winner. Several different partners/investors can independently hold a rule on the same
 * product and all of them earn on the same sale (see model comment).
 * @param {Object} params
 * @param {ObjectId} params.organizationId
 * @param {ObjectId} params.productId
 * @param {Date} [params.date] - defaults to now
 * @returns {Promise<Array<{ partnerId: ObjectId, ruleId: ObjectId, shareType: string, rate: number }>>}
 */
const resolveActiveProductRules = async ({ organizationId, productId, date }) => {
  if (!productId) return [];
  const asOf = date ? new Date(date) : new Date();
  const rules = await PartnerProfitShareRule.find({
    organizationId,
    scope: 'product',
    productId,
    ...activeDateFilter(asOf),
  });
  return rules.map((r) => ({ partnerId: r.partnerId, ruleId: r._id, shareType: r.shareType, rate: r.rate }));
};

/**
 * Every currently-active, date-effective organization- or branch-scoped rule that applies
 * to a sale in `branchId` — again, every match, not one winner. Run as two separate finds
 * (not a single query with two $or clauses) to avoid the classic Mongo bug where a second
 * top-level $or silently overwrites the first.
 * @param {Object} params
 * @param {ObjectId} params.organizationId
 * @param {ObjectId} [params.branchId]
 * @param {Date} [params.date] - defaults to now
 * @returns {Promise<Array<{ partnerId: ObjectId, ruleId: ObjectId, shareType: string, rate: number, scope: string }>>}
 */
const resolveActiveOrgRules = async ({ organizationId, branchId, date }) => {
  const asOf = date ? new Date(date) : new Date();
  const dateFilter = activeDateFilter(asOf);

  const orgRules = await PartnerProfitShareRule.find({ organizationId, scope: 'organization', ...dateFilter });

  let branchRules = [];
  if (branchId) {
    branchRules = await PartnerProfitShareRule.find({ organizationId, scope: 'branch', branchId, ...dateFilter });
  }

  return [...orgRules, ...branchRules].map((r) => ({
    partnerId: r.partnerId,
    ruleId: r._id,
    shareType: r.shareType,
    rate: r.rate,
    scope: r.scope,
  }));
};

module.exports = {
  SHARE_TYPES,
  createProfitShareRule,
  queryProfitShareRules,
  getProfitShareRuleById,
  updateProfitShareRuleById,
  deleteProfitShareRuleById,
  resolveActiveProductRules,
  resolveActiveOrgRules,
};
