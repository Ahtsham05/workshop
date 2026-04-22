const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { FeeVoucher, SchoolTransaction, Student, FeeCategory, StudentCreditLedger, SchoolClass } = require('../models');
const ApiError = require('../utils/ApiError');
const accountsSystemService = require('./accountsSystem.service');

const getTenantFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = scope.organizationId;
  if (scope.branchId) filter.branchId = scope.branchId;
  return filter;
};

/**
 * Like getTenantFilter but casts IDs to ObjectId for use in aggregate pipelines.
 * Mongoose .find() auto-casts strings → ObjectId but aggregate() does NOT.
 */
const getAggregateFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = new mongoose.Types.ObjectId(scope.organizationId);
  if (scope.branchId) filter.branchId = new mongoose.Types.ObjectId(scope.branchId);
  return filter;
};

// ─── Credit wallet helpers ───────────────────────────────────────────────────

/**
 * Add or subtract from a student's credit wallet atomically.
 * Creates a ledger entry and returns the new balance.
 */
const adjustCredit = async (studentId, delta, type, extra = {}, scope = {}) => {
  const student = await Student.findOneAndUpdate(
    { _id: studentId, ...getTenantFilter(scope) },
    { $inc: { creditBalance: delta } },
    { new: true, upsert: false }
  );
  if (!student) throw new ApiError(httpStatus.NOT_FOUND, 'Student not found');

  await StudentCreditLedger.create({
    organizationId: scope.organizationId,
    branchId: scope.branchId,
    studentId,
    type,
    amount: delta,
    balanceAfter: student.creditBalance,
    voucherId: extra.voucherId || null,
    description: extra.description || '',
    paymentMethod: extra.paymentMethod || '',
    date: extra.date || new Date(),
    createdBy: extra.createdBy,
  });

  return student.creditBalance;
};

const createVoucher = async (body) => {
  return FeeVoucher.create(body);
};

/**
 * Bulk-generate vouchers for an entire class for a given month/year.
 * Uses individual create() calls so all pre-save hooks run (netAmount, voucherNumber, status).
 * Skips students that already have a voucher for that month/year (duplicate-key is caught + ignored).
 */
const bulkGenerateVouchers = async (students, feeStructure, month, year, scope) => {
  const dueDay = feeStructure.dueDay || 10;
  const monthIndex = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ].indexOf(month);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let dueDate = new Date(year, monthIndex, dueDay);
  // If the standard due date has already passed, move it to end-of-month so newly
  // generated vouchers are not immediately marked overdue.
  if (dueDate < today) {
    dueDate = new Date(year, monthIndex + 1, 0); // day 0 of next month = last day
  }

  // Create each voucher individually so pre-save hooks fire (netAmount, voucherNumber, status).
  // Promise.allSettled lets us skip duplicate-key errors without aborting the batch.
  const results = await Promise.allSettled(
    students.map((student) =>
      FeeVoucher.create({
        organizationId: scope.organizationId,
        branchId: scope.branchId,
        studentId: student._id || student.id,
        classId: feeStructure.classId._id || feeStructure.classId,
        sectionId: student.sectionId,
        feeStructureId: feeStructure._id || feeStructure.id,
        month,
        year,
        feeItems: feeStructure.feeItems.map((item) => ({
          name: item.name,
          amount: item.amount,
          categoryId: item.categoryId,
        })),
        totalAmount: feeStructure.totalAmount,
        discount: student.feeStructure?.discount || 0,
        dueDate,
        createdBy: scope.createdBy,
      })
    )
  );

  const insertedCount = results.filter((r) => r.status === 'fulfilled').length;
  return { insertedCount };
};

/**
 * Bulk-generate vouchers using each student's own fee set at admission time.
 * Falls back to the provided feeStructure for any student who has no individual fees.
 *
 * feeSource options:
 *  - 'admission_form' : use student.feeStructure (monthlyFee, admissionFee, transportFee, discount)
 *  - 'fee_structure'  : use the class-level feeStructure (legacy behaviour)
 *  - 'mixed'          : prefer student.feeStructure, fall back to feeStructure for students without one
 */
