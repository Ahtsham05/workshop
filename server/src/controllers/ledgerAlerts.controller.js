const catchAsync = require('../utils/catchAsync');
const ledgerAlertsService = require('../services/ledgerAlerts.service');
const auditLogService = require('../services/auditLog.service');

/** Ledger alerts — see services/ledgerAlerts.service.js. */

const getSettings = catchAsync(async (req, res) => {
  res.send(await ledgerAlertsService.getSettings(req.organizationId));
});

const updateSettings = catchAsync(async (req, res) => {
  const before = await ledgerAlertsService.getSettings(req.organizationId);
  const settings = await ledgerAlertsService.updateSettings(req.organizationId, req.body);
  auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'LedgerAlertSettings',
    entityId: req.organizationId,
    entityName: 'Due dates & ledger colours',
    before,
    after: settings,
    fields: Object.keys(settings),
  });
  res.send(settings);
});

/** All customers who owe something in the current branch scope, with aging + colour band. */
const getStatusBoard = catchAsync(async (req, res) => {
  res.send(
    await ledgerAlertsService.getStatusBoard({
      organizationId: req.organizationId,
      branchId: req.branchId || undefined,
    })
  );
});

const getCustomerAging = catchAsync(async (req, res) => {
  res.send(
    await ledgerAlertsService.getCustomerAging({
      organizationId: req.organizationId,
      customerId: req.params.customerId,
    })
  );
});

module.exports = { getSettings, updateSettings, getStatusBoard, getCustomerAging };
