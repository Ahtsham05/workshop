const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const teacherPayrollSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    teacherId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Teacher',
      required: true,
      index: true,
    },
    month: {
      type: Number,
      required: true,
      min: 1,
      max: 12,
    },
    year: {
      type: Number,
      required: true,
    },
    basicSalary: {
      type: Number,
      required: true,
      default: 0,
    },
    allowances: {
      transport: { type: Number, default: 0 },
      medical: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
    },
    deductions: {
      absent: { type: Number, default: 0 },   // calculated automatically
      late: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      other: { type: Number, default: 0 },
    },
    bonus: { type: Number, default: 0 },
    totalAllowances: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    grossSalary: { type: Number, default: 0 },
    netSalary: { type: Number, default: 0 },
    workingDays: { type: Number, default: 0 },
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    lateDays: { type: Number, default: 0 },
    leaveDays: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['draft', 'paid'],
      default: 'draft',
    },
    paidAt: { type: Date },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

teacherPayrollSchema.plugin(toJSON);
teacherPayrollSchema.plugin(paginate);

// One payroll per teacher per month/year
teacherPayrollSchema.index(
  { organizationId: 1, branchId: 1, teacherId: 1, month: 1, year: 1 },
  { unique: true }
);

const TeacherPayroll = mongoose.model('TeacherPayroll', teacherPayrollSchema);
module.exports = TeacherPayroll;
