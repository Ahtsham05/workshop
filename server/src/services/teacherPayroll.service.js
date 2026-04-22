const httpStatus = require('http-status');
const { TeacherPayroll, Teacher, TeacherAttendance } = require('../models');
const ApiError = require('../utils/ApiError');
const accountsSystemService = require('./accountsSystem.service');

const getTenantFilter = (scope = {}) => {
  const f = {};
  if (scope.organizationId) f.organizationId = scope.organizationId;
  if (scope.branchId) f.branchId = scope.branchId;
  return f;
};

/**
 * Get working days in a given month/year (Mon–Fri only)
 */
const getWorkingDaysInMonth = (month, year) => {
  let count = 0;
  const daysInMonth = new Date(year, month, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const day = new Date(year, month - 1, d).getDay();
    if (day !== 0 && day !== 6) count++;
  }
  return count;
};

/**
 * Count teacher attendance for a specific month/year
 */
const getMonthAttendanceSummary = async (teacherId, month, year, scope) => {
  const startDate = new Date(year, month - 1, 1);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(year, month, 1);
  endDate.setHours(0, 0, 0, 0);

  const records = await TeacherAttendance.find({
    ...getTenantFilter(scope),
    teacherId,
    date: { $gte: startDate, $lt: endDate },
  }).lean();

  const summary = { present: 0, absent: 0, late: 0, on_leave: 0, holiday: 0 };
  for (const r of records) {
    if (summary[r.status] !== undefined) summary[r.status]++;
  }
  return summary;
};

/**
 * Generate (upsert) a monthly payroll entry for a teacher.
 * If attendance data exists it is used; otherwise uses provided params.
 */
const generatePayroll = async (body, scope) => {
  const tf = getTenantFilter(scope);
  const teacher = await Teacher.findOne({ _id: body.teacherId, ...tf });
  if (!teacher) throw new ApiError(httpStatus.NOT_FOUND, 'Teacher not found');

  const { month, year } = body;
  const basicSalary = body.basicSalary ?? teacher.salary?.basicSalary ?? 0;
  const workingDays = body.workingDays || getWorkingDaysInMonth(month, year);

  const attSummary = await getMonthAttendanceSummary(body.teacherId, month, year, scope);
  const presentDays = body.presentDays ?? attSummary.present + attSummary.late;
  const absentDays = body.absentDays ?? attSummary.absent;
  const lateDays = body.lateDays ?? attSummary.late;
  const leaveDays = body.leaveDays ?? attSummary.on_leave;

  const allowances = {
    transport: body.allowances?.transport ?? 0,
    medical: body.allowances?.medical ?? 0,
    other: body.allowances?.other ?? 0,
  };
  const totalAllowances = allowances.transport + allowances.medical + allowances.other;

  // Per-day salary = basicSalary / workingDays (guard div by zero)
  const perDay = workingDays > 0 ? basicSalary / workingDays : 0;
  const absentDeduction = perDay * absentDays;

  const deductions = {
    absent: body.deductions?.absent ?? absentDeduction,
    late: body.deductions?.late ?? 0,
    tax: body.deductions?.tax ?? 0,
    other: body.deductions?.other ?? 0,
  };
  const totalDeductions = deductions.absent + deductions.late + deductions.tax + deductions.other;
  const bonus = body.bonus ?? 0;
  const grossSalary = basicSalary + totalAllowances + bonus;
  const netSalary = grossSalary - totalDeductions;

  const filter = { ...tf, teacherId: body.teacherId, month, year };
  const update = {
    $set: {
      ...filter,
      basicSalary,
      allowances,
      deductions,
      bonus,
      totalAllowances,
      totalDeductions,
      grossSalary,
      netSalary,
      workingDays,
      presentDays,
      absentDays,
      lateDays,
      leaveDays,
      status: 'draft',
      notes: body.notes,
    },
  };
  return TeacherPayroll.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: true });
};

const queryPayroll = async (filter, options) => {
  return TeacherPayroll.paginate(filter, options);
};

const getPayrollById = async (id, scope = {}) => {
  return TeacherPayroll.findOne({ _id: id, ...getTenantFilter(scope) }).populate('teacherId').populate('paidBy', 'name email');
};

const markAsPaid = async (id, paidByUserId, scope = {}) => {
  const doc = await getPayrollById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Payroll not found');
  if (doc.status === 'paid') throw new ApiError(httpStatus.BAD_REQUEST, 'Payroll already marked as paid');
  doc.status = 'paid';
  doc.paidAt = new Date();
  doc.paidBy = paidByUserId;
  await doc.save();

  // Auto-post salary to double-entry accounting (fire-and-forget)
  const teacherName = doc.teacherId?.name || doc.teacherId?.firstName || 'Teacher';
  accountsSystemService.postSalaryPayment(scope, {
    amount: doc.netSalary,
    paymentMethod: 'cash',
    payrollId: doc._id.toString(),
    description: `Salary payment — ${teacherName} | ${doc.month}/${doc.year}`,
  }).catch(() => {});

  return doc;
};

const updatePayrollById = async (id, updateBody, scope = {}) => {
  const doc = await getPayrollById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Payroll not found');
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deletePayrollById = async (id, scope = {}) => {
  const doc = await getPayrollById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Payroll not found');
  await doc.deleteOne();
  return doc;
};

module.exports = {
  generatePayroll,
  queryPayroll,
  getPayrollById,
  markAsPaid,
  updatePayrollById,
  deletePayrollById,
};