const bulkGenerateVouchersV2 = async (students, feeStructure, month, year, scope, feeSource = 'fee_structure') => {
  const monthIndex = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ].indexOf(month);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Compute due date (use feeStructure.dueDay if available)
  const dueDay = feeStructure ? (feeStructure.dueDay || 10) : 10;
  let dueDate = new Date(year, monthIndex, dueDay);
  if (dueDate < today) {
    dueDate = new Date(year, monthIndex + 1, 0);
  }

  const skipped = [];  // students with no fees at all

  const results = await Promise.allSettled(
    students.map((student) => {
      const sf = student.feeStructure || {};
      const hasSf = sf.monthlyFee > 0 || sf.admissionFee > 0 || sf.transportFee > 0;

      let feeItems;
      let discount;
      let classIdToUse;

      if (feeSource === 'admission_form' || (feeSource === 'mixed' && hasSf)) {
        // Build fee items from the student's admission-time fee structure
        feeItems = [];
        if (sf.admissionFee > 0) feeItems.push({ name: 'Admission Fee', amount: sf.admissionFee });
        if (sf.monthlyFee > 0)   feeItems.push({ name: 'Monthly Fee',   amount: sf.monthlyFee });
        if (sf.transportFee > 0) feeItems.push({ name: 'Transport Fee', amount: sf.transportFee });
        discount = sf.discount || 0;
        classIdToUse = student.classId;
      } else {
        // Fall back to the class-level fee structure
        if (!feeStructure) return Promise.resolve(null); // skip — no fallback available
        feeItems = (feeStructure.feeItems || []).map((item) => ({
          name: item.name,
          amount: item.amount,
          categoryId: item.categoryId,
        }));
        discount = sf.discount || 0;
        classIdToUse = feeStructure.classId._id || feeStructure.classId;
      }

      if (!feeItems.length) {
        // Student has no fees at all in either source — skip silently
        skipped.push(student._id || student.id);
        return Promise.resolve(null);
      }

      return FeeVoucher.create({
        organizationId: scope.organizationId,
        branchId: scope.branchId,
        studentId: student._id || student.id,
        classId: classIdToUse,
        sectionId: student.sectionId,
        feeStructureId: feeStructure ? (feeStructure._id || feeStructure.id) : undefined,
        month,
        year,
        feeItems,
        discount,
        dueDate,
        createdBy: scope.createdBy,
      });
    })
  );

  const insertedCount = results.filter((r) => r.status === 'fulfilled' && r.value !== null).length;
  const errorCount = results.filter((r) => r.status === 'rejected').length;
  return { insertedCount, skipped: skipped.length, errorCount };
};

const queryVouchers = async (filter, options) => {
  return FeeVoucher.paginate(filter, {
    ...options,
    populate: [
      { path: 'studentId', select: 'firstName lastName admissionNumber rollNumber' },
      { path: 'classId', select: 'name' },
      { path: 'sectionId', select: 'name' },
    ],
  });
};

const getVoucherById = async (id, scope = {}) => {
  return FeeVoucher.findOne({ _id: id, ...getTenantFilter(scope) })
    .populate('studentId')
    .populate('classId')
    .populate('sectionId')
    .populate('feeItems.categoryId');
};

const getStudentVouchers = async (studentId, scope = {}) => {
  return FeeVoucher.find({ ...getTenantFilter(scope), studentId })
    .populate('classId', 'name')
    .sort({ year: -1, createdAt: -1 })
    .lean();
};

/**
 * Record fee payment:
 *  1. Update voucher paidAmount / status
 *  2. Create a SchoolTransaction (INCOME) linked to this voucher
 */
