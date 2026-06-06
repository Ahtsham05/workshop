const httpStatus = require('http-status');
const { FeePaymentRequest, FeeVoucher } = require('../models');
const ApiError = require('../utils/ApiError');
const feeVoucherService = require('./feeVoucher.service');

const getTenantFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = scope.organizationId;
  if (scope.branchId) filter.branchId = scope.branchId;
  return filter;
};

const effectiveNet = (v) => {
  if (v.netAmount && v.netAmount > 0) return v.netAmount;
  const t = (v.feeItems || []).reduce((s, fi) => s + (fi.amount || 0), 0);
  return Math.max(0, t - (v.discount || 0) + (v.fine || 0));
};

const PAYABLE_STATUSES = ['unpaid', 'partial', 'overdue'];

/**
 * Create a payment request for one or more vouchers belonging to a student.
 * Validates ownership + payable status and snapshots each voucher's remaining.
 */
const createRequest = async ({ studentId, voucherIds, ...rest }, scope = {}) => {
  if (!Array.isArray(voucherIds) || voucherIds.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Select at least one voucher to pay');
  }

  const vouchers = await FeeVoucher.find({
    _id: { $in: voucherIds },
    studentId,
    ...getTenantFilter({ organizationId: scope.organizationId }),
  }).lean();

  if (vouchers.length !== voucherIds.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'One or more vouchers are invalid for this student');
  }

  const payable = vouchers.filter((v) => PAYABLE_STATUSES.includes(v.status));
  if (payable.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Selected vouchers are already paid or cancelled');
  }

  const voucherSummary = payable.map((v) => ({
    voucherId: v._id,
    voucherNumber: v.voucherNumber || '',
    period: v.month && v.year ? `${v.month} ${v.year}` : v.month || '',
    amount: Math.max(0, effectiveNet(v) - (v.paidAmount || 0)),
  }));
  const amount = voucherSummary.reduce((s, x) => s + x.amount, 0);

  // Prefer the voucher's branch so admin approval / accounting posts to the
  // correct branch even though the portal user sends no branch header.
  const branchId = payable[0].branchId || scope.branchId;

  return FeePaymentRequest.create({
    organizationId: scope.organizationId,
    branchId,
    studentId,
    voucherIds: payable.map((v) => v._id),
    amount,
    voucherSummary,
    bankAccountId: rest.bankAccountId || undefined,
    bankAccountLabel: rest.bankAccountLabel,
    senderName: rest.senderName,
    transactionRef: rest.transactionRef,
    note: rest.note,
    screenshot: rest.screenshot,
    submittedBy: scope.submittedBy,
    status: 'pending',
  });
};

const queryRequests = async (filter, options) =>
  FeePaymentRequest.paginate(filter, {
    ...options,
    populate: [
      { path: 'studentId', select: 'firstName lastName admissionNumber rollNumber classId parent.fatherName parent.phone' },
      { path: 'reviewedBy', select: 'name email' },
    ],
  });

const listForStudents = async (studentIds, scope = {}) =>
  FeePaymentRequest.find({ ...getTenantFilter({ organizationId: scope.organizationId }), studentId: { $in: studentIds } })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

const getRequestById = async (id, scope = {}) =>
  FeePaymentRequest.findOne({ _id: id, ...getTenantFilter({ organizationId: scope.organizationId }) })
    .populate('studentId', 'firstName lastName admissionNumber rollNumber')
    .populate('voucherIds');

const countPending = async (scope = {}) =>
  FeePaymentRequest.countDocuments({ ...getTenantFilter(scope), status: 'pending' });

/**
 * Approve a payment request: mark every still-payable voucher as paid
 * (reusing feeVoucherService.payVoucher so transactions + accounting post),
 * then flag the request approved.
 */
const approveRequest = async (id, scope = {}, reviewer = {}) => {
  const request = await FeePaymentRequest.findOne({
    _id: id,
    ...getTenantFilter({ organizationId: scope.organizationId }),
  });
  if (!request) throw new ApiError(httpStatus.NOT_FOUND, 'Payment request not found');
  if (request.status !== 'pending') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Request already ${request.status}`);
  }

  // Scope used for the actual voucher payment (org + the request's branch)
  const payScope = {
    organizationId: request.organizationId,
    branchId: request.branchId,
    createdBy: reviewer.userId,
  };

  for (const voucherId of request.voucherIds) {
    const voucher = await FeeVoucher.findOne({ _id: voucherId, organizationId: request.organizationId });
    if (!voucher) continue;
    if (!PAYABLE_STATUSES.includes(voucher.status)) continue;

    const net = effectiveNet(voucher);
    const remaining = Math.max(0, net - (voucher.paidAmount || 0));
    if (remaining <= 0) continue;

    await feeVoucherService.payVoucher(
      voucher._id.toString(),
      {
        amount: remaining,
        paymentMethod: 'bank_transfer',
        remarks: `Online payment approved${request.transactionRef ? ` (Ref: ${request.transactionRef})` : ''}`,
      },
      payScope,
    );
  }

  request.status = 'approved';
  request.reviewedBy = reviewer.userId;
  request.reviewedAt = new Date();
  if (reviewer.note) request.reviewNote = reviewer.note;
  await request.save();

  return getRequestById(id, scope);
};

const rejectRequest = async (id, scope = {}, reviewer = {}) => {
  const request = await FeePaymentRequest.findOne({
    _id: id,
    ...getTenantFilter({ organizationId: scope.organizationId }),
  });
  if (!request) throw new ApiError(httpStatus.NOT_FOUND, 'Payment request not found');
  if (request.status !== 'pending') {
    throw new ApiError(httpStatus.BAD_REQUEST, `Request already ${request.status}`);
  }

  request.status = 'rejected';
  request.reviewedBy = reviewer.userId;
  request.reviewedAt = new Date();
  request.reviewNote = reviewer.note || 'Rejected';
  await request.save();

  return getRequestById(id, scope);
};

module.exports = {
  createRequest,
  queryRequests,
  listForStudents,
  getRequestById,
  countPending,
  approveRequest,
  rejectRequest,
};
