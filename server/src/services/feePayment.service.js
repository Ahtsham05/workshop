const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { FeePayment, FeeVoucher, SchoolTransaction, Student, FeeCategory } = require('../models');
const ApiError = require('../utils/ApiError');
const feeVoucherService = require('./feeVoucher.service');
const { parseBusinessDateBoundary, parseBusinessDateTime } = require('../utils/businessTimezone');

const getTenantFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = scope.organizationId;
  if (scope.branchId) filter.branchId = scope.branchId;
  return filter;
};

const getAggregateFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = new mongoose.Types.ObjectId(scope.organizationId);
  if (scope.branchId) filter.branchId = new mongoose.Types.ObjectId(scope.branchId);
  return filter;
};

const PAYABLE_STATUSES = ['unpaid', 'partial', 'overdue'];

/**
 * Records one collection event ("receipt") that may settle several fee-month
 * vouchers at once. This is the single write path both the per-voucher `pay`
 * endpoint and the multi-month `pay-all` endpoint now go through — each call
 * always produces exactly one FeePayment, whether it covers one voucher or ten.
 *
 * - If `voucherIds` is given, payment is applied ONLY to those exact vouchers
 *   (any status except cancelled) — never silently spills onto other months.
 * - If `voucherIds` is omitted, every pending voucher for `studentId` is
 *   eligible, oldest-first (the original "pay everything outstanding" mode).
 */
const recordFeePayment = async (studentIdInput, paymentData, scope = {}) => {
  const { amount, voucherIds, paymentMethod = 'cash', paymentDate, remarks, categoryId } = paymentData;
  if (!amount || amount <= 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Enter a valid amount');

  const tf = getTenantFilter(scope);
  let studentId = studentIdInput;
  let pendingDocs;

  if (Array.isArray(voucherIds) && voucherIds.length) {
    pendingDocs = await FeeVoucher.find({ ...tf, _id: { $in: voucherIds } });
    if (!pendingDocs.length) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher(s) not found');
    if (pendingDocs.some((v) => v.status === 'cancelled')) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'One or more selected vouchers is cancelled');
    }
    if (!studentId) studentId = pendingDocs[0].studentId;
  } else {
    if (!studentId) throw new ApiError(httpStatus.BAD_REQUEST, 'studentId or voucherIds is required');
    pendingDocs = await FeeVoucher.find({ ...tf, studentId, status: { $in: PAYABLE_STATUSES } });
  }

  const student = await Student.findOne({ _id: studentId, ...tf });
  if (!student) throw new ApiError(httpStatus.NOT_FOUND, 'Student not found');

  const creditAvailable = Math.max(0, student.creditBalance || 0);
  const pool = amount + creditAvailable;
  const { allocations: distro, leftoverPool } = feeVoucherService.distributeAmountAcrossVouchers(pendingDocs, pool);

  // Resolve the income category once for the whole receipt instead of once per voucher line
  let resolvedCategoryId = categoryId;
  if (!resolvedCategoryId) {
    const cat = await FeeCategory.findOneAndUpdate(
      { ...tf, name: 'Tuition Fee', type: 'INCOME' },
      { $setOnInsert: { ...tf, name: 'Tuition Fee', type: 'INCOME' } },
      { upsert: true, new: true }
    );
    resolvedCategoryId = cat._id;
  }

  // Create the receipt shell first so a receipt number is reserved even if a
  // later step in this loop fails; allocations are filled in as they're applied.
  const feePayment = await FeePayment.create({
    organizationId: scope.organizationId,
    branchId: scope.branchId,
    studentId,
    paymentDate: paymentDate ? parseBusinessDateTime(paymentDate) : new Date(),
    totalAmount: amount,
    paymentMethod,
    collectedBy: scope.createdBy,
    remarks,
    createdBy: scope.createdBy,
  });

  let creditUsed = 0;
  const allocationRows = [];
  const sourceTransactionIds = [];
  const vouchersPaid = [];

  for (const { voucher, applyAmount } of distro) {
    const applyFromCredit = Math.min(applyAmount, creditAvailable - creditUsed);
    const applyFromCash = applyAmount - applyFromCredit;

    const txn = await feeVoucherService.applyPaymentToVoucher(
      voucher,
      applyAmount,
      {
        paymentMethod,
        paymentDate: feePayment.paymentDate,
        remarks,
        categoryId: resolvedCategoryId,
        feePaymentId: feePayment._id,
      },
      scope
    );
    if (txn) sourceTransactionIds.push(txn._id);

    if (applyFromCredit > 0) {
      await feeVoucherService.adjustCredit(
        studentId,
        -applyFromCredit,
        'applied',
        {
          voucherId: voucher._id,
          description: `Credit applied to ${voucher.month} ${voucher.year} voucher`,
          createdBy: scope.createdBy,
        },
        scope
      );
      creditUsed += applyFromCredit;
    }

    allocationRows.push({ voucherId: voucher._id, month: voucher.month, year: voucher.year, amount: applyAmount });
    vouchersPaid.push({
      voucherId: voucher._id,
      month: voucher.month,
      year: voucher.year,
      applied: applyAmount,
      fromCredit: applyFromCredit,
      fromCash: applyFromCash,
    });
  }

  // Leftover pool beyond whatever wallet credit remains unspent → new advance credit
  let excessDeposited = 0;
  const creditRemaining = creditAvailable - creditUsed;
  if (leftoverPool > creditRemaining) {
    excessDeposited = leftoverPool - creditRemaining;
    await feeVoucherService.adjustCredit(
      studentId,
      excessDeposited,
      'advance',
      {
        description: 'Advance payment — surplus after clearing all outstanding',
        paymentMethod,
        createdBy: scope.createdBy,
      },
      scope
    );
  }

  feePayment.allocations = allocationRows;
  feePayment.creditFromWallet = creditUsed;
  feePayment.excessDeposited = excessDeposited;
  feePayment.sourceTransactionIds = sourceTransactionIds;
  await feePayment.save();

  const updatedStudent = await Student.findById(studentId).lean();
  const cashUsed = vouchersPaid.reduce((s, v) => s + v.fromCash, 0);

  return {
    feePayment,
    vouchersPaid,
    totalCash: amount,
    totalCreditUsed: creditUsed,
    totalApplied: creditUsed + cashUsed,
    newCreditBalance: updatedStudent?.creditBalance ?? 0,
    excessDeposited,
  };
};

