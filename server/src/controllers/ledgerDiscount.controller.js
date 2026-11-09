const catchAsync = require('../utils/catchAsync');
const ledgerDiscountService = require('../services/ledgerDiscount.service');
const auditLogService = require('../services/auditLog.service');

/** Ledger discounts — see services/ledgerDiscount.service.js. */

const getSettings = catchAsync(async (req, res) => {
  res.send(await ledgerDiscountService.getSettings(req.organizationId));
});

const updateSettings = catchAsync(async (req, res) => {
  const before = await ledgerDiscountService.getSettings(req.organizationId);
  const settings = await ledgerDiscountService.updateSettings(req.organizationId, req.body);
  auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'LedgerDiscountSettings',
    entityId: req.organizationId,
    entityName: 'Ledger discount rules',
    before,
    after: settings,
    fields: Object.keys(settings),
  });
  res.send(settings);
});

/** Discount register: every Discount Allowed / Received in the period + bill discounts. */
const getRegister = catchAsync(async (req, res) => {
  res.send(
    await ledgerDiscountService.getRegister({ organizationId: req.organizationId, branchId: req.branchId }, req.query)
  );
});

module.exports = { getSettings, updateSettings, getRegister };
