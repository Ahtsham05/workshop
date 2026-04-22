const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const teacherLeaveSchema = mongoose.Schema(
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
    leaveType: {
      type: String,
      enum: ['sick', 'casual', 'annual', 'emergency', 'unpaid', 'maternity', 'paternity'],
      required: true,
    },
    fromDate: {
      type: Date,
      required: true,
    },
    toDate: {
      type: Date,
      required: true,
    },
    totalDays: {
      type: Number,
      required: true,
      min: 0.5,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'cancelled'],
      default: 'pending',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
);

teacherLeaveSchema.plugin(toJSON);
teacherLeaveSchema.plugin(paginate);

teacherLeaveSchema.index({ organizationId: 1, branchId: 1, teacherId: 1, fromDate: 1 });
teacherLeaveSchema.index({ organizationId: 1, branchId: 1, status: 1 });

const TeacherLeave = mongoose.model('TeacherLeave', teacherLeaveSchema);
module.exports = TeacherLeave;
