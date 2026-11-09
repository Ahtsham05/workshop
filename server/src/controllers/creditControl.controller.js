const catchAsync = require('../utils/catchAsync');
const creditControlService = require('../services/creditControl.service');
const auditLogService = require('../services/auditLog.service');
const { userHasAnyPermission } = require('../middlewares/permission');

const actorOf = (req) => ({ id: req.user.id, name: req.user.name });

/** The credit fields a client needs after a change — the full status, freshly computed. */
const respondWithStatus = async (req, res, customerId) => {
  const status = await creditControlService.getCreditStatus({ organizationId: req.organizationId, customerId });
  res.send(status);
};

const getSettings = catchAsync(async (req, res) => {
  res.send(await creditControlService.getSettings(req.organizationId));
});

const updateSettings = catchAsync(async (req, res) => {
  const before = await creditControlService.getSettings(req.organizationId);
  const settings = await creditControlService.updateSettings(req.organizationId, req.body);
  auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'CreditControlSettings',
    entityId: req.organizationId,
    entityName: 'Credit control settings',
    before,
    after: settings,
    fields: Object.keys(settings),
  });
  res.send(settings);
});

const getStatus = catchAsync(async (req, res) => {
  const status = await creditControlService.getCreditStatus({
    organizationId: req.organizationId,
    customerId: req.params.customerId,
    saleAmount: Number(req.query.amount) || 0,
    excludeInvoiceId: req.query.excludeInvoiceId || undefined,
  });
  // What this user may do about a refusal — the invoice screen offers only those buttons.
  const [canOverride, canManage] = await Promise.all([
    userHasAnyPermission(req.user, ['overrideCreditLimit']),
    userHasAnyPermission(req.user, ['manageCreditLimits']),
  ]);
  res.send({ ...status, canOverride, canManage });
});

const changeLimit = catchAsync(async (req, res) => {
  await creditControlService.changeLimit({
    organizationId: req.organizationId,
    customerId: req.params.customerId,
    ...req.body,
    actor: actorOf(req),
  });
  await respondWithStatus(req, res, req.params.customerId);
});

const clearTemporary = catchAsync(async (req, res) => {
  await creditControlService.clearTemporaryLimit({
    organizationId: req.organizationId,
    customerId: req.params.customerId,
    reason: req.body?.reason,
    actor: actorOf(req),
  });
  await respondWithStatus(req, res, req.params.customerId);
});

const setHold = catchAsync(async (req, res) => {
  await creditControlService.setHold({
    organizationId: req.organizationId,
    customerId: req.params.customerId,
    onHold: req.body.onHold,
    reason: req.body.reason,
    actor: actorOf(req),
  });
  await respondWithStatus(req, res, req.params.customerId);
});

const getHistory = catchAsync(async (req, res) => {
  const results = await creditControlService.getHistory({
    organizationId: req.organizationId,
    customerId: req.params.customerId,
    limit: req.query.limit,
  });
  res.send({ results });
});

const getOverview = catchAsync(async (req, res) => {
  res.send(
    await creditControlService.getOverview({
      organizationId: req.organizationId,
      branchId: req.branchId,
      status: req.query.status,
    })
  );
});

const getOverrides = catchAsync(async (req, res) => {
  const results = await creditControlService.getRecentOverrides({
    organizationId: req.organizationId,
    branchId: req.branchId,
    limit: req.query.limit,
  });
  res.send({ results });
});

const bulkUpdate = catchAsync(async (req, res) => {
  const result = await creditControlService.bulkUpdate({
    organizationId: req.organizationId,
    branchId: req.branchId,
    ...req.body,
    actor: actorOf(req),
  });
  auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'CustomerCredit',
    entityId: req.organizationId,
    entityName: `Bulk credit: ${req.body.action}`,
    metadata: { action: req.body.action, scope: req.body.scope, count: result.updated, amount: req.body.amount, percent: req.body.percent },
  });
  res.send(result);
});

const getOverdueCustomers = catchAsync(async (req, res) => {
  res.send(
    await creditControlService.getOverdueCustomers({
      organizationId: req.organizationId,
      branchId: req.branchId,
      minDays: req.query.minDays,
    })
  );
});

const exportCustomers = catchAsync(async (req, res) => {
  const results = await creditControlService.exportCustomers({ organizationId: req.organizationId, branchId: req.branchId });
  res.send({ results });
});

module.exports = {
  bulkUpdate,
  getOverdueCustomers,
  exportCustomers,
  getSettings,
  updateSettings,
  getStatus,
  changeLimit,
  clearTemporary,
  setHold,
  getHistory,
  getOverview,
  getOverrides,
};