const payVoucher = async (id, paymentData, scope = {}) => {
  const voucher = await getVoucherById(id, scope);
  if (!voucher) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher not found');
  if (voucher.status === 'cancelled') throw new ApiError(httpStatus.BAD_REQUEST, 'Voucher is cancelled');

  // If netAmount is missing/zero (stale data from insertMany bypass), recompute it now
  if (!voucher.netAmount || voucher.netAmount === 0) {
    const computed = (voucher.feeItems || []).reduce((s, fi) => s + (fi.amount || 0), 0);
    voucher.totalAmount = computed;
    voucher.netAmount = Math.max(0, computed - (voucher.discount || 0) + (voucher.fine || 0));
  }

  const prevPaid  = voucher.paidAmount || 0;
  const remaining = Math.max(0, voucher.netAmount - prevPaid);

  // Cash being applied to this specific voucher (never exceed remaining)
  const applyToCurrent = Math.min(paymentData.amount, remaining);
  // Any excess becomes credit in the student wallet
  const excessCredit   = Math.max(0, paymentData.amount - remaining);

  voucher.paidAmount    = prevPaid + applyToCurrent;
  voucher.paymentMethod = paymentData.paymentMethod || 'cash';
  voucher.paidDate      = new Date();
  if (paymentData.remarks) voucher.remarks = paymentData.remarks;

  // Status is auto-set by pre-save hook
  await voucher.save();

  // Record in unified transaction ledger
  let categoryId = paymentData.categoryId;
  if (!categoryId) {
    // Auto-upsert default income category so income always appears in reports
    const cat = await FeeCategory.findOneAndUpdate(
      { ...getTenantFilter(scope), name: 'Tuition Fee', type: 'INCOME' },
      { $setOnInsert: { ...getTenantFilter(scope), name: 'Tuition Fee', type: 'INCOME' } },
      { upsert: true, new: true }
    );
    categoryId = cat._id;
  }
  if (applyToCurrent > 0) {
    const txn = await SchoolTransaction.create({
      organizationId: scope.organizationId,
      branchId:       scope.branchId,
      type:           'INCOME',
      categoryId,
      amount:         applyToCurrent,
      date:           new Date(),
      referenceId:    voucher._id,
      referenceModel: 'FeeVoucher',
      description:    `Fee payment — ${voucher.month} ${voucher.year} | Voucher ${voucher.voucherNumber}`,
      paymentMethod:  paymentData.paymentMethod || 'cash',
      createdBy:      scope.createdBy,
    });
    await FeeVoucher.findByIdAndUpdate(voucher._id, { transactionId: txn._id });

    // Auto-post to double-entry accounting (fire-and-forget)
    accountsSystemService.postFeePayment(scope, {
      amount: applyToCurrent,
      paymentMethod: paymentData.paymentMethod || 'cash',
      voucherId: voucher._id.toString(),
      description: `Fee payment — ${voucher.month} ${voucher.year} | Voucher ${voucher.voucherNumber}`,
    }).catch(() => {});
  }

  // If excess → add to student credit wallet
  if (excessCredit > 0) {
    await adjustCredit(
      voucher.studentId._id || voucher.studentId,
      excessCredit,
      'overpayment',
      {
        voucherId:     voucher._id,
        description:   `Overpayment on voucher ${voucher.voucherNumber} (${voucher.month} ${voucher.year})`,
        paymentMethod: paymentData.paymentMethod || 'cash',
        createdBy:     scope.createdBy,
      },
      scope
    );
  }

  return getVoucherById(id, scope);
};

