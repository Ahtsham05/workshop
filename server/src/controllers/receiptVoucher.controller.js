const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { receiptVoucherService, auditLogService } = require('../services');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const ApiError = require('../utils/ApiError');

const createVoucher = catchAsync(async (req, res) => {
  const voucher = await receiptVoucherService.createVoucher({ ...req.body, ...getBranchContext(req) }, req.user.id);
  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'ReceiptVoucher',
    entityId: voucher._id,
    entityName: `${voucher.voucherNumber} — Rs ${voucher.totalAmount}`,
    after: voucher.toObject ? voucher.toObject() : voucher,
    fields: ['bankAccountId', 'lines', 'totalAmount'],
  });
  res.status(httpStatus.CREATED).send(voucher);
});

const getVouchers = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['bankAccountId']);
  applyBranchFilter(filter, req);

  if (req.query.sourceType) {
    filter['lines.sourceType'] = req.query.sourceType;
  }
  if (req.query.startDate || req.query.endDate) {
    filter.date = {};
    if (req.query.startDate) filter.date.$gte = new Date(req.query.startDate);
    if (req.query.endDate) filter.date.$lte = new Date(req.query.endDate);
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
  const voucher = await receiptVoucherService.getVoucherById(req.params.receiptVoucherId);
  if (!voucher) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Receipt voucher not found');
  }
  res.send(voucher);
});

const deleteVoucher = catchAsync(async (req, res) => {
  const voucher = await receiptVoucherService.getVoucherById(req.params.receiptVoucherId);
  await receiptVoucherService.deleteVoucherById(req.params.receiptVoucherId);
  await auditLogService.recordAuditLog({
    req,
    action: 'delete',
    module: 'ReceiptVoucher',
    entityId: req.params.receiptVoucherId,
    entityName: voucher ? `${voucher.voucherNumber} — Rs ${voucher.totalAmount}` : undefined,
  });
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createVoucher,
  getVouchers,
  getVoucher,
  deleteVoucher,
};
