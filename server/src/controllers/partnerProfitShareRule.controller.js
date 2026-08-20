const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { partnerProfitShareRuleService, auditLogService } = require('../services');
const pick = require('../utils/pick');
const { getBranchContext } = require('../utils/branchFilter');
const ApiError = require('../utils/ApiError');

const entityName = (rule) => {
  if (!rule) return undefined;
  const partner = rule.partnerId;
  const partnerLabel = typeof partner === 'string' ? partner : partner?.name || '';
  if (rule.scope === 'batch') {
    const batch = rule.batchId;
    const batchLabel = typeof batch === 'string' ? batch : batch?.batchNumber || '';
    return `${partnerLabel} — Batch: ${batchLabel}`;
  }
  if (rule.scope === 'variant') {
    const variant = rule.variantId;
    const variantLabel =
      typeof variant === 'string' ? variant : Object.values(variant?.attributes || {}).join(' / ') || variant?.sku || '';
    return `${partnerLabel} — Variant: ${variantLabel}`;
  }
  if (rule.scope === 'product') {
    const product = rule.productId;
    const productLabel = typeof product === 'string' ? product : product?.name || '';
    return `${partnerLabel} — ${productLabel}`;
  }
  if (rule.scope === 'branch') {
    const branch = rule.branchId;
    const branchLabel = typeof branch === 'string' ? branch : branch?.name || '';
    return `${partnerLabel} — Branch: ${branchLabel}`;
  }
  return `${partnerLabel} — Organization-wide`;
};

const createProfitShareRule = catchAsync(async (req, res) => {
  const { organizationId } = getBranchContext(req);
  const rule = await partnerProfitShareRuleService.createProfitShareRule({
    ...req.body,
    organizationId,
    createdBy: req.user.id,
  });
  const populated = await partnerProfitShareRuleService.getProfitShareRuleById(rule._id);
  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'PartnerProfitShareRule',
    entityId: rule._id,
    entityName: entityName(populated),
    after: rule.toObject ? rule.toObject() : rule,
    fields: ['partnerId', 'scope', 'branchId', 'productId', 'variantId', 'batchId', 'shareType', 'rate', 'effectiveFrom', 'effectiveTo', 'isActive'],
  });
  res.status(httpStatus.CREATED).send(populated);
});

const getProfitShareRules = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['partnerId', 'scope', 'productId', 'variantId', 'batchId', 'branchId', 'isActive']);
  const { organizationId } = getBranchContext(req);
  filter.organizationId = organizationId;
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await partnerProfitShareRuleService.queryProfitShareRules(filter, options);
  res.send(result);
});

const getProfitShareRule = catchAsync(async (req, res) => {
  const rule = await partnerProfitShareRuleService.getProfitShareRuleById(req.params.ruleId);
  if (!rule) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Profit-share rule not found');
  }
  res.send(rule);
});

const updateProfitShareRule = catchAsync(async (req, res) => {
  const before = await partnerProfitShareRuleService.getProfitShareRuleById(req.params.ruleId);
  const beforeSnapshot = before && before.toObject ? before.toObject() : before;
  const rule = await partnerProfitShareRuleService.updateProfitShareRuleById(req.params.ruleId, {
    ...req.body,
    updatedBy: req.user.id,
  });
  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'PartnerProfitShareRule',
    entityId: rule._id,
    entityName: entityName(rule),
    before: beforeSnapshot,
    after: rule.toObject ? rule.toObject() : rule,
    fields: ['shareType', 'rate', 'effectiveFrom', 'effectiveTo', 'isActive', 'notes'],
  });
  res.send(rule);
});

const deleteProfitShareRule = catchAsync(async (req, res) => {
  const rule = await partnerProfitShareRuleService.getProfitShareRuleById(req.params.ruleId);
  await partnerProfitShareRuleService.deleteProfitShareRuleById(req.params.ruleId);
  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'PartnerProfitShareRule',
    entityId: req.params.ruleId,
    entityName: entityName(rule),
  });
  res.status(httpStatus.NO_CONTENT).send();
});

// Preview what's currently active for a given product/variant/batch and/or the org/branch —
// lets the UI show "here's who already has a claim on this" before a new rule is added.
const resolveProfitShareRules = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const { date } = req.query;
  const result = {
    orgRules: await partnerProfitShareRuleService.resolveActiveOrgRules({ organizationId, branchId, date }),
  };
  if (req.query.productId) {
    result.productRules = await partnerProfitShareRuleService.resolveActiveProductRules({
      organizationId,
      productId: req.query.productId,
      date,
    });
  }
  if (req.query.variantId) {
    result.variantRules = await partnerProfitShareRuleService.resolveActiveVariantRules({
      organizationId,
      variantId: req.query.variantId,
      date,
    });
  }
  if (req.query.batchId) {
    result.batchRules = await partnerProfitShareRuleService.resolveActiveBatchRules({
      organizationId,
      batchId: req.query.batchId,
      date,
    });
  }
  res.send(result);
});

module.exports = {
  createProfitShareRule,
  getProfitShareRules,
  getProfitShareRule,
  updateProfitShareRule,
  deleteProfitShareRule,
  resolveProfitShareRules,
};
