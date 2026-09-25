const { FeePayment, FeeVoucher, Student } = require('../models');
const {
  parseBusinessDateBoundary,
  toBusinessCalendarDate,
  getBusinessDayRange,
} = require('../utils/businessTimezone');

const MONTH_ORDER = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const getTenantFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = scope.organizationId;
  if (scope.branchId) filter.branchId = scope.branchId;
  return filter;
};

/** Comparable index so January 2026 < February 2026 < … < December 2026 < January 2027 */
const periodIndex = (month, year) => {
  const mi = MONTH_ORDER.indexOf(month);
  const y = Number(year);
  if (!Number.isFinite(y)) return 0;
  return y * 12 + (mi < 0 ? 0 : mi);
};

const effectiveNet = (v) => {
  if (v.netAmount && v.netAmount > 0) return v.netAmount;
  const t = (v.feeItems || []).reduce((s, fi) => s + (fi.amount || 0), 0);
  return Math.max(0, t - (v.discount || 0) + (v.fine || 0));
};

/**
 * Resolves classId/sectionId/studentId filters down to a concrete set of
 * studentIds to restrict FeePayment queries by (FeePayment itself doesn't
 * carry classId — it's a property of the student at payment time).
 * Returns undefined when no student-identity restriction applies.
 */
const resolveStudentIds = async (scope, { studentId, classId, sectionId }) => {
  if (studentId) return [studentId];
  if (!classId && !sectionId) return undefined;
  const tf = getTenantFilter(scope);
  const studentFilter = { ...tf };
  if (classId) studentFilter.classId = classId;
  if (sectionId) studentFilter.sectionId = sectionId;
  const students = await Student.find(studentFilter).select('_id').lean();
  return students.map((s) => s._id);
};

const STUDENT_POPULATE = {
  path: 'studentId',
  select: 'firstName lastName admissionNumber rollNumber classId sectionId',
  populate: [{ path: 'classId', select: 'name' }, { path: 'sectionId', select: 'name' }],
};

/**
 * Fetches the FeePayment (receipt) documents matching a filter set — the
 * receipt-level unit used by reports where "one transaction" must mean one
 * receipt (Payment Method report, Staff report, transaction counts), never
 * one fee-month allocation line.
 */
const getReceipts = async (scope, filters = {}) => {
  const {
    startDate, endDate, classId, sectionId, studentId,
    paymentMethod, collectedBy, status = 'completed',
  } = filters;

  const filter = { ...getTenantFilter(scope) };
  if (status) filter.status = status;
  if (paymentMethod) filter.paymentMethod = paymentMethod;
  if (collectedBy) filter.collectedBy = collectedBy;
  if (startDate || endDate) {
    filter.paymentDate = {};
    if (startDate) filter.paymentDate.$gte = parseBusinessDateBoundary(startDate, false);
    if (endDate) filter.paymentDate.$lte = parseBusinessDateBoundary(endDate, true);
  }

  const studentIds = await resolveStudentIds(scope, { studentId, classId, sectionId });
  if (studentIds) {
    if (!studentIds.length) return [];
    filter.studentId = { $in: studentIds };
  }

  return FeePayment.find(filter)
    .populate(STUDENT_POPULATE)
    .populate('collectedBy', 'name email')
    .sort({ paymentDate: 1 })
    .lean();
};

/**
 * Flattens receipts into one row per fee-month allocation — the unit every
 * fee-month-attributed report (Monthly/Yearly/Daily Collection, Detailed
 * Transactions, discounts) is built from.
 *
 * `late` on each row is the single rule that drives every "current fee" vs
 * "previous dues" split in this module: an allocation is "on time" when the
 * calendar month it was actually PAID in is the same as (or earlier than)
 * the fee month it settles, and "late" (arrears) when paid in a calendar
 * month after its own fee month. This one comparison, applied per allocation
 * line, is what makes "September collected 850,000 — 725,000 of which was
 * September's own fee, 125,000 recovered from earlier months" fall out
 * correctly whichever axis (fee month or collection month) a report groups by.
 */
