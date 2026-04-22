const mongoose = require('mongoose');
const { FeeVoucher, SchoolTransaction, Student, Teacher, TeacherPayroll } = require('../models');

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

/** Convert a month name to its 0-based index (0 = January). Returns 0 on unknown. */
const monthIndex = (monthName) => {
  const idx = MONTH_NAMES.indexOf(monthName);
  return idx >= 0 ? idx : 0;
};

/** Build inclusive [start, end] Date range for a given month name + year */
const monthDateRange = (monthName, year) => {
  const idx = monthIndex(monthName);
  const numYear = Number(year);
  return {
    startDate: new Date(numYear, idx, 1),
    endDate: new Date(numYear, idx + 1, 0, 23, 59, 59, 999),
  };
};

const getTenantFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = scope.organizationId;
  if (scope.branchId) filter.branchId = scope.branchId;
  return filter;
};

/** Cast IDs to ObjectId for aggregate pipelines (aggregate does NOT auto-cast) */
const getAggregateFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = new mongoose.Types.ObjectId(scope.organizationId);
  if (scope.branchId) filter.branchId = new mongoose.Types.ObjectId(scope.branchId);
  return filter;
};

/**
 * Main accounting dashboard — current month overview
 */
const getAccountingDashboard = async (scope, month, year) => {
  const currentMonth = month || new Date().toLocaleString('default', { month: 'long' });
  const currentYear = year || new Date().getFullYear();
  const tenantFilter = getTenantFilter(scope);
  const aggFilter = getAggregateFilter(scope);

  const { startDate, endDate } = monthDateRange(currentMonth, currentYear);

  // Today's date range
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayEnd   = new Date(); todayEnd.setHours(23, 59, 59, 999);

  const [
    voucherStats,
    txnSummary,
    todayTxnSummary,
    recentTransactions,
    topPendingStudents,
    monthPayroll,
  ] = await Promise.all([
    // Voucher collection stats
    FeeVoucher.aggregate([
      { $match: { ...aggFilter, month: currentMonth, year: Number(currentYear) } },
      {
        // Compute effective net amount (mirrors JS effectiveNet()): use netAmount if > 0,
        // otherwise fall back to sum(feeItems.amount) - discount.
        $addFields: {
          effectiveNet: {
            $cond: {
              if: { $gt: ['$netAmount', 0] },
              then: '$netAmount',
              else: {
                $subtract: [
                  { $reduce: { input: { $ifNull: ['$feeItems', []] }, initialValue: 0, in: { $add: ['$$value', { $ifNull: ['$$this.amount', 0] }] } } },
                  { $ifNull: ['$discount', 0] },
                ],
              },
            },
          },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amount: { $sum: '$effectiveNet' },
          collected: { $sum: '$paidAmount' },
        },
      },
    ]),

    // Transaction income vs expense this month
    SchoolTransaction.aggregate([
      { $match: { ...aggFilter, date: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),

    // Today's income vs expense
    SchoolTransaction.aggregate([
      { $match: { ...aggFilter, date: { $gte: todayStart, $lte: todayEnd } } },
      { $group: { _id: '$type', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),

    // Last 10 transactions for this month
    SchoolTransaction.find({ ...tenantFilter, date: { $gte: startDate, $lte: endDate } })
      .sort({ date: -1 })
      .limit(10)
      .populate('categoryId', 'name type')
      .lean(),

    // Top 5 students with highest pending fees (all-time)
    FeeVoucher.aggregate([
      {
        $match: {
          ...aggFilter,
          status: { $in: ['unpaid', 'partial', 'overdue'] },
        },
      },
      {
        // Compute effectiveNet so stale vouchers (netAmount=0 in DB) are included
        $addFields: {
          effectiveNet: {
            $cond: {
              if: { $gt: ['$netAmount', 0] },
              then: '$netAmount',
              else: {
                $subtract: [
                  { $reduce: { input: { $ifNull: ['$feeItems', []] }, initialValue: 0, in: { $add: ['$$value', { $ifNull: ['$$this.amount', 0] }] } } },
                  { $ifNull: ['$discount', 0] },
                ],
              },
            },
          },
        },
      },
      {
        $group: {
          _id: '$studentId',
          totalPending: { $sum: { $subtract: ['$effectiveNet', { $ifNull: ['$paidAmount', 0] }] } },
          voucherCount: { $sum: 1 },
        },
      },
      { $match: { totalPending: { $gt: 0 } } },
      { $sort: { totalPending: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'students',
          localField: '_id',
          foreignField: '_id',
          as: 'student',
        },
      },
      { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          totalPending: 1,
          voucherCount: 1,
          studentName: {
            $concat: [
              { $ifNull: ['$student.firstName', ''] },
              ' ',
              { $ifNull: ['$student.lastName', ''] },
            ],
          },
          admissionNumber: '$student.admissionNumber',
        },
      },
    ]),

    // Paid teacher payroll for current month — salary expense
    TeacherPayroll.aggregate([
      { $match: { ...aggFilter, month: MONTH_NAMES.indexOf(currentMonth) + 1, year: Number(currentYear), status: 'paid' } },
      { $group: { _id: null, salaryPaid: { $sum: '$netSalary' }, count: { $sum: 1 } } },
    ]),
  ]);

  // Reshape voucher stats
  const voucherMap = {};
  let totalExpected = 0;
  let totalCollected = 0;
  voucherStats.forEach((s) => {
    voucherMap[s._id] = { count: s.count, amount: s.amount, collected: s.collected };
    totalExpected += s.amount || 0;
    totalCollected += s.collected || 0;
  });

  const monthlySalaryExpense = monthPayroll[0]?.salaryPaid || 0;
  let income = 0, txnExpense = 0, incomeCount = 0, expenseCount = 0;
  txnSummary.forEach((t) => {
    if (t._id === 'INCOME') { income = t.total; incomeCount = t.count; }
    if (t._id === 'EXPENSE') { txnExpense = t.total; expenseCount = t.count; }
  });

  const expense = txnExpense + monthlySalaryExpense;

  let todayIncome = 0, todayExpense = 0;
  todayTxnSummary.forEach((t) => {
    if (t._id === 'INCOME') todayIncome = t.total;
    if (t._id === 'EXPENSE') todayExpense = t.total;
  });

  return {
    month: currentMonth,
    year: currentYear,
    feeCollection: {
      totalExpected,
      totalCollected,
      totalPending: totalExpected - totalCollected,
      collectionRate: totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0,
      paid: voucherMap.paid?.count || 0,
      unpaid: voucherMap.unpaid?.count || 0,
      partial: voucherMap.partial?.count || 0,
      overdue: voucherMap.overdue?.count || 0,
      totalVouchers: Object.values(voucherMap).reduce((s, v) => s + v.count, 0),
    },
    transactions: {
      income,
      expense,
      salaryExpense: monthlySalaryExpense,
      profit: income - expense,
      incomeCount,
      expenseCount,
      todayIncome,
      todayExpense,
    },
    recentTransactions,
    topPendingStudents,
  };
};

/**
 * Monthly P&L report
 */
const getMonthlyReport = async (scope, year) => {
  const aggFilter = getAggregateFilter(scope);
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31, 23, 59, 59);

  const monthNames = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];

  const [txnTrend, voucherTrend, payrollTrend] = await Promise.all([
    SchoolTransaction.aggregate([
      { $match: { ...aggFilter, date: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { month: { $month: '$date' }, type: '$type' },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.month': 1 } },
    ]),

    FeeVoucher.aggregate([
      { $match: { ...aggFilter, year: Number(year) } },
      {
        $group: {
          _id: '$month',
          expected: { $sum: '$netAmount' },
          collected: { $sum: '$paidAmount' },
          count: { $sum: 1 },
        },
      },
    ]),

    // Paid teacher payroll per month — salary expense
    TeacherPayroll.aggregate([
      { $match: { ...aggFilter, year: Number(year), status: 'paid' } },
      {
        $group: {
          _id: '$month',
          salaryPaid: { $sum: '$netSalary' },
        },
      },
    ]),
  ]);

  // Build a 12-month structure
  const months = monthNames.map((name, idx) => {
    const monthNum = idx + 1;
    let income = 0;
    let txnExpense = 0;
    txnTrend.forEach((t) => {
      if (t._id.month === monthNum) {
        if (t._id.type === 'INCOME') income = t.total;
        if (t._id.type === 'EXPENSE') txnExpense = t.total;
      }
    });

    const voucherData = voucherTrend.find((v) => v._id === name) || {};
    const payrollRow = payrollTrend.find((p) => p._id === monthNum) || {};
    const salaryExpense = payrollRow.salaryPaid || 0;
    const expense = txnExpense + salaryExpense;

    return {
      month: name,
      income,
      expense,
      salaryExpense,
      profit: income - expense,
      feeExpected: voucherData.expected || 0,
      feeCollected: voucherData.collected || 0,
      voucherCount: voucherData.count || 0,
    };
  });

  const totals = months.reduce(
    (acc, m) => ({
      income: acc.income + m.income,
      expense: acc.expense + m.expense,
      profit: acc.profit + m.profit,
      feeExpected: acc.feeExpected + m.feeExpected,
      feeCollected: acc.feeCollected + m.feeCollected,
    }),
    { income: 0, expense: 0, profit: 0, feeExpected: 0, feeCollected: 0 }
  );

  return { year, months, totals };
};

/**
 * Student-wise fee payment history
 */
const getStudentFeeReport = async (scope, studentId, year) => {
  const filter = { ...getTenantFilter(scope), studentId };
  if (year) filter.year = year;

  const vouchers = await FeeVoucher.find(filter)
    .populate('classId', 'name')
    .sort({ year: -1, month: 1 })
    .lean();

  const totalExpected = vouchers.reduce((s, v) => s + (v.netAmount || 0), 0);
  const totalPaid = vouchers.reduce((s, v) => s + (v.paidAmount || 0), 0);

  return {
    totalExpected,
    totalPaid,
    totalPending: totalExpected - totalPaid,
    vouchers,
  };
};

/**
 * Category-wise expense/income report
 */
const getCategoryReport = async (scope, startDate, endDate) => {
  const aggFilter = getAggregateFilter(scope);

  return SchoolTransaction.aggregate([
    {
      $match: {
        ...aggFilter,
        date: { $gte: new Date(startDate), $lte: new Date(endDate) },
      },
    },
    {
      $group: {
        _id: { categoryId: '$categoryId', type: '$type' },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    {
      $lookup: {
        from: 'feecategories',
        localField: '_id.categoryId',
        foreignField: '_id',
        as: 'category',
      },
    },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 0,
        categoryId: '$_id.categoryId',
        type: '$_id.type',
        categoryName: { $ifNull: ['$category.name', 'Unknown'] },
        total: 1,
        count: 1,
      },
    },
    { $sort: { type: 1, total: -1 } },
  ]);
};

/**
 * Teacher salary report
 */
const getTeacherSalaryReport = async (scope, year, month) => {
  const aggFilter = getAggregateFilter(scope);
  const filter = {
    ...aggFilter,
    referenceModel: 'Teacher',
    type: 'EXPENSE',
  };

  if (year || month) {
    const { startDate: start, endDate: end } = month
      ? monthDateRange(month, year || new Date().getFullYear())
      : { startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31, 23, 59, 59, 999) };
    filter.date = { $gte: start, $lte: end };
  }

  return SchoolTransaction.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$referenceId',
        totalPaid: { $sum: '$amount' },
        payments: { $sum: 1 },
        lastPayment: { $max: '$date' },
      },
    },
    {
      $lookup: {
        from: 'teachers',
        localField: '_id',
        foreignField: '_id',
        as: 'teacher',
      },
    },
    { $unwind: { path: '$teacher', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        _id: 1,
        totalPaid: 1,
        payments: 1,
        lastPayment: 1,
        teacherName: {
          $concat: [
            { $ifNull: ['$teacher.firstName', ''] },
            ' ',
            { $ifNull: ['$teacher.lastName', ''] },
          ],
        },
        employeeId: '$teacher.employeeId',
      },
    },
    { $sort: { teacherName: 1 } },
  ]);
};

module.exports = {
  getAccountingDashboard,
  getMonthlyReport,
  getStudentFeeReport,
  getCategoryReport,
  getTeacherSalaryReport,
};
