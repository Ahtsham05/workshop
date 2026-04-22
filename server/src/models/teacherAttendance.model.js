const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const teacherAttendanceSchema = mongoose.Schema(
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
    date: {
      type: Date,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['present', 'absent', 'late', 'on_leave', 'holiday'],
      required: true,
      default: 'present',
    },
    checkInTime: {
      type: String, // stored as "HH:MM" string
    },
    method: {
      type: String,
      enum: ['self', 'admin'],
      default: 'admin',
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    remarks: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

teacherAttendanceSchema.plugin(toJSON);
teacherAttendanceSchema.plugin(paginate);

// One attendance record per teacher per day
teacherAttendanceSchema.index(
  { organizationId: 1, branchId: 1, teacherId: 1, date: 1 },
  { unique: true }
);
teacherAttendanceSchema.index({ organizationId: 1, branchId: 1, date: 1 });

const TeacherAttendance = mongoose.model('TeacherAttendance', teacherAttendanceSchema);
module.exports = TeacherAttendance;
