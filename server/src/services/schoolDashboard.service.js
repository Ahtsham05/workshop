const mongoose = require('mongoose');
const { Student, Teacher, SchoolClass, SchoolAttendance, FeeVoucher, Exam, TeacherAttendance, SchoolTransaction, TeacherPayroll } = require('../models');

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = data.organizationId;
  if (data.branchId) filter.branchId = data.branchId;
  return filter;
};

/**
 * Mongoose does NOT auto-cast values inside aggregate() pipelines.
 * organizationId / branchId arrive as plain strings from req headers.
 * We must cast them to ObjectId manually for $match to work correctly.
 */
const toObjectId = (v) => {
  if (!v) return undefined;
  if (v instanceof mongoose.Types.ObjectId) return v;
  if (mongoose.Types.ObjectId.isValid(v)) return new mongoose.Types.ObjectId(String(v));
  return v; // fallback — let MongoDB error if truly invalid
};

const getAggTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = toObjectId(data.organizationId);
  if (data.branchId) filter.branchId = toObjectId(data.branchId);
  return filter;
};

const getDashboardStats = async (scope = {}) => {
  const tf = getTenantFilter(scope);
  const atf = getAggTenantFilter(scope); // ObjectId-cast version for aggregate pipelines
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1-12
  const currentYear = now.getFullYear();

  // Consolidate same-collection queries using $facet to reduce DB round-trips
  // Student collection: 1 $facet (count + enrolledByClass + enrolledBySection) instead of 3 queries
  // SchoolAttendance: 1 $facet (today summary + class-wise + section-wise) instead of 3 queries
  // SchoolFee: 1 $facet (count + amount) instead of 2 queries
  // Total: 8 queries instead of 14
  const [
    studentFacet,
    totalTeachers,
    totalClasses,
    attendanceFacet,
    feeFacet,
    upcomingExams,
    recentAdmissions,
    todayCollectionAgg,
    teacherAttendanceAgg,
    payrollAgg,
  ] = await Promise.all([
    // --- Student $facet: count + enrolledByClass + enrolledBySection ---
    Student.aggregate([
      { $match: { ...atf, status: 'active' } },
      {
        $facet: {
          total: [{ $count: 'count' }],
          byClass: [{ $group: { _id: '$classId', enrolled: { $sum: 1 } } }],
          bySection: [
            { $match: { sectionId: { $exists: true, $ne: null } } },
            { $group: { _id: '$sectionId', classId: { $first: '$classId' }, enrolled: { $sum: 1 } } },
          ],
        },
      },
    ]),
    Teacher.countDocuments({ ...tf, status: 'active' }),
    SchoolClass.countDocuments({ ...tf, isActive: true }),
    // --- SchoolAttendance $facet: today summary + class-wise + section-wise ---
    SchoolAttendance.aggregate([
      { $match: { ...atf, date: { $gte: today, $lt: tomorrow } } },
      {
        $facet: {
          todaySummary: [
            {
              $group: {
                _id: null,
                present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
                absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
                late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
                leave: { $sum: { $cond: [{ $eq: ['$status', 'leave'] }, 1, 0] } },
                half_day: { $sum: { $cond: [{ $eq: ['$status', 'half_day'] }, 1, 0] } },
                marked: { $sum: 1 },
              },
            },
          ],
          byClass: [
            {
              $group: {
                _id: '$classId',
                present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
                absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
                late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
                leave: { $sum: { $cond: [{ $eq: ['$status', 'leave'] }, 1, 0] } },
                half_day: { $sum: { $cond: [{ $eq: ['$status', 'half_day'] }, 1, 0] } },
                marked: { $sum: 1 },
              },
            },
            { $lookup: { from: 'schoolclasses', localField: '_id', foreignField: '_id', as: 'class' } },
            { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                classId: '$_id',
                className: '$class.name',
                order: '$class.order',
                present: 1, absent: 1, late: 1, leave: 1, half_day: 1, marked: 1,
              },
            },
            { $sort: { order: 1 } },
          ],
          bySection: [
            { $match: { sectionId: { $exists: true, $ne: null } } },
            {
              $group: {
                _id: '$sectionId',
                classId: { $first: '$classId' },
                present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
                absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
                late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
                leave: { $sum: { $cond: [{ $eq: ['$status', 'leave'] }, 1, 0] } },
                half_day: { $sum: { $cond: [{ $eq: ['$status', 'half_day'] }, 1, 0] } },
                marked: { $sum: 1 },
              },
            },
            { $lookup: { from: 'sections', localField: '_id', foreignField: '_id', as: 'section' } },
            { $unwind: { path: '$section', preserveNullAndEmptyArrays: true } },
            { $lookup: { from: 'schoolclasses', localField: 'classId', foreignField: '_id', as: 'class' } },
            { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
            {
              $project: {
                sectionId: '$_id',
                sectionName: '$section.name',
                className: '$class.name',
                classOrder: '$class.order',
                present: 1, absent: 1, late: 1, leave: 1, half_day: 1, marked: 1,
              },
            },
            { $sort: { classOrder: 1, sectionName: 1 } },
          ],
        },
      },
    ]),
    // --- FeeVoucher $facet: pending/outstanding count + total amount ---
    // We consider all vouchers that still have an outstanding balance as "pending fees".
    FeeVoucher.aggregate([
      // Compute effective net (mirrors FeeVoucher effectiveNet logic used elsewhere)
      {
        $addFields: {
          effectiveNet: {
            $cond: {
              if: { $gt: ['$netAmount', 0] },
              then: '$netAmount',
              else: {
                $subtract: [
                  {
                    $reduce: {
                      input: { $ifNull: ['$feeItems', []] },
                      initialValue: 0,
                      in: { $add: ['$$value', { $ifNull: ['$$this.amount', 0] }] },
                    },
                  },
                  { $ifNull: ['$discount', 0] },
                ],
              },
            },
          },
          outstanding: {
            $max: [0, { $subtract: ['$effectiveNet', { $ifNull: ['$paidAmount', 0] }] }],
          },
        },
      },
      { $match: { ...atf, status: { $in: ['unpaid', 'partial', 'overdue'] }, outstanding: { $gt: 0 } } },
      {
        $facet: {
          count: [{ $count: 'count' }],
          amount: [{ $group: { _id: null, total: { $sum: '$outstanding' } } }],
        },
      },
    ]),
    Exam.find({ ...tf, status: 'upcoming', startDate: { $gte: today } })
      .populate('classId')
      .sort({ startDate: 1 })
      .limit(5)
      .lean(),
    Student.find({ ...tf })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('firstName lastName classId sectionId admissionNumber createdAt')
      .populate('classId', 'name order')
      .populate('sectionId', 'name')
      .lean(),
    // Today's fee collection (INCOME transactions created today)
    SchoolTransaction.aggregate([
      { $match: { ...atf, type: 'INCOME', date: { $gte: today, $lt: tomorrow } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    // Teacher attendance for today
    TeacherAttendance.aggregate([
      { $match: { ...atf, date: { $gte: today, $lt: tomorrow } } },
      {
        $group: {
          _id: null,
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
          on_leave: { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] } },
          marked: { $sum: 1 },
        },
      },
    ]),
    // Payroll stats for current month
    TeacherPayroll.aggregate([
      { $match: { ...atf, month: currentMonth, year: currentYear } },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          totalNet: { $sum: '$netSalary' },
        },
      },
    ]),
  ]);

  // Extract results from $facet outputs
  const studentData = studentFacet[0] || { total: [], byClass: [], bySection: [] };
  const totalStudents = studentData.total[0]?.count || 0;
  const classWiseEnrolled = studentData.byClass;
  const sectionWiseEnrolled = studentData.bySection;

  const attData = attendanceFacet[0] || { todaySummary: [], byClass: [], bySection: [] };
  const todayAttendanceAgg = attData.todaySummary;
  const classWiseAttendanceAgg = attData.byClass;
  const sectionWiseAttendanceAgg = attData.bySection;

  const feeData = feeFacet[0] || { count: [], amount: [] };
  const pendingFees = feeData.count[0]?.count || 0;
  const pendingFeesAmount = feeData.amount[0]?.total || 0;

  const attStats = todayAttendanceAgg[0] || { present: 0, absent: 0, late: 0, leave: 0, half_day: 0, marked: 0 };
  const todayCollection = todayCollectionAgg[0] || { total: 0, count: 0 };
  const teacherAttStats = (teacherAttendanceAgg[0]) || { present: 0, absent: 0, late: 0, on_leave: 0, marked: 0 };

  // Payroll stats for current month
  const payrollByStatus = {};
  payrollAgg.forEach((g) => { payrollByStatus[g._id] = { count: g.count, total: g.totalNet }; });
  const payrollPaid = payrollByStatus['paid'] || { count: 0, total: 0 };
  const payrollDraft = payrollByStatus['draft'] || { count: 0, total: 0 };
  const payrollStats = {
    month: currentMonth,
    year: currentYear,
    totalRecords: payrollPaid.count + payrollDraft.count,
    paid: payrollPaid.count,
    draft: payrollDraft.count,
    totalPaid: payrollPaid.total,       // amount actually marked paid
    totalPending: payrollDraft.total,    // draft / unpaid salary
    totalPayable: payrollPaid.total + payrollDraft.total,
  };

  // Merge enrolled counts into class-wise attendance
  const enrolledByClass = {};
  classWiseEnrolled.forEach((e) => { enrolledByClass[String(e._id)] = e.enrolled; });
  const classWiseAttendance = classWiseAttendanceAgg.map((c) => ({
    ...c,
    enrolled: enrolledByClass[String(c.classId)] || 0,
  }));

  // Merge enrolled counts into section-wise attendance
  const enrolledBySection = {};
  sectionWiseEnrolled.forEach((e) => { enrolledBySection[String(e._id)] = e.enrolled; });
  const sectionWiseAttendance = sectionWiseAttendanceAgg.map((s) => ({
    ...s,
    enrolled: enrolledBySection[String(s.sectionId)] || 0,
  }));

  return {
    totalStudents,
    totalTeachers,
    totalClasses,
    todayAttendance: {
      present: attStats.present,
      absent: attStats.absent,
      late: attStats.late,
      leave: attStats.leave,
      half_day: attStats.half_day,
      marked: attStats.marked,
      // total = all enrolled active students (correct denominator)
      total: totalStudents,
    },
    classWiseAttendance,
    sectionWiseAttendance,
    pendingFees: {
      count: pendingFees,
      amount: pendingFeesAmount,
    },
    upcomingExams,
    recentAdmissions,
    teacherAttendance: { ...teacherAttStats, total: totalTeachers },
    todayCollection: { amount: todayCollection.total, count: todayCollection.count },
    payroll: payrollStats,
  };
};

/**
 * Get today's teacher attendance summary (for dashboard widget).
 */
const getTeacherAttendanceTodayStats = async (scope = {}) => {
  const tf = getTenantFilter(scope);
  const atf = getAggTenantFilter(scope);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const totalTeachers = await Teacher.countDocuments({ ...tf, status: 'active' });
  const agg = await TeacherAttendance.aggregate([
    { $match: { ...atf, date: { $gte: today, $lt: tomorrow } } },
    {
      $group: {
        _id: null,
        present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
        on_leave: { $sum: { $cond: [{ $eq: ['$status', 'on_leave'] }, 1, 0] } },
        marked: { $sum: 1 },
      },
    },
  ]);
  const stats = agg[0] || { present: 0, absent: 0, late: 0, on_leave: 0, marked: 0 };
  return { ...stats, total: totalTeachers };
};

module.exports = {
  getDashboardStats,
  getTeacherAttendanceTodayStats,
};
