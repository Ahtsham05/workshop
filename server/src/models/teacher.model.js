const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const teacherSchema = mongoose.Schema(
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    employeeId: {
      type: String,
      required: true,
      trim: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: false,
      trim: true,
    },
    gender: {
      type: String,
      enum: ['Male', 'Female', 'Other'],
      required: true,
    },
    dateOfBirth: {
      type: Date,
    },
    joiningDate: {
      type: Date,
      default: Date.now,
    },
    qualification: {
      type: String,
      trim: true,
    },
    specialization: {
      type: String,
      trim: true,
    },
    experience: {
      type: Number,
      default: 0,
    },
    address: {
      type: String,
      trim: true,
    },
    salary: {
      basicSalary: { type: Number, default: 0 },
      allowances: { type: Number, default: 0 },
      deductions: { type: Number, default: 0 },
    },
    bankDetails: {
      bankName: { type: String },
      accountNumber: { type: String },
      accountTitle: { type: String },
    },
    photoUrl: {
      url: { type: String },
      publicId: { type: String },
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'on_leave', 'terminated'],
      default: 'active',
    },
    // Linked portal user account
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Classes this teacher is assigned to teach
    assignedClasses: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolClass',
    }],
    // Subjects this teacher can teach
    subjects: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
    }],
  },
  { timestamps: true }
);

teacherSchema.plugin(toJSON);
teacherSchema.plugin(paginate);

teacherSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

teacherSchema.index({ organizationId: 1, branchId: 1, employeeId: 1 }, { unique: true });
teacherSchema.index({ organizationId: 1, branchId: 1, email: 1 }, { unique: true });
teacherSchema.index({ organizationId: 1, branchId: 1, status: 1 });
teacherSchema.index({ organizationId: 1, branchId: 1, userId: 1 });

const Teacher = mongoose.model('Teacher', teacherSchema);

module.exports = Teacher;
