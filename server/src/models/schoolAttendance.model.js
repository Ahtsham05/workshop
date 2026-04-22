const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const schoolAttendanceSchema = mongoose.Schema(
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
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
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
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'leave', 'half_day'],
      required: true,
    },
    remarks: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

schoolAttendanceSchema.plugin(toJSON);
schoolAttendanceSchema.plugin(paginate);

schoolAttendanceSchema.index({ organizationId: 1, branchId: 1, studentId: 1, date: 1 }, { unique: true });
schoolAttendanceSchema.index({ organizationId: 1, branchId: 1, classId: 1, date: 1 });
schoolAttendanceSchema.index({ organizationId: 1, branchId: 1, sectionId: 1, date: 1 });
schoolAttendanceSchema.index({ organizationId: 1, branchId: 1, date: 1 });

const SchoolAttendance = mongoose.model('SchoolAttendance', schoolAttendanceSchema);

module.exports = SchoolAttendance;