/**
 * Cancels a receipt: reverses every allocation it made (voucher paidAmount
 * decremented, status re-derived by the voucher's own pre-save hook), deletes
 * the SchoolTransaction rows it posted, and reverses whatever wallet credit
 * movement it caused. The FeePayment row itself is kept (status flips to
 * 'cancelled') rather than deleted, so it still appears — struck out — in the
 * Receipt Register, and is excluded from collection totals by callers
 * filtering on status: 'completed'.
 */
const cancelFeePayment = async (id, { reason } = {}, scope = {}) => {
  const tf = getTenantFilter(scope);
  const feePayment = await FeePayment.findOne({ _id: id, ...tf });
  if (!feePayment) throw new ApiError(httpStatus.NOT_FOUND, 'Receipt not found');
  if (feePayment.status === 'cancelled') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Receipt is already cancelled');
  }

  for (const alloc of feePayment.allocations) {
    const voucher = await FeeVoucher.findOne({ _id: alloc.voucherId, ...tf });
    if (!voucher) continue;
    voucher.paidAmount = Math.max(0, (voucher.paidAmount || 0) - alloc.amount);
    await voucher.save();
  }

  if (feePayment.sourceTransactionIds?.length) {
    await SchoolTransaction.deleteMany({ ...tf, _id: { $in: feePayment.sourceTransactionIds } });
  }

  if (feePayment.creditFromWallet > 0) {
    await feeVoucherService.adjustCredit(
      feePayment.studentId,
      feePayment.creditFromWallet,
      'refunded',
      { description: `Receipt ${feePayment.receiptNumber} cancelled — wallet credit restored` },
      scope
    );
  }
  if (feePayment.excessDeposited > 0) {
    await feeVoucherService.adjustCredit(
      feePayment.studentId,
      -feePayment.excessDeposited,
      'applied',
      { description: `Receipt ${feePayment.receiptNumber} cancelled — advance credit reversed` },
      scope
    );
  }

  feePayment.status = 'cancelled';
  feePayment.cancelledAt = new Date();
  feePayment.cancelledBy = scope.createdBy;
  feePayment.cancelReason = reason;
  await feePayment.save();

  return feePayment;
};

const STUDENT_POPULATE = {
  path: 'studentId',
  select: 'firstName lastName admissionNumber rollNumber classId sectionId parent.fatherName parent.guardianName',
  populate: [
    { path: 'classId', select: 'name' },
    { path: 'sectionId', select: 'name' },
  ],
};

const getFeePaymentById = async (id, scope = {}) => {
  return FeePayment.findOne({ _id: id, ...getTenantFilter(scope) })
    .populate(STUDENT_POPULATE)
    .populate('collectedBy', 'name email')
    .populate('allocations.voucherId', 'voucherNumber feeItems');
};