const updateVoucherById = async (id, updateBody, scope = {}) => {
  const doc = await getVoucherById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher not found');
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteVoucherById = async (id, scope = {}) => {
  const doc = await getVoucherById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Voucher not found');
  await doc.deleteOne();
  return doc;
};

/**
 * Get vouchers for printing (populated with student, class, org details)
 */
const getVouchersForPrint = async (ids, scope = {}) => {
  return FeeVoucher.find({ _id: { $in: ids }, ...getTenantFilter(scope) })
    .populate('studentId', 'firstName lastName admissionNumber rollNumber parent')
    .populate('classId', 'name')
    .populate('sectionId', 'name')
    .lean();
};

/**
 * Dashboard stats for the current month
 */
/**
 * Full fee account summary for a single student:
 * - Total billed / received / outstanding across ALL months
 * - Pending vouchers with per-month breakdown
 * - Last payment info
 */
const MONTH_ORDER = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/** Compute effective net amount, falling back to feeItems when stored netAmount is zero */
const effectiveNet = (v) => {
  if (v.netAmount && v.netAmount > 0) return v.netAmount;
  const t = (v.feeItems || []).reduce((s, fi) => s + (fi.amount || 0), 0);
  return Math.max(0, t - (v.discount || 0) + (v.fine || 0));
};

const getStudentFeeSummary = async (studentId, scope = {}) => {
  const [allVouchers, student] = await Promise.all([
    FeeVoucher.find({ ...getTenantFilter(scope), studentId })
      .populate('classId', 'name')
      .lean(),
    Student.findOne({ _id: studentId, ...getTenantFilter(scope) })
      .select('creditBalance')
      .lean(),
  ]);

  // Sort descending by year then month
  allVouchers.sort((a, b) => {
    if (b.year !== a.year) return b.year - a.year;
    return MONTH_ORDER.indexOf(b.month) - MONTH_ORDER.indexOf(a.month);
  });

  const totalBilled   = allVouchers.reduce((s, v) => s + effectiveNet(v), 0);
  const totalReceived = allVouchers.reduce((s, v) => s + (v.paidAmount  || 0), 0);

  const pendingVouchers = allVouchers.filter((v) =>
    ['unpaid', 'partial', 'overdue'].includes(v.status)
  );
  const totalPending = pendingVouchers.reduce(
    (s, v) => s + Math.max(0, effectiveNet(v) - (v.paidAmount || 0)),
    0
  );

  // Last voucher with any payment
  const lastPaidVoucher = allVouchers.find((v) => v.paidAmount > 0);

  return {
    totalBilled,
    totalReceived,
    totalPending,
    totalOutstanding: totalBilled - totalReceived,
    creditBalance: student?.creditBalance || 0,
    totalVouchers: allVouchers.length,
    paidCount: allVouchers.filter((v) => v.status === 'paid').length,
    pendingCount: pendingVouchers.length,
    pendingVouchers: pendingVouchers.map((v) => ({
      id: v._id,
      voucherNumber: v.voucherNumber,
      month: v.month,
      year: v.year,
      netAmount: effectiveNet(v),
      paidAmount: v.paidAmount || 0,
      remaining: Math.max(0, effectiveNet(v) - (v.paidAmount || 0)),
      status: v.status,
      dueDate: v.dueDate,
    })),
    lastPaid: lastPaidVoucher
      ? {
          month: lastPaidVoucher.month,
          year: lastPaidVoucher.year,
          paidAmount: lastPaidVoucher.paidAmount,
          paidDate: lastPaidVoucher.paidDate,
          voucherNumber: lastPaidVoucher.voucherNumber,
        }
      : null,
  };
};

/**
 * Record a pure advance payment (no voucher tied) — adds to student credit wallet.
 * Also records an INCOME SchoolTransaction for accounting.
 */
const recordAdvancePayment = async (studentId, paymentData, scope = {}) => {
  const student = await Student.findOne({ _id: studentId, ...getTenantFilter(scope) });
  if (!student) throw new ApiError(httpStatus.NOT_FOUND, 'Student not found');

  const newBalance = await adjustCredit(
    studentId,
    paymentData.amount,
    'advance',
    {
      description:   paymentData.remarks || `Advance payment`,
      paymentMethod: paymentData.paymentMethod || 'cash',
      createdBy:     scope.createdBy,
    },
    scope
  );

  // Record in transaction ledger
  let categoryId = paymentData.categoryId;
  if (!categoryId) {
    const cat = await FeeCategory.findOne({ ...getTenantFilter(scope), name: 'Tuition Fee', type: 'INCOME' });
    categoryId = cat?._id;
  }
  if (categoryId) {
    await SchoolTransaction.create({
      organizationId: scope.organizationId,
      branchId:       scope.branchId,
      type:           'INCOME',
      categoryId,
      amount:         paymentData.amount,
      date:           new Date(),
      description:    `Advance payment — ${student.firstName} ${student.lastName} | Credit wallet`,
      paymentMethod:  paymentData.paymentMethod || 'cash',
      createdBy:      scope.createdBy,
    });

    // Auto-post to double-entry accounting (fire-and-forget)
    accountsSystemService.postAdvancePayment(scope, {
      amount: paymentData.amount,
      paymentMethod: paymentData.paymentMethod || 'cash',
      description: `Advance payment — ${student.firstName} ${student.lastName} | Credit wallet`,
    }).catch(() => {});
  }

  return { creditBalance: newBalance, amount: paymentData.amount };
};

/**
 * Get a student's credit wallet history (paginated, newest first).
 */
const getStudentCreditHistory = async (studentId, scope = {}, options = {}) => {
  return StudentCreditLedger.paginate(
    { ...getTenantFilter(scope), studentId },
    { ...options, sort: { date: -1 }, populate: [{ path: 'voucherId', select: 'voucherNumber month year' }] }
  );
};

/**
 * Batch-fetch credit balance + total outstanding for a list of studentIds.
 * Splits per-student totals into thisMonthOutstanding vs previousArrears.
 * Uses JS-side effectiveNet() to correctly handle stale netAmount=0 vouchers.
 */
const getStudentBalances = async (studentIds, scope = {}, currentMonth, currentYear) => {
  const [students, pendingVouchers] = await Promise.all([
    Student.find({ _id: { $in: studentIds }, ...getTenantFilter(scope) })
      .select('_id creditBalance')
      .lean(),
    FeeVoucher.find({
      ...getTenantFilter(scope),
      studentId: { $in: studentIds },
      status: { $in: ['unpaid', 'partial', 'overdue'] },
    }).select('studentId netAmount feeItems discount fine paidAmount month year').lean(),
  ]);

  const balanceMap = {};
  for (const s of students) {
    balanceMap[s._id.toString()] = {
      creditBalance:         s.creditBalance || 0,
      totalOutstanding:      0,
      thisMonthOutstanding:  0,
      previousArrears:       0,
      pendingCount:          0,
    };
  }
  for (const v of pendingVouchers) {
    const sid = v.studentId.toString();
    if (!balanceMap[sid]) continue;
    const net         = effectiveNet(v);
    const outstanding = Math.max(0, net - (v.paidAmount || 0));
    balanceMap[sid].totalOutstanding += outstanding;
    balanceMap[sid].pendingCount++;
    const isCurrent = currentMonth && currentYear &&
      v.month === currentMonth && Number(v.year) === Number(currentYear);
    if (isCurrent) {
      balanceMap[sid].thisMonthOutstanding += outstanding;
    } else {
      balanceMap[sid].previousArrears += outstanding;
    }
  }
  return balanceMap;
};

/**
 * Reconcile all vouchers that have netAmount=0 or no voucherNumber.
 * Runs save() on each so pre-save hooks recompute totalAmount, netAmount, status, voucherNumber.
 */
/**
 * Bulk-pay a student's outstanding vouchers with a single lump-sum amount.
 * Applies available credit wallet balance first, then cash.
 * Distributes oldest-first until the combined amount is exhausted.
 */
const bulkPayStudentVouchers = async (studentId, paymentData, scope = {}) => {
  const student = await Student.findOne({ _id: studentId, ...getTenantFilter(scope) });
  if (!student) throw new ApiError(httpStatus.NOT_FOUND, 'Student not found');

  const pendingDocs = await FeeVoucher.find({
    ...getTenantFilter(scope),
    studentId,
    status: { $in: ['unpaid', 'partial', 'overdue'] },
  });

  // Sort oldest first
  pendingDocs.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month);
  });

  // Available credit from wallet
  const creditAvailable = Math.max(0, student.creditBalance || 0);
  let creditUsed = 0;
  let cashUsed   = 0;
  const paid     = [];

  // Pool = cash from user + available credit
  let pool = paymentData.amount + creditAvailable;

  for (const v of pendingDocs) {
    if (pool <= 0) break;
    const net         = effectiveNet(v);
    const alreadyPaid = v.paidAmount || 0;
    const vRemaining  = net - alreadyPaid;
    if (vRemaining <= 0) continue;

    const applyAmount = Math.min(pool, vRemaining);

    // Determine how much of this comes from credit vs cash
    const applyFromCredit = Math.min(applyAmount, creditAvailable - creditUsed);
    const applyFromCash   = applyAmount - applyFromCredit;

    // Reuse single-voucher pay (handles transaction ledger, status, overpayment→credit)
    await payVoucher(v._id.toString(), {
      amount:        applyFromCash > 0 ? applyAmount : 0, // payVoucher will handle residual
      paymentMethod: paymentData.paymentMethod || 'cash',
      remarks:       paymentData.remarks,
      categoryId:    paymentData.categoryId,
    }, scope);

    // If credit was used, consume it from the wallet
    if (applyFromCredit > 0) {
      await adjustCredit(
        studentId,
        -applyFromCredit,
        'applied',
        {
          voucherId:   v._id,
          description: `Credit applied to ${v.month} ${v.year} voucher`,
          createdBy:   scope.createdBy,
        },
        scope
      );
      creditUsed += applyFromCredit;
    }
    cashUsed += applyFromCash;
    pool     -= applyAmount;

    paid.push({
      voucherId:     v._id,
      month:         v.month,
      year:          v.year,
      applied:       applyAmount,
      fromCredit:    applyFromCredit,
      fromCash:      applyFromCash,
    });
  }

  // If there is remaining pool (cash paid > total outstanding), save excess as advance credit
  if (pool > 0 && pool > creditAvailable - creditUsed) {
    const excessCash = Math.max(0, pool - (creditAvailable - creditUsed));
    if (excessCash > 0) {
      await adjustCredit(
        studentId,
        excessCash,
        'advance',
        {
          description:   `Advance payment — surplus after clearing all outstanding`,
          paymentMethod: paymentData.paymentMethod || 'cash',
          createdBy:     scope.createdBy,
        },
        scope
      );
    }
  }

  const updatedStudent = await Student.findById(studentId).lean();

  return {
    totalCash:       paymentData.amount,
    totalCreditUsed: creditUsed,
    totalApplied:    creditUsed + cashUsed,
    newCreditBalance: updatedStudent?.creditBalance ?? 0,
    vouchersPaid:    paid,
  };
};

