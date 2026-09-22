const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { paymentVoucherService, auditLogService, localizationService } = require('../services');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const { applyBusinessDateRange } = require('../utils/businessTimezone');
const ApiError = require('../utils/ApiError');
const { formatMoney } = require('../utils/money');
const { voucherAuditSnapshot, voucherCreateAuditFields } = require('../utils/voucherAudit');

const createVoucher = catchAsync(async (req, res) => {
  const voucher = await paymentVoucherService.createVoucher({ ...req.body, ...getBranchContext(req) }, req.user.id);
  const currencyMeta = await localizationService.resolveOrganizationCurrencyMeta(req.organizationId);
  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'PaymentVoucher',
    entityId: voucher._id,
    entityName: `${voucher.voucherNumber} — ${formatMoney(voucher.totalAmount, currencyMeta)}`,
    after: voucherAuditSnapshot(voucher, 'payeeName'),
    fields: voucherCreateAuditFields(voucher),
  });
  res.status(httpStatus.CREATED).send(voucher);
});

const getVouchers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['bankAccountId']);
  applyBranchFilter(filter, req);

  if (req.query.payeeType) {
    filter['lines.payeeType'] = req.query.payeeType;
  }
  // Calendar dates ("2026-09-22") from the date-range filter are boundaries in Pakistan time,
  // not UTC midnight — otherwise the last few hours of "today" fall outside an "up to today" range.
  const dateRange = pick(req.query, ['startDate', 'endDate']);
  applyBusinessDateRange(dateRange);
  if (dateRange.date) {
    filter.date = dateRange.date;
  }
  if (req.query.minAmount || req.query.maxAmount) {
    filter.totalAmount = {};
    if (req.query.minAmount) filter.totalAmount.$gte = Number(req.query.minAmount);
    if (req.query.maxAmount) filter.totalAmount.$lte = Number(req.query.maxAmount);
  }
  if (req.query.search) {
    filter.$or = [
      { voucherNumber: { $regex: req.query.search, $options: 'i' } },
      { 'lines.payeeName': { $regex: req.query.search, $options: 'i' } },
      { 'lines.category': { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await paymentVoucherService.queryVouchers(filter, options);
  res.send(result);
});

const getVoucher = catchAsync(async (req, res) => {
  const voucher = await paymentVoucherService.getVoucherDetailById(req.params.paymentVoucherId, applyBranchFilter({}, req));
  if (!voucher) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment voucher not found');
  }
  res.send(voucher);
});

const updateVoucher = catchAsync(async (req, res) => {
  const scope = applyBranchFilter({}, req);
  const before = await paymentVoucherService.getVoucherById(req.params.paymentVoucherId, scope);
  if (!before) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment voucher not found');
  }
  const beforeSnapshot = voucherAuditSnapshot(before, 'payeeName');

  const voucher = await paymentVoucherService.updateVoucher(req.params.paymentVoucherId, scope, req.body, req.user.id);

  const currencyMeta = await localizationService.resolveOrganizationCurrencyMeta(req.organizationId);
  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'PaymentVoucher',
    entityId: voucher._id,
    entityName: `${voucher.voucherNumber} — ${formatMoney(voucher.totalAmount, currencyMeta)}`,
    before: beforeSnapshot,
    after: voucherAuditSnapshot(voucher, 'payeeName'),
  });
  res.send(voucher);
});

const deleteVoucher = catchAsync(async (req, res) => {
  const scope = applyBranchFilter({}, req);
  const voucher = await paymentVoucherService.getVoucherById(req.params.paymentVoucherId, scope);
  await paymentVoucherService.deleteVoucherById(req.params.paymentVoucherId, scope);
  let entityName;
  if (voucher) {
    const currencyMeta = await localizationService.resolveOrganizationCurrencyMeta(req.organizationId);
    entityName = `${voucher.voucherNumber} — ${formatMoney(voucher.totalAmount, currencyMeta)}`;
  }
  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'PaymentVoucher',
    entityId: req.params.paymentVoucherId,
    entityName,
  });
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createVoucher,
  getVouchers,
  getVoucher,
  updateVoucher,
  deleteVoucher,
};
