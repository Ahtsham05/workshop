const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const pick = require('../utils/pick');
const { feePaymentService, auditLogService } = require('../services');

const getReceipts = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const criteria = pick(req.query, ['studentId', 'status', 'paymentMethod', 'collectedBy', 'startDate', 'endDate', 'search']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await feePaymentService.queryFeePayments(criteria, options, scope);
  res.send(result);
});

const getReceipt = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const feePayment = await feePaymentService.getFeePaymentById(req.params.feePaymentId, scope);
  if (!feePayment) throw new ApiError(httpStatus.NOT_FOUND, 'Receipt not found');
  res.send(feePayment);
});

const cancelReceipt = catchAsync(async (req, res) => {
  const scope = {
    organizationId: req.user.organizationId,
    branchId: req.branchId,
    createdBy: req.user._id,
  };
  const before = await feePaymentService.getFeePaymentById(req.params.feePaymentId, scope);
  const feePayment = await feePaymentService.cancelFeePayment(req.params.feePaymentId, req.body, scope);

  await auditLogService.recordAuditLog({
    req,
    action: 'status_change',
    module: 'FeePayment',
    entityId: feePayment._id,
    entityName: feePayment.receiptNumber,
    before: { status: 'completed' },
    after: { status: 'cancelled' },
    metadata: {
      reason: req.body?.reason || '',
      totalAmount: feePayment.totalAmount,
      studentId: before?.studentId?._id ? String(before.studentId._id) : String(feePayment.studentId),
    },
  });

  res.send(feePayment);
});

const backfillReceipts = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const result = await feePaymentService.backfillFeePayments(scope);
  res.send({ message: `Backfilled ${result.created} receipt(s) from ${result.scanned} historical transaction(s)`, ...result });
});

module.exports = {
  getReceipts,
  getReceipt,
  cancelReceipt,
  backfillReceipts,
};
