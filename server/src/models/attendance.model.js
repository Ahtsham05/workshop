const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const attendanceSchema = mongoose.Schema(
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
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    date: {
      type: Date,
      required: true,
    },
    checkIn: {
      type: Date,
    },
    checkOut: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['Present', 'Absent', 'Late', 'Half-Day', 'On Leave', 'Holiday'],
      default: 'Absent',
    },
    workingHours: {
      type: Number,
      default: 0,
    },
    overtime: {
      type: Number,
      default: 0,
    },
    lateArrival: {
      type: Number,
      default: 0, // minutes
    },
    earlyDeparture: {
      type: Number,
      default: 0, // minutes
    },
    shift: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Shift',
    },
    location: {
      type: String,
      enum: ['Office', 'Remote', 'Field'],
      default: 'Office',
    },
    notes: {
      type: String,
      trim: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

attendanceSchema.plugin(toJSON);
attendanceSchema.plugin(paginate);

// Compound index for efficient querying
attendanceSchema.index({ employee: 1, date: 1 }, { unique: false });
attendanceSchema.index({ organizationId: 1, branchId: 1 });
attendanceSchema.index({ organizationId: 1, branchId: 1, employee: 1, date: 1 }, { unique: true });

const Attendance = mongoose.model('Attendance', attendanceSchema);

module.exports = Attendance;