const flattenAllocations = (receipts) => {
  const rows = [];
  for (const r of receipts) {
    const student = r.studentId || {};
    // Parse the PKT calendar-date STRING directly (never re-parse it through `new
    // Date(...).getMonth()`, which reinterprets a bare "YYYY-MM-DD" as UTC midnight
    // and then reads it back in the server's OWN local timezone — silently wrong
    // whenever that's not UTC+0. See businessTimezone.js's own doc comment.
    const paymentCalendar = toBusinessCalendarDate(new Date(r.paymentDate));
    const [pYear, pMonthNum] = paymentCalendar.split('-');
    const paymentYear = Number(pYear);
    const paymentMonth = MONTH_ORDER[Number(pMonthNum) - 1];
    const paymentPeriod = periodIndex(paymentMonth, paymentYear);

    for (const a of r.allocations || []) {
      const feePeriod = periodIndex(a.month, a.year);
      rows.push({
        paymentId: String(r._id),
        receiptNumber: r.receiptNumber,
        paymentDate: r.paymentDate,
        paymentMonth,
        paymentYear,
        studentId: student._id ? String(student._id) : String(r.studentId),
        studentName: `${student.firstName || ''} ${student.lastName || ''}`.trim(),
        classId: student.classId?._id ? String(student.classId._id) : '',
        className: student.classId?.name || '',
        voucherId: String(a.voucherId),
        feeMonth: a.month,
        feeYear: a.year,
        amount: a.amount || 0,
        paymentMethod: r.paymentMethod,
        collectedBy: r.collectedBy?._id ? String(r.collectedBy._id) : (r.collectedBy ? String(r.collectedBy) : ''),
        collectedByName: r.collectedBy?.name || '',
        late: paymentPeriod > feePeriod,
      });
    }
  }
  return rows;
};

/** Sum of `discount` across the distinct vouchers referenced by `rows`, counted once per voucher. */
const sumDiscountForRows = async (rows) => {
  const voucherIds = [...new Set(rows.map((r) => r.voucherId))];
  if (!voucherIds.length) return 0;
  const vouchers = await FeeVoucher.find({ _id: { $in: voucherIds } }).select('discount').lean();
  return vouchers.reduce((s, v) => s + (v.discount || 0), 0);
};

/**
 * Total outstanding fee (billed minus paid, current as of now) across every
 * still-payable voucher in scope. Optionally restricted to a class/section.
 * This is "as of today" — not a historical point-in-time snapshot.
 */
const getOutstanding = async (scope, { classId, sectionId } = {}) => {
  const tf = getTenantFilter(scope);
  const filter = { ...tf, status: { $in: ['unpaid', 'partial', 'overdue'] } };
  if (classId) filter.classId = classId;
  if (sectionId) filter.sectionId = sectionId;
  const pending = await FeeVoucher.find(filter).select('netAmount feeItems discount fine paidAmount').lean();
  return pending.reduce((s, v) => s + Math.max(0, effectiveNet(v) - (v.paidAmount || 0)), 0);
};

/**
 * Section 1 — Collection Dashboard summary cards. `startDate`/`endDate` drive
 * every range-scoped figure (collection totals, discounts, refunds); "today"
 * and "this month" are always the literal current PKT day/month regardless
 * of the filter, since they answer a fixed question ("how much today?").
 */