const reconcileVouchers = async (scope = {}) => {
  // Seed the sequence counter to max existing voucher sequence so new numbers
  // assigned during reconcile don't collide with already-numbered vouchers.
  if (scope.organizationId) {
    const mongoose = require('mongoose');
    const db = mongoose.connection.db;
    const seqKey = `voucher_${scope.organizationId}`;

    // Find the highest numeric suffix from existing voucherNumbers in this org
    const highest = await FeeVoucher.find(
      { organizationId: scope.organizationId, voucherNumber: { $exists: true, $ne: null } },
      { voucherNumber: 1 }
    ).lean();

    let maxSeq = 0;
    for (const v of highest) {
      const parts = (v.voucherNumber || '').split('-');
      const num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num) && num > maxSeq) maxSeq = num;
    }

    if (maxSeq > 0) {
      // Only update the counter if its current value is lower (avoids going backwards)
      await db.collection('_sequences').updateOne(
        { _id: seqKey, $or: [{ seq: { $lt: maxSeq } }, { seq: { $exists: false } }] },
        { $set: { seq: maxSeq } },
        { upsert: true }
      );
    }
  }

  const stale = await FeeVoucher.find({
    ...getTenantFilter(scope),
    $or: [{ netAmount: { $in: [null, 0] } }, { voucherNumber: null }],
  });

  let fixed = 0;
  let failed = 0;
  for (const v of stale) {
    try {
      await v.save();
      fixed++;
    } catch (_) {
      failed++;
    }
  }
  return { fixed, failed, total: stale.length };
};

