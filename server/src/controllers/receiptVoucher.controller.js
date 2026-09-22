const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { receiptVoucherService, auditLogService, localizationService } = require('../services');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const { applyBusinessDateRange } = require('../utils/businessTimezone');
const ApiError = require('../utils/ApiError');
const { formatMoney } = require('../utils/money');
const { voucherAuditSnapshot, voucherCreateAuditFields } = require('../utils/voucherAudit');

const createVoucher = catchAsync(async (req, res) => {
  const voucher = await receiptVoucherService.createVoucher({ ...req.body, ...getBranchContext(req) }, req.user.id);
  const currencyMeta = await localizationService.resolveOrganizationCurrencyMeta(req.organizationId);
  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'ReceiptVoucher',
    entityId: voucher._id,
    entityName: `${voucher.voucherNumber} — ${formatMoney(voucher.totalAmount, currencyMeta)}`,
    after: voucherAuditSnapshot(voucher, 'payerName'),
    fields: voucherCreateAuditFields(voucher),
  });
  res.status(httpStatus.CREATED).send(voucher);
});

const getVouchers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['bankAccountId']);
  applyBranchFilter(filter, req);

  if (req.query.sourceType) {
    filter['lines.sourceType'] = req.query.sourceType;
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
      { 'lines.payerName': { $regex: req.query.search, $options: 'i' } },
      { 'lines.category': { $regex: req.query.search, $options: 'i' } },
    ];
  }

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await receiptVoucherService.queryVouchers(filter, options);
  res.send(result);
});

const getVoucher = catchAsync(async (req, res) => {
  const voucher = await receiptVoucherService.getVoucherDetailById(req.params.receiptVoucherId, applyBranchFilter({}, req));
  if (!voucher) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Receipt voucher not found');
  }
  res.send(voucher);
});

const updateVoucher = catchAsync(async (req, res) => {
  const scope = applyBranchFilter({}, req);
  const before = await receiptVoucherService.getVoucherById(req.params.receiptVoucherId, scope);
  if (!before) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Receipt voucher not found');
  }
  const beforeSnapshot = voucherAuditSnapshot(before, 'payerName');

  const voucher = await receiptVoucherService.updateVoucher(req.params.receiptVoucherId, scope, req.body, req.user.id);

  const currencyMeta = await localizationService.resolveOrganizationCurrencyMeta(req.organizationId);
  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'ReceiptVoucher',
    entityId: voucher._id,
    entityName: `${voucher.voucherNumber} — ${formatMoney(voucher.totalAmount, currencyMeta)}`,
    before: beforeSnapshot,
    after: voucherAuditSnapshot(voucher, 'payerName'),
  });
  res.send(voucher);
});

const deleteVoucher = catchAsync(async (req, res) => {
  const scope = applyBranchFilter({}, req);
  const voucher = await receiptVoucherService.getVoucherById(req.params.receiptVoucherId, scope);
  await receiptVoucherService.deleteVoucherById(req.params.receiptVoucherId, scope);
  let entityName;
  if (voucher) {
    const currencyMeta = await localizationService.resolveOrganizationCurrencyMeta(req.organizationId);
    entityName = `${voucher.voucherNumber} — ${formatMoney(voucher.totalAmount, currencyMeta)}`;
  }
  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'ReceiptVoucher',
    entityId: req.params.receiptVoucherId,
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
