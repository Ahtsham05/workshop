const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { commissionRuleService, auditLogService } = require('../services');
const pick = require('../utils/pick');
const { getBranchContext } = require('../utils/branchFilter');
const ApiError = require('../utils/ApiError');

const entityName = (rule) => {
  if (!rule) return undefined;
  if (rule.scope === 'salesman') {
    const salesman = rule.salesmanUserId;
    return `Salesman rule — ${typeof salesman === 'string' ? salesman : salesman?.name || salesman?.email || ''}`;
  }
  if (rule.scope === 'branch') {
    const branch = rule.branchId;
    return `Branch rule — ${typeof branch === 'string' ? branch : branch?.name || ''}`;
  }
  return 'Organization default rule';
};

const createCommissionRule = catchAsync(async (req, res) => {
  const { organizationId } = getBranchContext(req);
  const rule = await commissionRuleService.createCommissionRule({
    ...req.body,
    organizationId,
    createdBy: req.user.id,
  });
  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'CommissionRule',
    entityId: rule._id,
    entityName: entityName(rule),
    after: rule.toObject ? rule.toObject() : rule,
    fields: ['scope', 'branchId', 'salesmanUserId', 'rate', 'effectiveFrom', 'effectiveTo', 'isActive'],
  });
  res.status(httpStatus.CREATED).send(rule);
});

const getCommissionRules = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['scope', 'branchId', 'salesmanUserId', 'isActive']);
  const { organizationId } = getBranchContext(req);
  filter.organizationId = organizationId;
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await commissionRuleService.queryCommissionRules(filter, options);
  res.send(result);
});

const getCommissionRule = catchAsync(async (req, res) => {
  const rule = await commissionRuleService.getCommissionRuleById(req.params.commissionRuleId);
  if (!rule) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Commission rule not found');
  }
  res.send(rule);
});

const updateCommissionRule = catchAsync(async (req, res) => {
  const before = await commissionRuleService.getCommissionRuleById(req.params.commissionRuleId);
  const beforeSnapshot = before && before.toObject ? before.toObject() : before;
  const rule = await commissionRuleService.updateCommissionRuleById(req.params.commissionRuleId, {
    ...req.body,
    updatedBy: req.user.id,
  });
  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'CommissionRule',
    entityId: rule._id,
    entityName: entityName(rule),
    before: beforeSnapshot,
    after: rule.toObject ? rule.toObject() : rule,
    fields: ['rate', 'effectiveFrom', 'effectiveTo', 'isActive', 'notes'],
  });
  res.send(rule);
});

const deleteCommissionRule = catchAsync(async (req, res) => {
  const rule = await commissionRuleService.getCommissionRuleById(req.params.commissionRuleId);
  await commissionRuleService.deleteCommissionRuleById(req.params.commissionRuleId);
  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'CommissionRule',
    entityId: req.params.commissionRuleId,
    entityName: entityName(rule),
  });
  res.status(httpStatus.NO_CONTENT).send();
});

const resolveCommissionRate = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const result = await commissionRuleService.resolveCommissionRate({
    organizationId,
    branchId,
    salesmanUserId: req.query.salesmanUserId,
    date: req.query.date,
  });
  res.send(result);
});

module.exports = {
  createCommissionRule,
  getCommissionRules,
  getCommissionRule,
  updateCommissionRule,
  deleteCommissionRule,
  resolveCommissionRate,
};
