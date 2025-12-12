const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const leaveSchema = mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
      required: true,
    },
    leaveType: {
      type: String,
      enum: ['Casual', 'Sick', 'Annual', 'Maternity', 'Paternity', 'Unpaid', 'Emergency'],
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    totalDays: {
      type: Number,
      required: true,
    },
    reason: {
      type: String,
      required: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      default: 'Pending',
    },
    appliedDate: {
      type: Date,
      default: Date.now,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvalDate: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    attachments: [
      {
        name: String,
        url: String,
        uploadDate: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isHalfDay: {
      type: Boolean,
      default: false,
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

leaveSchema.plugin(toJSON);
leaveSchema.plugin(paginate);

// Index for better query performance
leaveSchema.index({ employee: 1, startDate: 1 });
leaveSchema.index({ status: 1 });

const Leave = mongoose.model('Leave', leaveSchema);

module.exports = Leave;
