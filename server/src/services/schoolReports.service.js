const mongoose = require('mongoose');
const {
  FeeVoucher,
  SchoolTransaction,
  Student,
  Teacher,
  SchoolClass,
  Section,
  SchoolAttendance,
  Timetable,
  TeacherPayroll,
  FeeCategory,
} = require('../models');

// ── Tenant helpers ───────────────────────────────────────────────────────────
const getTenantFilter = (scope = {}) => {
  const f = {};
  if (scope.organizationId) f.organizationId = scope.organizationId;
  if (scope.branchId) f.branchId = scope.branchId;
  return f;
};

const aggFilter = (scope = {}) => {
  const f = {};
  if (scope.organizationId) f.organizationId = new mongoose.Types.ObjectId(scope.organizationId);
  if (scope.branchId) f.branchId = new mongoose.Types.ObjectId(scope.branchId);
  return f;
};

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

// ═════════════════════════════════════════════════════════════════════════════
// UNIFIED REPORT DISPATCHER
// ═════════════════════════════════════════════════════════════════════════════

const getReport = async (scope, { type, period, year, month, classId, teacherId, startDate, endDate, status }) => {
  const y = Number(year) || new Date().getFullYear();
  const m = month || MONTH_NAMES[new Date().getMonth()];

  switch (type) {
    // ─── Financial ───────────────────────────────────────────────────
    case 'financial-monthly':
      return getMonthlyIncomeExpense(scope, y);
    case 'financial-daily':
      return getDailyCollection(scope, y, m);
    case 'financial-category':
      return getCategoryWiseReport(scope, startDate, endDate);
    case 'financial-pnl':
      return getProfitAndLoss(scope, y);

    // ─── Student ─────────────────────────────────────────────────────
    case 'student-list':
      return getStudentListByClass(scope, classId);
    case 'student-fee-status':
      return getStudentFeeStatus(scope, y, m, classId);
    case 'student-attendance':
      return getStudentAttendanceSummary(scope, y, m, classId);

    // ─── Teacher ─────────────────────────────────────────────────────
    case 'teacher-salary':
      return getTeacherSalaryReport(scope, y);
    case 'teacher-workload':
      return getTeacherWorkload(scope);

    // ─── Voucher ─────────────────────────────────────────────────────
    case 'voucher-paid':
      return getVouchersByStatus(scope, 'paid', y, m, classId);
    case 'voucher-pending':
      return getVouchersByStatus(scope, 'unpaid', y, m, classId);
    case 'voucher-overdue':
      return getVouchersByStatus(scope, 'overdue', y, m, classId);
    case 'voucher-all':
      return getVouchersByStatus(scope, status || null, y, m, classId);

    // ─── Analytics (chart data) ──────────────────────────────────────
    case 'analytics':
      return getAnalytics(scope, y);

    default:
      return { summary: {}, data: [], chartData: [] };
  }
};

// ═════════════════════════════════════════════════════════════════════════════
// FINANCIAL REPORTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * 1. Monthly Income / Expense for full year
 */