const getDashboardStats = async (scope, month, year) => {
  const filter = { ...getAggregateFilter(scope) };
  if (month) filter.month = month;
  if (year) filter.year = Number(year);

  const [totals, statusCounts] = await Promise.all([
    FeeVoucher.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalExpected: { $sum: '$netAmount' },
          totalCollected: { $sum: '$paidAmount' },
          totalVouchers: { $sum: 1 },
        },
      },
    ]),
    FeeVoucher.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const stats = totals[0] || { totalExpected: 0, totalCollected: 0, totalVouchers: 0 };
  const statusMap = {};
  statusCounts.forEach((s) => { statusMap[s._id] = s.count; });

  return {
    ...stats,
    totalPending: stats.totalExpected - stats.totalCollected,
    paid: statusMap.paid || 0,
    unpaid: statusMap.unpaid || 0,
    partial: statusMap.partial || 0,
    overdue: statusMap.overdue || 0,
  };
};

/**
 * Org-level receivable summary for the stats strip.
 * Splits outstanding into "this month" vs "previous arrears".
 * Also returns total credit-wallet (advance payments held).
 */
const getReceivableSummary = async (scope, month, year) => {
  // Date range for "received this month" — payments whose paidDate falls in the calendar month
  const monthIndex = MONTH_ORDER.indexOf(month);
  const numYear = Number(year);
  const monthStart = new Date(numYear, monthIndex >= 0 ? monthIndex : 0, 1);
  const monthEnd = new Date(numYear, monthIndex >= 0 ? monthIndex + 1 : 1, 0, 23, 59, 59, 999);

  const [pendingVouchers, paidInMonth, creditAgg] = await Promise.all([
    FeeVoucher.find({
      ...getTenantFilter(scope),
      status: { $in: ['unpaid', 'partial', 'overdue'] },
    }).select('netAmount feeItems discount fine paidAmount month year').lean(),
    // All vouchers whose paidDate falls within this calendar month (regardless of voucher month)
    FeeVoucher.find({
      ...getTenantFilter(scope),
      paidDate: { $gte: monthStart, $lte: monthEnd },
      paidAmount: { $gt: 0 },
    }).select('paidAmount').lean(),
    Student.aggregate([
      { $match: { ...getAggregateFilter(scope), creditBalance: { $gt: 0 } } },
      { $group: { _id: null, total: { $sum: '$creditBalance' } } },
    ]),
  ]);

  let thisMonthReceivable = 0;
  let previousArrears     = 0;
  let thisMonthVouchers   = 0;
  let arrearsVouchers     = 0;

  for (const v of pendingVouchers) {
    const net         = effectiveNet(v);
    const outstanding = Math.max(0, net - (v.paidAmount || 0));
    const isCurrent   = v.month === month && Number(v.year) === numYear;
    if (isCurrent) {
      thisMonthReceivable += outstanding;
      thisMonthVouchers++;
    } else {
      previousArrears += outstanding;
      arrearsVouchers++;
    }
  }

  const totalCreditBalance = creditAgg[0]?.total || 0;
  const totalReceivedThisMonth = paidInMonth.reduce((s, v) => s + (v.paidAmount || 0), 0);

  return {
    thisMonthReceivable,
    thisMonthVouchers,
    previousArrears,
    arrearsVouchers,
    totalReceivable: thisMonthReceivable + previousArrears,
    totalCreditBalance,
    totalReceivedThisMonth,
    paidVouchersThisMonth: paidInMonth.length,
  };
};