const buildFeePaymentFilter = async (criteria = {}, scope = {}) => {
  const filter = getTenantFilter(scope);
  if (criteria.studentId) filter.studentId = criteria.studentId;
  if (criteria.status) filter.status = criteria.status;
  if (criteria.paymentMethod) filter.paymentMethod = criteria.paymentMethod;
  if (criteria.collectedBy) filter.collectedBy = criteria.collectedBy;
  if (criteria.startDate || criteria.endDate) {
    filter.paymentDate = {};
    if (criteria.startDate) filter.paymentDate.$gte = parseBusinessDateBoundary(criteria.startDate, false);
    if (criteria.endDate) filter.paymentDate.$lte = parseBusinessDateBoundary(criteria.endDate, true);
  }

  if (criteria.search && String(criteria.search).trim()) {
    const term = String(criteria.search).trim();
    const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const matchingStudents = await Student.find({
      ...getTenantFilter(scope),
      $or: [
        { firstName: regex },
        { lastName: regex },
        { admissionNumber: regex },
        { rollNumber: regex },
      ],
    }).select('_id').lean();
    filter.$or = [
      { receiptNumber: regex },
      { studentId: { $in: matchingStudents.map((s) => s._id) } },
    ];
  }

  return filter;
};

const queryFeePayments = async (criteria = {}, options, scope = {}) => {
  const filter = await buildFeePaymentFilter(criteria, scope);
  return FeePayment.paginate(filter, {
    ...options,
    sortBy: options.sortBy || 'paymentDate:desc',
    populate: [STUDENT_POPULATE, { path: 'collectedBy', select: 'name email' }],
  });
};

/**
 * One-time, admin-triggered reconstruction of FeePayment records from
 * pre-existing SchoolTransaction rows (fee payments recorded before this
 * model existed). Groups INCOME rows tied to a FeeVoucher by student +
 * payment method + a tight time window (multi-voucher payments already write
 * their per-voucher transactions milliseconds apart in the same request),
 * and synthesizes one FeePayment per group. Skips any transaction already
 * linked to a FeePayment (via feePaymentId, or already covered by a prior
 * backfill run), so it's safe to re-run.
 */
const GROUP_WINDOW_MS = 5000;

const backfillFeePayments = async (scope = {}) => {
  const tf = getTenantFilter(scope);

  const candidates = await SchoolTransaction.find({
    ...tf,
    type: 'INCOME',
    referenceModel: 'FeeVoucher',
    feePaymentId: { $exists: false },
  })
    .select('_id referenceId amount date paymentMethod createdBy')
    .sort({ date: 1, createdAt: 1 })
    .lean();

  if (!candidates.length) return { created: 0, scanned: 0 };

  const voucherIds = [...new Set(candidates.map((c) => String(c.referenceId)))];
  const vouchers = await FeeVoucher.find({ _id: { $in: voucherIds } })
    .select('studentId month year')
    .lean();
  const voucherMap = new Map(vouchers.map((v) => [String(v._id), v]));

  // Group by studentId + paymentMethod, then split into time-windowed clusters
  const byStudentMethod = new Map();
  for (const txn of candidates) {
    const voucher = voucherMap.get(String(txn.referenceId));
    if (!voucher) continue;
    const key = `${voucher.studentId}::${txn.paymentMethod || 'cash'}`;
    if (!byStudentMethod.has(key)) byStudentMethod.set(key, []);
    byStudentMethod.get(key).push({ txn, voucher });
  }

  let created = 0;
  for (const [, rows] of byStudentMethod) {
    rows.sort((a, b) => new Date(a.txn.date) - new Date(b.txn.date));

    let cluster = [];
    const flush = async () => {
      if (!cluster.length) return;
      const studentId = cluster[0].voucher.studentId;
      const totalAmount = cluster.reduce((s, r) => s + (r.txn.amount || 0), 0);
      const feePayment = await FeePayment.create({
        organizationId: scope.organizationId,
        branchId: scope.branchId,
        studentId,
        paymentDate: cluster[0].txn.date,
        totalAmount,
        paymentMethod: cluster[0].txn.paymentMethod || 'cash',
        collectedBy: cluster[0].txn.createdBy,
        isBackfilled: true,
        allocations: cluster.map((r) => ({
          voucherId: r.voucher._id,
          month: r.voucher.month,
          year: r.voucher.year,
          amount: r.txn.amount || 0,
        })),
        sourceTransactionIds: cluster.map((r) => r.txn._id),
      });
      await SchoolTransaction.updateMany(
        { _id: { $in: cluster.map((r) => r.txn._id) } },
        { $set: { feePaymentId: feePayment._id } }
      );
      created += 1;
      cluster = [];
    };

    for (const row of rows) {
      if (cluster.length && new Date(row.txn.date) - new Date(cluster[cluster.length - 1].txn.date) > GROUP_WINDOW_MS) {
        await flush();
      }
      cluster.push(row);
    }
    await flush();
  }

  return { created, scanned: candidates.length };
};

module.exports = {
  recordFeePayment,
  cancelFeePayment,
  getFeePaymentById,
  queryFeePayments,
  buildFeePaymentFilter,
  backfillFeePayments,
  getAggregateFilter,
  getTenantFilter,
};