const getMonthlyIncomeExpense = async (scope, year) => {
  const af = aggFilter(scope);
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59);

  // Get non-fee SchoolTransaction income (exclude fee payments — those come from FeeVoucher)
  // and all expenses
  const [txnPipeline, feePipeline, payrollPipeline] = await Promise.all([
    SchoolTransaction.aggregate([
      {
        $match: {
          ...af,
          date: { $gte: start, $lte: end },
          // Exclude fee-payment transactions to avoid double-counting with FeeVoucher data
          referenceModel: { $ne: 'FeeVoucher' },
        },
      },
      {
        $group: {
          _id: { month: { $month: '$date' }, type: '$type' },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.month': 1 } },
    ]),
    // Fee collection per month — the authoritative source for fee income
    FeeVoucher.aggregate([
      { $match: { ...af, year: Number(year), paidAmount: { $gt: 0 } } },
      {
        $group: {
          _id: '$month',
          feeCollected: { $sum: '$paidAmount' },
          count: { $sum: 1 },
        },
      },
    ]),
    // Paid teacher payroll per month — counted as salary expense
    TeacherPayroll.aggregate([
      { $match: { ...af, year: Number(year), status: 'paid' } },
      {
        $group: {
          _id: '$month',
          salaryPaid: { $sum: '$netSalary' },
        },
      },
    ]),
  ]);

  const months = MONTH_NAMES.map((name, idx) => {
    const monthNum = idx + 1;
    let otherIncome = 0, txnExpense = 0, incomeCount = 0, expenseCount = 0;
    txnPipeline.forEach((r) => {
      if (r._id.month === monthNum) {
        if (r._id.type === 'INCOME') { otherIncome = r.total; incomeCount = r.count; }
        if (r._id.type === 'EXPENSE') { txnExpense = r.total; expenseCount = r.count; }
      }
    });
    const feeRow = feePipeline.find((r) => r._id === name) || {};
    const payrollRow = payrollPipeline.find((r) => r._id === monthNum) || {};
    const feeCollected = feeRow.feeCollected || 0;
    const salaryExpense = payrollRow.salaryPaid || 0;
    const income = otherIncome + feeCollected;
    const expense = txnExpense + salaryExpense;
    return { month: name, income, feeCollected, otherIncome, expense, salaryExpense, profit: income - expense, incomeCount: incomeCount + (feeRow.count || 0), expenseCount };
  });

  const totals = months.reduce((a, m) => ({
    income: a.income + m.income,
    expense: a.expense + m.expense,
    profit: a.profit + m.profit,
  }), { income: 0, expense: 0, profit: 0 });

  return {
    summary: { year, ...totals, activeMonths: months.filter((m) => m.income > 0 || m.expense > 0).length },
    data: months,
    chartData: months.map((m) => ({ name: m.month.slice(0, 3), income: m.income, expense: m.expense, profit: m.profit })),
  };
};

/**
 * 2. Daily Collection for a given month
 */
const getDailyCollection = async (scope, year, month) => {
  const af = aggFilter(scope);
  const monthIdx = MONTH_NAMES.indexOf(month);
  if (monthIdx < 0) return { summary: {}, data: [], chartData: [] };
  const start = new Date(year, monthIdx, 1);
  const end = new Date(year, monthIdx + 1, 0, 23, 59, 59);

  // Non-fee income transactions per day
  const [txnPipeline, feeVoucherPipeline] = await Promise.all([
    SchoolTransaction.aggregate([
      { $match: { ...af, date: { $gte: start, $lte: end }, type: 'INCOME', referenceModel: { $ne: 'FeeVoucher' } } },
      {
        $group: {
          _id: { $dayOfMonth: '$date' },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    // Fee vouchers paid in this month (grouped by paidDate day)
    FeeVoucher.aggregate([
      {
        $match: {
          ...af,
          paidAmount: { $gt: 0 },
          paidDate: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: { $dayOfMonth: '$paidDate' },
          total: { $sum: '$paidAmount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const days = [];
  let grandTotal = 0;
  const activeDaySet = new Set();
  for (let d = 1; d <= daysInMonth; d++) {
    const txnRow = txnPipeline.find((r) => r._id === d);
    const feeRow = feeVoucherPipeline.find((r) => r._id === d);
    const amount = (txnRow?.total || 0) + (feeRow?.total || 0);
    const transactions = (txnRow?.count || 0) + (feeRow?.count || 0);
    grandTotal += amount;
    if (amount > 0) activeDaySet.add(d);
    days.push({ day: d, date: `${year}-${String(monthIdx + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, amount, transactions });
  }

  return {
    summary: { year, month, totalCollected: grandTotal, totalDays: daysInMonth, activeDays: activeDaySet.size },
    data: days,
    chartData: days.map((d) => ({ name: `${d.day}`, amount: d.amount })),
  };
};

/**
 * 3. Category-wise report
 */
const getCategoryWiseReport = async (scope, startDate, endDate) => {
  const af = aggFilter(scope);
  const now = new Date();
  const sd = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
  const ed = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  // Run both queries in parallel:
  // (a) All SchoolTransaction records in range (expense + non-fee income that was manually entered)
  // (b) FeeVoucher payments in range that have NO linked SchoolTransaction (= seeded / legacy data)
  const [txnPipeline, orphanFeeVouchers] = await Promise.all([
    SchoolTransaction.aggregate([
      { $match: { ...af, date: { $gte: sd, $lte: ed } } },
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
          name: { $ifNull: ['$category.name', 'Unknown'] },
          total: 1,
          count: 1,
        },
      },
      { $sort: { type: 1, total: -1 } },
    ]),
    // Fee vouchers paid in this period that lack a SchoolTransaction record
    FeeVoucher.aggregate([
      {
        $match: {
          ...af,
          paidAmount: { $gt: 0 },
          paidDate: { $gte: sd, $lte: ed },
          transactionId: { $in: [null, undefined] },
          $or: [{ transactionId: { $exists: false } }, { transactionId: null }],
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$paidAmount' },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  // Merge orphan fee-voucher income into "Tuition Fee" income category
  const orphanTotal = orphanFeeVouchers[0]?.total || 0;
  const orphanCount = orphanFeeVouchers[0]?.count || 0;

  const income = txnPipeline.filter((r) => r.type === 'INCOME');
  const expense = txnPipeline.filter((r) => r.type === 'EXPENSE');

  if (orphanTotal > 0) {
    // Either add to an existing Tuition Fee entry or create one
    const tfEntry = income.find((r) => r.name === 'Tuition Fee');
    if (tfEntry) {
      tfEntry.total += orphanTotal;
      tfEntry.count += orphanCount;
    } else {
      income.push({ categoryId: null, type: 'INCOME', name: 'Tuition Fee', total: orphanTotal, count: orphanCount });
    }
    // Sort by total desc
    income.sort((a, b) => b.total - a.total);
  }

  const totalIncome = income.reduce((s, r) => s + r.total, 0);
  const totalExpense = expense.reduce((s, r) => s + r.total, 0);

  return {
    summary: { totalIncome, totalExpense, profit: totalIncome - totalExpense },
    data: { income, expense },
    chartData: [
      ...income.map((r) => ({ name: r.name, value: r.total, type: 'INCOME' })),
      ...expense.map((r) => ({ name: r.name, value: r.total, type: 'EXPENSE' })),
    ],
  };
};

/**
 * 4. Profit & Loss full year overview
 */
const getProfitAndLoss = async (scope, year) => {
  const result = await getMonthlyIncomeExpense(scope, year);
  // Enrich with fee collection data
  const af = aggFilter(scope);
  const voucherTrend = await FeeVoucher.aggregate([
    { $match: { ...af, year: Number(year) } },
    {
      $addFields: {
        // Use effectiveNet equivalent in aggregation:
        // if netAmount > 0 use it, otherwise sum feeItems and subtract discount
        effectiveNetAmount: {
          $cond: {
            if: { $gt: ['$netAmount', 0] },
            then: '$netAmount',
            else: {
              $max: [
                0,
                {
                  $subtract: [
                    {
                      $add: [
                        { $ifNull: [{ $sum: '$feeItems.amount' }, 0] },
                        { $ifNull: ['$fine', 0] },
                      ],
                    },
                    { $ifNull: ['$discount', 0] },
                  ],
                },
              ],
            },
          },
        },
      },
    },
    {
      $group: {
        _id: '$month',
        expected: { $sum: '$effectiveNetAmount' },
        collected: { $sum: '$paidAmount' },
        count: { $sum: 1 },
      },
    },
  ]);

  const data = result.data.map((m) => {
    const vd = voucherTrend.find((v) => v._id === m.month) || {};
    const feeExpected = vd.expected || 0;
    const feeCollected = vd.collected || 0;
    return {
      ...m,
      feeExpected,
      feeCollected,
      feePending: Math.max(0, feeExpected - feeCollected),
      voucherCount: vd.count || 0,
    };
  });

  const feeTotals = data.reduce((a, m) => ({
    feeExpected: a.feeExpected + m.feeExpected,
    feeCollected: a.feeCollected + m.feeCollected,
    feePending: a.feePending + m.feePending,
  }), { feeExpected: 0, feeCollected: 0, feePending: 0 });

  return {
    summary: { year, ...result.summary, ...feeTotals },
    data,
    chartData: data.map((m) => ({
      name: m.month.slice(0, 3),
      income: m.income,
      expense: m.expense,
      profit: m.profit,
      feeExpected: m.feeExpected,
      feeCollected: m.feeCollected,
    })),
  };
};

// ═════════════════════════════════════════════════════════════════════════════
// STUDENT REPORTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Student list by class
 */
const getStudentListByClass = async (scope, classId) => {
  const filter = { ...getTenantFilter(scope), status: 'active' };
  if (classId) filter.classId = classId;

  const students = await Student.find(filter)
    .populate('classId', 'name')
    .populate('sectionId', 'name')
    .select('firstName lastName admissionNumber rollNumber gender parent classId sectionId dateOfBirth creditBalance')
    .sort({ classId: 1, rollNumber: 1 })
    .lean();

  // Group by class
  const classMap = {};
  students.forEach((s) => {
    const cName = s.classId?.name || 'Unassigned';
    if (!classMap[cName]) classMap[cName] = [];
    classMap[cName].push({
      id: s._id,
      name: `${s.firstName} ${s.lastName || ''}`.trim(),
      admissionNumber: s.admissionNumber,
      rollNumber: s.rollNumber,
      gender: s.gender,
      fatherName: s.parent?.fatherName || '',
      phone: s.parent?.phone || '',
      className: cName,
      section: s.sectionId?.name || '',
    });
  });

  const data = Object.entries(classMap).map(([className, studs]) => ({ className, students: studs, count: studs.length }));

  return {
    summary: { totalStudents: students.length, totalClasses: data.length },
    data,
    chartData: data.map((d) => ({ name: d.className, value: d.count })),
  };
};

/**
 * Fee status by class for a given month/year
 */
const getStudentFeeStatus = async (scope, year, month, classId) => {
  const af = aggFilter(scope);
  const match = { ...af, year: Number(year), month };
  if (classId) match.classId = new mongoose.Types.ObjectId(classId);

  const pipeline = await FeeVoucher.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'students',
        localField: 'studentId',
        foreignField: '_id',
        as: 'student',
      },
    },
    { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'schoolclasses',
        localField: 'classId',
        foreignField: '_id',
        as: 'class',
      },
    },
    { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        studentId: 1,
        name: { $concat: [{ $ifNull: ['$student.firstName', ''] }, ' ', { $ifNull: ['$student.lastName', ''] }] },
        admissionNumber: '$student.admissionNumber',
        rollNumber: '$student.rollNumber',
        className: '$class.name',
        fatherName: '$student.parent.fatherName',
        phone: '$student.parent.phone',
        netAmount: 1,
        paidAmount: 1,
        status: 1,
        pending: { $subtract: ['$netAmount', '$paidAmount'] },
        dueDate: 1,
        paidDate: 1,
      },
    },
    { $sort: { className: 1, rollNumber: 1 } },
  ]);

  const paid = pipeline.filter((v) => v.status === 'paid');
  const unpaid = pipeline.filter((v) => v.status === 'unpaid' || v.status === 'overdue');
  const partial = pipeline.filter((v) => v.status === 'partial');
  const totalExpected = pipeline.reduce((s, v) => s + (v.netAmount || 0), 0);
  const totalCollected = pipeline.reduce((s, v) => s + (v.paidAmount || 0), 0);

  return {
    summary: {
      month, year, totalStudents: pipeline.length,
      paid: paid.length, unpaid: unpaid.length, partial: partial.length,
      totalExpected, totalCollected, totalPending: totalExpected - totalCollected,
      collectionRate: totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0,
    },
    data: pipeline,
    chartData: [
      { name: 'Paid', value: paid.length, color: '#10b981' },
      { name: 'Unpaid', value: unpaid.length, color: '#ef4444' },
      { name: 'Partial', value: partial.length, color: '#f59e0b' },
    ],
  };
};

/**
 * Student attendance summary for a month
 */
const getStudentAttendanceSummary = async (scope, year, month, classId) => {
  const af = aggFilter(scope);
  const monthIdx = MONTH_NAMES.indexOf(month);
  if (monthIdx < 0) return { summary: {}, data: [], chartData: [] };

  const start = new Date(year, monthIdx, 1);
  const end = new Date(year, monthIdx + 1, 0, 23, 59, 59);
  const match = { ...af, date: { $gte: start, $lte: end } };
  if (classId) match.classId = new mongoose.Types.ObjectId(classId);

  const pipeline = await SchoolAttendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: { studentId: '$studentId', status: '$status' },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.studentId',
        statuses: { $push: { status: '$_id.status', count: '$count' } },
        totalDays: { $sum: '$count' },
      },
    },
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
      $lookup: {
        from: 'schoolclasses',
        localField: 'student.classId',
        foreignField: '_id',
        as: 'class',
      },
    },
    { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        studentId: '$_id',
        name: { $concat: [{ $ifNull: ['$student.firstName', ''] }, ' ', { $ifNull: ['$student.lastName', ''] }] },
        admissionNumber: '$student.admissionNumber',
        rollNumber: '$student.rollNumber',
        className: '$class.name',
        statuses: 1,
        totalDays: 1,
      },
    },
    { $sort: { className: 1, name: 1 } },
  ]);

  // Reshape
  const data = pipeline.map((row) => {
    const statusMap = {};
    (row.statuses || []).forEach((s) => { statusMap[s.status] = s.count; });
    return {
      studentId: row.studentId,
      name: row.name,
      admissionNumber: row.admissionNumber,
      rollNumber: row.rollNumber,
      className: row.className,
      totalDays: row.totalDays,
      present: statusMap.present || 0,
      absent: statusMap.absent || 0,
      late: statusMap.late || 0,
      leave: statusMap.leave || 0,
      halfDay: statusMap.half_day || 0,
      attendanceRate: row.totalDays > 0 ? Math.round(((statusMap.present || 0) / row.totalDays) * 100) : 0,
    };
  });

  const totalPresent = data.reduce((s, d) => s + d.present, 0);
  const totalAbsent = data.reduce((s, d) => s + d.absent, 0);
  const totalLate = data.reduce((s, d) => s + d.late, 0);
  const totalLeave = data.reduce((s, d) => s + d.leave, 0);

  return {
    summary: { month, year, totalStudents: data.length, totalPresent, totalAbsent, totalLate, totalLeave },
    data,
    chartData: [
      { name: 'Present', value: totalPresent, color: '#10b981' },
      { name: 'Absent', value: totalAbsent, color: '#ef4444' },
      { name: 'Late', value: totalLate, color: '#f59e0b' },
      { name: 'Leave', value: totalLeave, color: '#6366f1' },
    ],
  };
};

// ═════════════════════════════════════════════════════════════════════════════
// TEACHER REPORTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Teacher salary report — full year with monthly breakdown
 */
const getTeacherSalaryReport = async (scope, year) => {
  const af = aggFilter(scope);

  // Use TeacherPayroll if available, fallback to SchoolTransaction
  const payrollData = await TeacherPayroll.aggregate([
    { $match: { ...af, year: Number(year) } },
    {
      $group: {
        _id: { teacherId: '$teacherId', month: '$month' },
        netSalary: { $sum: '$netSalary' },
        basicSalary: { $sum: '$basicSalary' },
        status: { $first: '$status' },
      },
    },
    {
      $group: {
        _id: '$_id.teacherId',
        months: { $push: { month: '$_id.month', netSalary: '$netSalary', status: '$status' } },
        // Only count records that are actually paid
        totalPaid: { $sum: { $cond: [{ $eq: ['$status', 'paid'] }, '$netSalary', 0] } },
        totalPending: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, '$netSalary', 0] } },
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
        teacherId: '$_id',
        name: { $concat: [{ $ifNull: ['$teacher.firstName', ''] }, ' ', { $ifNull: ['$teacher.lastName', ''] }] },
        employeeId: '$teacher.employeeId',
        designation: '$teacher.specialization',
        basicSalary: '$teacher.salary.basicSalary',
        months: 1,
        totalPaid: 1,
        totalPending: 1,
      },
    },
    { $sort: { name: 1 } },
  ]);

  // Build monthly map for each teacher (amount + status per month)
  const data = payrollData.map((t) => {
    const monthMap = {};
    const monthStatus = {};
    (t.months || []).forEach((m) => {
      monthMap[m.month] = m.netSalary;
      monthStatus[m.month] = m.status;
    });
    return {
      teacherId: t.teacherId,
      name: t.name,
      employeeId: t.employeeId,
      designation: t.designation || '',
      basicSalary: t.basicSalary || 0,
      totalPaid: t.totalPaid || 0,
      totalPending: t.totalPending || 0,
      months: monthMap,
      monthStatuses: monthStatus,
    };
  });

  const grandTotalPaid = data.reduce((s, t) => s + t.totalPaid, 0);
  const grandTotalPending = data.reduce((s, t) => s + t.totalPending, 0);

  return {
    summary: {
      year,
      totalTeachers: data.length,
      totalSalaryPaid: grandTotalPaid,
      totalPending: grandTotalPending,
      totalPayable: grandTotalPaid + grandTotalPending,
    },
    data,
    chartData: MONTH_NAMES.map((name, idx) => {
      const monthNum = idx + 1;
      let paid = 0, pending = 0;
      data.forEach((t) => {
        if (t.monthStatuses[monthNum] === 'paid') paid += t.months[monthNum] || 0;
        else pending += t.months[monthNum] || 0;
      });
      return { name: name.slice(0, 3), paid, pending };
    }),
  };
};

/**
 * Teacher workload report — periods per teacher from timetable
 */
const getTeacherWorkload = async (scope) => {
  const af = aggFilter(scope);

  const pipeline = await Timetable.aggregate([
    { $match: { ...af, isActive: true } },
    { $unwind: '$periods' },
    { $match: { 'periods.teacherId': { $exists: true, $ne: null } } },
    {
      $group: {
        _id: '$periods.teacherId',
        totalPeriods: { $sum: 1 },
        days: { $addToSet: '$day' },
        classes: { $addToSet: '$classId' },
        subjects: { $addToSet: '$periods.subjectId' },
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
        teacherId: '$_id',
        name: { $concat: [{ $ifNull: ['$teacher.firstName', ''] }, ' ', { $ifNull: ['$teacher.lastName', ''] }] },
        employeeId: '$teacher.employeeId',
        designation: '$teacher.specialization',
        totalPeriods: 1,
        totalDays: { $size: '$days' },
        totalClasses: { $size: '$classes' },
        totalSubjects: { $size: '$subjects' },
      },
    },
    { $sort: { totalPeriods: -1 } },
  ]);

  return {
    summary: { totalTeachers: pipeline.length },
    data: pipeline,
    chartData: pipeline.map((t) => ({ name: t.name?.split(' ')[0] || '', periods: t.totalPeriods, classes: t.totalClasses })),
  };
};

// ═════════════════════════════════════════════════════════════════════════════
// VOUCHER REPORTS
// ═════════════════════════════════════════════════════════════════════════════

const getVouchersByStatus = async (scope, status, year, month, classId) => {
  const af = aggFilter(scope);
  const match = { ...af, year: Number(year), month };
  if (status) match.status = status === 'pending' ? { $in: ['unpaid', 'partial'] } : status;
  if (classId) match.classId = new mongoose.Types.ObjectId(classId);

  const pipeline = await FeeVoucher.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'students',
        localField: 'studentId',
        foreignField: '_id',
        as: 'student',
      },
    },
    { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'schoolclasses',
        localField: 'classId',
        foreignField: '_id',
        as: 'class',
      },
    },
    { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        voucherNumber: 1,
        studentId: 1,
        name: { $concat: [{ $ifNull: ['$student.firstName', ''] }, ' ', { $ifNull: ['$student.lastName', ''] }] },
        admissionNumber: '$student.admissionNumber',
        rollNumber: '$student.rollNumber',
        fatherName: '$student.parent.fatherName',
        phone: '$student.parent.phone',
        className: '$class.name',
        month: 1,
        year: 1,
        netAmount: 1,
        paidAmount: 1,
        pending: { $subtract: ['$netAmount', '$paidAmount'] },
        status: 1,
        dueDate: 1,
        paidDate: 1,
        paymentMethod: 1,
      },
    },
    { $sort: { className: 1, name: 1 } },
  ]);

  const totalNet = pipeline.reduce((s, v) => s + (v.netAmount || 0), 0);
  const totalPaid = pipeline.reduce((s, v) => s + (v.paidAmount || 0), 0);

  // Status distribution for chart
  const statusCounts = {};
  pipeline.forEach((v) => { statusCounts[v.status] = (statusCounts[v.status] || 0) + 1; });

  return {
    summary: {
      month, year, totalVouchers: pipeline.length,
      totalAmount: totalNet, totalPaid, totalPending: totalNet - totalPaid,
    },
    data: pipeline,
    chartData: Object.entries(statusCounts).map(([name, value]) => ({ name, value })),
  };
};

// ═════════════════════════════════════════════════════════════════════════════
// ANALYTICS — chart-ready data
// ═════════════════════════════════════════════════════════════════════════════

const getAnalytics = async (scope, year) => {
  const af = aggFilter(scope);
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31, 23, 59, 59);

  const [txnTrend, feeTrend, expenseBreakdown, payrollTrend] = await Promise.all([
    // Non-fee SchoolTransaction income/expense per month
    SchoolTransaction.aggregate([
      { $match: { ...af, date: { $gte: start, $lte: end }, referenceModel: { $ne: 'FeeVoucher' } } },
      {
        $group: {
          _id: { month: { $month: '$date' }, type: '$type' },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { '_id.month': 1 } },
    ]),

    // Fee collection trend (authoritative source, effectiveNet for expected)
    FeeVoucher.aggregate([
      { $match: { ...af, year: Number(year) } },
      {
        $addFields: {
          effectiveNetAmount: {
            $cond: {
              if: { $gt: ['$netAmount', 0] },
              then: '$netAmount',
              else: {
                $max: [0, {
                  $subtract: [
                    { $add: [{ $ifNull: [{ $sum: '$feeItems.amount' }, 0] }, { $ifNull: ['$fine', 0] }] },
                    { $ifNull: ['$discount', 0] },
                  ],
                }],
              },
            },
          },
        },
      },
      {
        $group: {
          _id: '$month',
          expected: { $sum: '$effectiveNetAmount' },
          collected: { $sum: '$paidAmount' },
          count: { $sum: 1 },
        },
      },
    ]),

    // Expense breakdown by category
    SchoolTransaction.aggregate([
      { $match: { ...af, type: 'EXPENSE', date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: '$categoryId',
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'feecategories',
          localField: '_id',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          name: { $ifNull: ['$category.name', 'Unknown'] },
          total: 1,
          count: 1,
        },
      },
      { $sort: { total: -1 } },
    ]),

    // Paid teacher payroll per month — salary expense
    TeacherPayroll.aggregate([
      { $match: { ...af, year: Number(year), status: 'paid' } },
      {
        $group: {
          _id: '$month',
          salaryPaid: { $sum: '$netSalary' },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  // Build income vs expense chart — fee income from FeeVoucher, other income from SchoolTransaction
  // Expense = SchoolTransaction EXPENSE + paid teacher payroll
  const incomeVsExpense = MONTH_NAMES.map((name, idx) => {
    const monthNum = idx + 1;
    let otherIncome = 0, txnExpense = 0;
    txnTrend.forEach((r) => {
      if (r._id.month === monthNum) {
        if (r._id.type === 'INCOME') otherIncome = r.total;
        if (r._id.type === 'EXPENSE') txnExpense = r.total;
      }
    });
    const feeRow = feeTrend.find((r) => r._id === name) || {};
    const payrollRow = payrollTrend.find((r) => r._id === monthNum) || {};
    const income = otherIncome + (feeRow.collected || 0);
    const expense = txnExpense + (payrollRow.salaryPaid || 0);
    return { name: name.slice(0, 3), income, expense };
  });

  // Total salary paid in the year for expenseBreakdown
  const totalSalary = payrollTrend.reduce((s, r) => s + (r.salaryPaid || 0), 0);
  const fullExpenseBreakdown = totalSalary > 0
    ? [{ name: 'Teacher Salaries', total: totalSalary, count: payrollTrend.reduce((s, r) => s + (r.count || 0), 0) }, ...expenseBreakdown]
    : expenseBreakdown;

  // Fee collection trend
  const feeCollectionTrend = MONTH_NAMES.map((name) => {
    const row = feeTrend.find((r) => r._id === name) || {};
    return {
      name: name.slice(0, 3),
      expected: row.expected || 0,
      collected: row.collected || 0,
      rate: (row.expected || 0) > 0 ? Math.round(((row.collected || 0) / row.expected) * 100) : 0,
    };
  });

  return {
    summary: { year },
    data: { incomeVsExpense, feeCollectionTrend, expenseBreakdown: fullExpenseBreakdown },
    chartData: { incomeVsExpense, feeCollectionTrend, expenseBreakdown: fullExpenseBreakdown },
  };
};

// ═════════════════════════════════════════════════════════════════════════════
// FEE COLLECTION — Yearly per-class per-student report
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Returns per-class -> per-student -> per-month fee data for a full year.
 * Optional classId filter.
 */
const getYearlyFeeReport = async (scope, year, classId) => {
  const af = aggFilter(scope);
  const match = { ...af, year: Number(year) };
  if (classId) match.classId = new mongoose.Types.ObjectId(classId);

  const vouchers = await FeeVoucher.aggregate([
    { $match: match },
    {
      $lookup: {
        from: 'students',
        localField: 'studentId',
        foreignField: '_id',
        as: 'student',
      },
    },
    { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'schoolclasses',
        localField: 'classId',
        foreignField: '_id',
        as: 'class',
      },
    },
    { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
    {
      $project: {
        studentId: 1,
        classId: 1,
        className: '$class.name',
        classOrder: '$class.order',
        name: { $concat: [{ $ifNull: ['$student.firstName', ''] }, ' ', { $ifNull: ['$student.lastName', ''] }] },
        rollNumber: '$student.rollNumber',
        admissionNumber: '$student.admissionNumber',
        fatherName: '$student.parent.fatherName',
        phone: '$student.parent.phone',
        month: 1,
        netAmount: 1,
        paidAmount: 1,
        status: 1,
      },
    },
    { $sort: { classOrder: 1, className: 1, rollNumber: 1 } },
  ]);

  // Group by class -> student
  const classMap = {};
  vouchers.forEach((v) => {
    const cKey = String(v.classId);
    if (!classMap[cKey]) {
      classMap[cKey] = {
        classId: cKey,
        className: v.className || 'Unknown',
        students: {},
      };
    }
    const sKey = String(v.studentId);
    if (!classMap[cKey].students[sKey]) {
      classMap[cKey].students[sKey] = {
        studentId: sKey,
        name: v.name,
        rollNumber: v.rollNumber,
        admissionNumber: v.admissionNumber,
        fatherName: v.fatherName || '',
        phone: v.phone || '',
        months: {},
        totalPaid: 0,
        totalPending: 0,
      };
    }
    const st = classMap[cKey].students[sKey];
    st.months[v.month] = { netAmount: v.netAmount, paidAmount: v.paidAmount, status: v.status };
    st.totalPaid += v.paidAmount || 0;
    st.totalPending += Math.max(0, (v.netAmount || 0) - (v.paidAmount || 0));
  });

  // Convert to array
  return Object.values(classMap).map((cls) => {
    const students = Object.values(cls.students);
    const classTotalPaid = students.reduce((s, st) => s + st.totalPaid, 0);
    const classTotalPending = students.reduce((s, st) => s + st.totalPending, 0);
    return {
      classId: cls.classId,
      className: cls.className,
      totalStudents: students.length,
      classTotalPaid,
      classTotalPending,
      students,
    };
  });
};

/**
 * Returns aggregated receivable summary for a given month/year:
 * - thisMonthReceivable     : outstanding amount on unpaid/partial/overdue vouchers for this month
 * - thisMonthVouchers       : count of those pending vouchers
 * - previousArrears         : outstanding from all earlier months in the same year
 * - arrearsVouchers         : count of arrear vouchers
 * - totalReceivable         : thisMonthReceivable + previousArrears
 * - totalReceivedThisMonth  : paidAmount collected on this month's vouchers
 * - paidVouchersThisMonth   : count of fully-paid vouchers this month
 * - totalCreditBalance      : advance wallet balance across active students
 */
const getReceivableSummary = async (scope, year, month) => {
  const af = aggFilter(scope);
  const monthIdx = MONTH_NAMES.indexOf(month);
  const previousMonths = MONTH_NAMES.slice(0, monthIdx);

  const [
    thisMonthResult,
    arrearsResult,
    receivedResult,
    creditResult,
  ] = await Promise.all([
    // Pending (receivable) for this month
    FeeVoucher.aggregate([
      {
        $match: {
          ...af,
          year: Number(year),
          month,
          status: { $in: ['unpaid', 'partial', 'overdue'] },
        },
      },
      {
        $group: {
          _id: null,
          thisMonthReceivable: {
            $sum: { $max: [0, { $subtract: ['$netAmount', { $ifNull: ['$paidAmount', 0] }] }] },
          },
          thisMonthVouchers: { $sum: 1 },
        },
      },
    ]),

    // Arrears from previous months of the same year
    previousMonths.length > 0
      ? FeeVoucher.aggregate([
          {
            $match: {
              ...af,
              year: Number(year),
              month: { $in: previousMonths },
              status: { $in: ['unpaid', 'partial', 'overdue'] },
            },
          },
          {
            $group: {
              _id: null,
              previousArrears: {
                $sum: { $max: [0, { $subtract: ['$netAmount', { $ifNull: ['$paidAmount', 0] }] }] },
              },
              arrearsVouchers: { $sum: 1 },
            },
          },
        ])
      : Promise.resolve([]),

    // Amount already collected on this month's vouchers
    FeeVoucher.aggregate([
      {
        $match: {
          ...af,
          year: Number(year),
          month,
        },
      },
      {
        $group: {
          _id: null,
          totalReceivedThisMonth: { $sum: { $ifNull: ['$paidAmount', 0] } },
          paidVouchersThisMonth: {
            $sum: { $cond: [{ $eq: ['$status', 'paid'] }, 1, 0] },
          },
        },
      },
    ]),

    // Student advance/credit wallet
    Student.aggregate([
      { $match: { ...af, status: 'active', creditBalance: { $gt: 0 } } },
      { $group: { _id: null, totalCreditBalance: { $sum: '$creditBalance' } } },
    ]),
  ]);

  const thisMonthReceivable = thisMonthResult[0]?.thisMonthReceivable || 0;
  const thisMonthVouchers   = thisMonthResult[0]?.thisMonthVouchers   || 0;
  const previousArrears     = arrearsResult[0]?.previousArrears       || 0;
  const arrearsVouchers     = arrearsResult[0]?.arrearsVouchers       || 0;

  return {
    thisMonthReceivable,
    thisMonthVouchers,
    previousArrears,
    arrearsVouchers,
    totalReceivable:        thisMonthReceivable + previousArrears,
    totalReceivedThisMonth: receivedResult[0]?.totalReceivedThisMonth || 0,
    paidVouchersThisMonth:  receivedResult[0]?.paidVouchersThisMonth  || 0,
    totalCreditBalance:     creditResult[0]?.totalCreditBalance       || 0,
  };
};

module.exports = {
  getReport,
  getMonthlyIncomeExpense,
  getDailyCollection,
  getCategoryWiseReport,
  getProfitAndLoss,
  getStudentListByClass,
  getStudentFeeStatus,
  getStudentAttendanceSummary,
  getTeacherSalaryReport,
  getTeacherWorkload,
  getVouchersByStatus,
  getAnalytics,
  getYearlyFeeReport,
  getReceivableSummary,
};
