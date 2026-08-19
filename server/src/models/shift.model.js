const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const shiftSchema = mongoose.Schema(
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
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    startTime: {
      type: String,
      required: true,
    },
    endTime: {
      type: String,
      required: true,
    },
    breakDuration: {
      type: Number,
      default: 60, // minutes
    },
    workingDays: [{
      type: String,
      enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    }],
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

shiftSchema.plugin(toJSON);
shiftSchema.plugin(paginate);

shiftSchema.index({ organizationId: 1, branchId: 1 });
shiftSchema.index({ organizationId: 1, branchId: 1, name: 1 }, { unique: true });
shiftSchema.index({ organizationId: 1, branchId: 1, code: 1 }, { unique: true });

const Shift = mongoose.model('Shift', shiftSchema);

module.exports = Shift;