const getDashboardSummary = async (scope, filters = {}) => {
  const { startDate, endDate, classId, sectionId } = filters;
  const tf = getTenantFilter(scope);

  const receipts = await getReceipts(scope, { ...filters, status: 'completed' });
  const rows = flattenAllocations(receipts);

  const collectionInRange = rows.reduce((s, r) => s + r.amount, 0);
  const currentMonthCollection = rows.filter((r) => !r.late).reduce((s, r) => s + r.amount, 0);
  const previousDuesCollection = rows.filter((r) => r.late).reduce((s, r) => s + r.amount, 0);
  const discounts = await sumDiscountForRows(rows);

  const studentIds = await resolveStudentIds(scope, { classId, sectionId });

  // "Today" / "this month" — always the real current PKT day/month, independent of the filter.
  const today = getBusinessDayRange();
  const monthStartCalendar = `${today.calendarDate.slice(0, 7)}-01`;
  const fixedFilter = { organizationId: tf.organizationId, branchId: tf.branchId, status: 'completed' };
  if (studentIds) fixedFilter.studentId = { $in: studentIds };

  const [todayAgg, monthAgg, refundAgg] = await Promise.all([
    FeePayment.aggregate([
      { $match: { ...fixedFilter, paymentDate: { $gte: today.start, $lte: today.end } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    FeePayment.aggregate([
      { $match: { ...fixedFilter, paymentDate: { $gte: parseBusinessDateBoundary(monthStartCalendar, false), $lte: today.end } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    FeePayment.aggregate([
      {
        $match: {
          organizationId: tf.organizationId,
          branchId: tf.branchId,
          status: 'cancelled',
          ...(studentIds ? { studentId: { $in: studentIds } } : {}),
          ...(startDate || endDate
            ? {
                cancelledAt: {
                  ...(startDate ? { $gte: parseBusinessDateBoundary(startDate, false) } : {}),
                  ...(endDate ? { $lte: parseBusinessDateBoundary(endDate, true) } : {}),
                },
              }
            : {}),
        },
      },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
  ]);

  const totalRefunds = refundAgg[0]?.total || 0;
  const totalOutstanding = await getOutstanding(scope, { classId, sectionId });

  return {
    totalCollectionToday: todayAgg[0]?.total || 0,
    totalCollectionThisMonth: monthAgg[0]?.total || 0,
    collectionInRange,
    currentMonthCollection,
    previousDuesCollection,
    totalOutstanding,
    totalDiscounts: discounts,
    totalRefunds,
    netCollection: collectionInRange - totalRefunds,
    transactionCount: receipts.length,
    studentsWhoPaid: new Set(receipts.map((r) => String(r.studentId?._id || r.studentId))).size,
  };
};

/** Section 3 — Monthly Collection Report: one row per fee month, current vs previous-dues split. */
const getMonthlyCollectionReport = async (scope, filters = {}) => {
  const receipts = await getReceipts(scope, { ...filters, status: 'completed' });
  const rows = flattenAllocations(receipts);

  const byPeriod = new Map();
  for (const r of rows) {
    const key = `${r.feeYear}-${r.feeMonth}`;
    if (!byPeriod.has(key)) {
      byPeriod.set(key, { month: r.feeMonth, year: r.feeYear, students: new Set(), voucherIds: new Set(), currentFee: 0, previousDues: 0 });
    }
    const bucket = byPeriod.get(key);
    bucket.students.add(r.studentId);
    bucket.voucherIds.add(r.voucherId);
    if (r.late) bucket.previousDues += r.amount;
    else bucket.currentFee += r.amount;
  }

  const periods = [...byPeriod.values()].sort((a, b) => periodIndex(a.month, a.year) - periodIndex(b.month, b.year));

  const result = [];
  for (const p of periods) {
    const vouchers = await FeeVoucher.find({ _id: { $in: [...p.voucherIds] } }).select('discount').lean();
    const discount = vouchers.reduce((s, v) => s + (v.discount || 0), 0);
    result.push({
      month: p.month,
      year: p.year,
      students: p.students.size,
      currentFee: p.currentFee,
      previousDues: p.previousDues,
      discount,
      totalCollected: p.currentFee + p.previousDues,
    });
  }

  const totals = result.reduce(
    (acc, r) => ({
      students: acc.students + r.students,
      currentFee: acc.currentFee + r.currentFee,
      previousDues: acc.previousDues + r.previousDues,
      discount: acc.discount + r.discount,
      totalCollected: acc.totalCollected + r.totalCollected,
    }),
    { students: 0, currentFee: 0, previousDues: 0, discount: 0, totalCollected: 0 },
  );

  return { rows: result, totals };
};

/**
 * Section 8 — Yearly Collection Report: one row per calendar month of
 * `year` (as the COLLECTION month, mirroring the Monthly Collection Report's
 * axis — there it's grouped by fee month, here by the month money arrived),
 * plus outstanding fee as of today for fee periods up to and including that
 * month. Outstanding is evaluated against current voucher state, not a
 * historical snapshot — there is no ledger of balances-over-time to replay.
 */
const getYearlyCollectionReport = async (scope, { year, classId, sectionId } = {}) => {
  const y = Number(year) || new Date().getFullYear();
  const startDate = `${y}-01-01`;
  const endDate = `${y}-12-31`;

  const receipts = await getReceipts(scope, { startDate, endDate, classId, sectionId, status: 'completed' });
  const rows = flattenAllocations(receipts);

  const byMonth = new Map();
  MONTH_ORDER.forEach((m) => byMonth.set(m, { month: m, year: y, currentMonthCollection: 0, previousDues: 0 }));
  for (const r of rows) {
    if (r.paymentYear !== y) continue; // safety guard; paymentDate range already restricts this
    const bucket = byMonth.get(r.paymentMonth);
    if (r.late) bucket.previousDues += r.amount;
    else bucket.currentMonthCollection += r.amount;
  }

  // Outstanding "as of end of this month" = billed-to-date minus paid-to-date, using
  // current voucher state, for every fee period up to and including that month.
  const tf = getTenantFilter(scope);
  const voucherFilter = { ...tf };
  if (classId) voucherFilter.classId = classId;
  if (sectionId) voucherFilter.sectionId = sectionId;
  const allVouchers = await FeeVoucher.find(voucherFilter)
    .select('month year netAmount feeItems discount fine paidAmount')
    .lean();

  const monthRows = MONTH_ORDER.map((m) => {
    const cutoff = periodIndex(m, y);
    const billed = allVouchers
      .filter((v) => periodIndex(v.month, v.year) <= cutoff)
      .reduce((s, v) => s + effectiveNet(v), 0);
    const paid = allVouchers
      .filter((v) => periodIndex(v.month, v.year) <= cutoff)
      .reduce((s, v) => s + (v.paidAmount || 0), 0);
    const bucket = byMonth.get(m);
    return {
      month: m,
      year: y,
      currentMonthCollection: bucket.currentMonthCollection,
      previousDues: bucket.previousDues,
      totalCollection: bucket.currentMonthCollection + bucket.previousDues,
      outstanding: Math.max(0, billed - paid),
    };
  });

  const totals = monthRows.reduce(
    (acc, r) => ({
      currentMonthCollection: acc.currentMonthCollection + r.currentMonthCollection,
      previousDues: acc.previousDues + r.previousDues,
      totalCollection: acc.totalCollection + r.totalCollection,
    }),
    { currentMonthCollection: 0, previousDues: 0, totalCollection: 0 },
  );
  const discounts = await sumDiscountForRows(rows);

  return { rows: monthRows, totals: { ...totals, discounts }, year: y };
};

/** Section 4 — Daily Collection Report: one row per calendar day, columns are whichever fee months actually appear. */
const getDailyCollectionReport = async (scope, filters = {}) => {
  const receipts = await getReceipts(scope, { ...filters, status: 'completed' });
  const rows = flattenAllocations(receipts);

  const periodsSeen = new Map(); // key -> {month, year}
  rows.forEach((r) => periodsSeen.set(`${r.feeYear}-${r.feeMonth}`, { month: r.feeMonth, year: r.feeYear }));
  const columns = [...periodsSeen.values()].sort((a, b) => periodIndex(a.month, a.year) - periodIndex(b.month, b.year));

  const byDay = new Map();
  for (const r of rows) {
    const day = toBusinessCalendarDate(new Date(r.paymentDate));
    if (!byDay.has(day)) {
      byDay.set(day, { date: day, receipts: new Set(), byPeriod: {}, total: 0 });
    }
    const bucket = byDay.get(day);
    bucket.receipts.add(r.paymentId);
    const key = `${r.feeYear}-${r.feeMonth}`;
    bucket.byPeriod[key] = (bucket.byPeriod[key] || 0) + r.amount;
    bucket.total += r.amount;
  }

  const days = [...byDay.values()]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((d) => ({
      date: d.date,
      receiptCount: d.receipts.size,
      byPeriod: columns.map((c) => d.byPeriod[`${c.year}-${c.month}`] || 0),
      total: d.total,
    }));

  const totals = {
    receiptCount: days.reduce((s, d) => s + d.receiptCount, 0),
    byPeriod: columns.map((_, i) => days.reduce((s, d) => s + d.byPeriod[i], 0)),
    total: days.reduce((s, d) => s + d.total, 0),
  };

  return { columns, days, totals };
};

/** Section 5 — Detailed Transaction Report: one row per fee-month allocation, paginated. */
const getTransactions = async (scope, filters = {}, options = {}) => {
  const receipts = await getReceipts(scope, { ...filters });
  const rows = flattenAllocations(receipts);
  const voucherIds = [...new Set(rows.map((r) => r.voucherId))];
  const vouchers = await FeeVoucher.find({ _id: { $in: voucherIds } }).select('discount').lean();
  const discountMap = new Map(vouchers.map((v) => [String(v._id), v.discount || 0]));

  rows.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));

  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const limit = Math.max(1, parseInt(options.limit, 10) || 25);
  const start = (page - 1) * limit;
  const pageRows = rows.slice(start, start + limit).map((r) => ({
    ...r,
    discount: discountMap.get(r.voucherId) || 0,
  }));

  return {
    results: pageRows,
    page,
    limit,
    totalResults: rows.length,
    totalPages: Math.max(1, Math.ceil(rows.length / limit)),
  };
};

/** Section 9 — Payment Method report: receipt-level (never double-counts a multi-month receipt). */
const getPaymentMethodReport = async (scope, filters = {}) => {
  const receipts = await getReceipts(scope, { ...filters, status: 'completed' });
  const byMethod = new Map();
  for (const r of receipts) {
    const key = r.paymentMethod || 'cash';
    if (!byMethod.has(key)) byMethod.set(key, { paymentMethod: key, transactions: 0, amount: 0 });
    const b = byMethod.get(key);
    b.transactions += 1;
    b.amount += r.totalAmount || 0;
  }
  return [...byMethod.values()].sort((a, b) => b.amount - a.amount);
};

/** Section 10 — Collection Staff report: receipt-level, grouped by who collected it. */
const getStaffCollectionReport = async (scope, filters = {}) => {
  const receipts = await getReceipts(scope, { ...filters, status: 'completed' });
  const byStaff = new Map();
  for (const r of receipts) {
    const id = r.collectedBy?._id ? String(r.collectedBy._id) : 'unknown';
    if (!byStaff.has(id)) {
      byStaff.set(id, { staffId: id, staffName: r.collectedBy?.name || 'Unassigned', transactions: 0, amount: 0 });
    }
    const b = byStaff.get(id);
    b.transactions += 1;
    b.amount += r.totalAmount || 0;
  }
  return [...byStaff.values()].sort((a, b) => b.amount - a.amount);
};

/**
 * Discount Report — one row per voucher that both (a) carries a discount and
 * (b) received at least one payment allocation within the filter range, i.e.
 * "discounts on fees collected in this period" — the same population the
 * Monthly Collection Report's Discount column sums, just itemized per student.
 */
const getDiscountReport = async (scope, filters = {}) => {
  const receipts = await getReceipts(scope, { ...filters, status: 'completed' });
  const rows = flattenAllocations(receipts);

  const voucherIds = [...new Set(rows.map((r) => r.voucherId))];
  if (!voucherIds.length) return { rows: [], totals: { originalAmount: 0, discount: 0, netAmount: 0 } };

  const vouchers = await FeeVoucher.find({ _id: { $in: voucherIds } })
    .select('studentId classId month year feeItems discount netAmount paidAmount voucherNumber')
    .populate('studentId', 'firstName lastName')
    .populate('classId', 'name')
    .lean();

  const receiptsByVoucher = new Map();
  for (const r of rows) {
    if (!receiptsByVoucher.has(r.voucherId)) receiptsByVoucher.set(r.voucherId, new Set());
    receiptsByVoucher.get(r.voucherId).add(r.receiptNumber);
  }

  const result = vouchers
    .filter((v) => (v.discount || 0) > 0)
    .map((v) => {
      const originalAmount = (v.feeItems || []).reduce((s, fi) => s + (fi.amount || 0), 0);
      return {
        voucherId: String(v._id),
        voucherNumber: v.voucherNumber,
        studentId: v.studentId?._id ? String(v.studentId._id) : '',
        studentName: `${v.studentId?.firstName || ''} ${v.studentId?.lastName || ''}`.trim(),
        className: v.classId?.name || '',
        feeMonth: v.month,
        feeYear: v.year,
        originalAmount,
        discount: v.discount || 0,
        netAmount: effectiveNet(v),
        receiptNumbers: [...(receiptsByVoucher.get(String(v._id)) || [])].join(', '),
      };
    })
    .sort((a, b) => periodIndex(a.feeYear, a.feeMonth) - periodIndex(b.feeYear, b.feeMonth));

  const totals = result.reduce(
    (acc, r) => ({
      originalAmount: acc.originalAmount + r.originalAmount,
      discount: acc.discount + r.discount,
      netAmount: acc.netAmount + r.netAmount,
    }),
    { originalAmount: 0, discount: 0, netAmount: 0 },
  );

  return { rows: result, totals };
};

/**
 * Refund Report — cancelled receipts, keyed by when they were CANCELLED
 * (not when they were originally collected), since that's the event a
 * "refund" report is answering "how much did we give back, and when".
 */
const getRefundReport = async (scope, filters = {}) => {
  const { startDate, endDate, classId, sectionId, studentId } = filters;
  const filter = { ...getTenantFilter(scope), status: 'cancelled' };
  if (startDate || endDate) {
    filter.cancelledAt = {};
    if (startDate) filter.cancelledAt.$gte = parseBusinessDateBoundary(startDate, false);
    if (endDate) filter.cancelledAt.$lte = parseBusinessDateBoundary(endDate, true);
  }
  const studentIds = await resolveStudentIds(scope, { studentId, classId, sectionId });
  if (studentIds) {
    if (!studentIds.length) return { rows: [], totals: { amount: 0 } };
    filter.studentId = { $in: studentIds };
  }

  const cancelled = await FeePayment.find(filter)
    .populate(STUDENT_POPULATE)
    .populate('collectedBy', 'name')
    .populate('cancelledBy', 'name')
    .sort({ cancelledAt: -1 })
    .lean();

  const rows = cancelled.map((r) => ({
    receiptNumber: r.receiptNumber,
    studentName: `${r.studentId?.firstName || ''} ${r.studentId?.lastName || ''}`.trim(),
    className: r.studentId?.classId?.name || '',
    amount: r.totalAmount,
    paymentDate: r.paymentDate,
    cancelledAt: r.cancelledAt,
    cancelledByName: r.cancelledBy?.name || '',
    reason: r.cancelReason || '',
  }));

  const totals = { amount: rows.reduce((s, r) => s + (r.amount || 0), 0) };
  return { rows, totals };
};

module.exports = {
  getReceipts,
  flattenAllocations,
  getDashboardSummary,
  getMonthlyCollectionReport,
  getYearlyCollectionReport,
  getDailyCollectionReport,
  getTransactions,
  getPaymentMethodReport,
  getStaffCollectionReport,
  getDiscountReport,
  getRefundReport,
  getOutstanding,
};