/**
 * Yearly fee report — class-wise breakdown of fee payments for each month.
 * Returns data grouped by class, with students and monthly payment status.
 */
const getYearlyFeeReport = async (scope, year, classId) => {
  const filter = { ...getTenantFilter(scope), year: Number(year) };
  if (classId) filter.classId = classId;

  const [vouchers, students, classes] = await Promise.all([
    FeeVoucher.find(filter)
      .select('studentId classId month year netAmount feeItems discount fine paidAmount status')
      .lean(),
    Student.find({
      ...getTenantFilter(scope),
      status: 'active',
      ...(classId ? { classId } : {}),
    })
      .select('firstName lastName rollNumber admissionNumber parent classId')
      .lean(),
    SchoolClass.find({ ...getTenantFilter(scope), ...(classId ? { _id: classId } : {}) })
      .select('name')
      .sort({ name: 1 })
      .lean(),
  ]);

  // Index students by id
  const studentMap = {};
  for (const s of students) {
    studentMap[s._id.toString()] = s;
  }

  // Group vouchers by class → student → month
  const classMap = {};
  for (const v of vouchers) {
    const cid = v.classId.toString();
    const sid = v.studentId.toString();
    if (!classMap[cid]) classMap[cid] = {};
    if (!classMap[cid][sid]) classMap[cid][sid] = {};
    classMap[cid][sid][v.month] = {
      netAmount: effectiveNet(v),
      paidAmount: v.paidAmount || 0,
      status: v.status,
    };
  }

  // Build response grouped by class
  const result = [];
  for (const cls of classes) {
    const cid = cls._id.toString();
    const studentsInClass = students.filter((s) => s.classId.toString() === cid);
    const studentRows = [];

    for (const s of studentsInClass) {
      const sid = s._id.toString();
      const monthlyData = classMap[cid]?.[sid] || {};
      let totalFees = 0;
      let totalPaid = 0;
      let paidMonths = 0;
      let pendingMonths = 0;

      const months = {};
      for (const m of MONTH_ORDER) {
        const entry = monthlyData[m];
        if (entry) {
          months[m] = entry;
          totalFees += entry.netAmount;
          totalPaid += entry.paidAmount;
          if (entry.status === 'paid') paidMonths++;
          else pendingMonths++;
        } else {
          months[m] = null;
        }
      }

      studentRows.push({
        studentId: sid,
        name: `${s.firstName} ${s.lastName || ''}`.trim(),
        rollNumber: s.rollNumber || '',
        admissionNumber: s.admissionNumber || '',
        fatherName: s.parent?.fatherName || '',
        phone: s.parent?.phone || '',
        months,
        totalFees,
        totalPaid,
        totalPending: totalFees - totalPaid,
        paidMonths,
        pendingMonths,
      });
    }

    // Sort by roll number
    studentRows.sort((a, b) => (a.rollNumber || '').localeCompare(b.rollNumber || '', undefined, { numeric: true }));

    // Class totals
    let classTotalFees = 0;
    let classTotalPaid = 0;
    for (const sr of studentRows) {
      classTotalFees += sr.totalFees;
      classTotalPaid += sr.totalPaid;
    }

    result.push({
      classId: cid,
      className: cls.name,
      students: studentRows,
      totalStudents: studentRows.length,
      classTotalFees,
      classTotalPaid,
      classTotalPending: classTotalFees - classTotalPaid,
    });
  }

  return result;
};

module.exports = {
  createVoucher,
  bulkGenerateVouchers,
  bulkGenerateVouchersV2,
  queryVouchers,
  getVoucherById,
  getStudentVouchers,
  getStudentFeeSummary,
  payVoucher,
  bulkPayStudentVouchers,
  recordAdvancePayment,
  getStudentCreditHistory,
  getStudentBalances,
  getReceivableSummary,
  getYearlyFeeReport,
  updateVoucherById,
  deleteVoucherById,
  getVouchersForPrint,
  reconcileVouchers,
  getDashboardStats,
};
