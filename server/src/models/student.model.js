const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const studentSchema = mongoose.Schema(
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
    admissionNumber: {
      type: String,
      required: true,
      trim: true,
    },
    rollNumber: {
      type: String,
      trim: true,
    },
    /** Numeric login ID shown on fee vouchers; unique per organization */
    studentUserId: {
      type: String,
      trim: true,
      match: [/^\d+$/, 'Student user ID must be numeric only'],
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
      default: '',
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other'],
      required: true,
    },
    dateOfBirth: {
      type: Date,
    },
    admissionDate: {
      type: Date,
      default: Date.now,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolClass',
      required: true,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
    },
    // Parent portal user account (auto-created)
    parentUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Parent information (embedded)
    parent: {
      fatherName: { type: String, trim: true },
      motherName: { type: String, trim: true },
      guardianName: { type: String, trim: true },
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
      address: { type: String, trim: true },
      cnic: { type: String, trim: true },
      occupation: { type: String, trim: true },
    },
    // Academic information
    previousSchool: { type: String, trim: true },
    bloodGroup: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', ''],
    },
    nationality: { type: String, trim: true },
    religion: { type: String, trim: true },
    // Fee information
    feeStructure: {
      monthlyFee: { type: Number, default: 0 },
      transportFee: { type: Number, default: 0 },
      admissionFee: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
    },
    // Photo
    photoUrl: {
      url: { type: String },
      publicId: { type: String },
    },
    // Credit wallet — advance payments or overpayments stored here
    creditBalance: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'graduated', 'transferred'],
      default: 'active',
    },
  },
  { timestamps: true }
);

studentSchema.plugin(toJSON);
studentSchema.plugin(paginate);

studentSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Admission number is unique org-wide (across ALL branches)
studentSchema.index({ organizationId: 1, admissionNumber: 1 }, { unique: true });
studentSchema.index({ studentUserId: 1 }, { unique: true, sparse: true });
studentSchema.index({ organizationId: 1, branchId: 1, classId: 1 });
studentSchema.index({ organizationId: 1, branchId: 1, status: 1 });
studentSchema.index({ organizationId: 1, branchId: 1, classId: 1, status: 1 });
studentSchema.index({ 'parent.phone': 1 });
studentSchema.index({ firstName: 1, lastName: 1 });

const Student = mongoose.model('Student', studentSchema);

module.exports = Student;
