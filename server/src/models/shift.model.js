const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const shiftSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
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

const Shift = mongoose.model('Shift', shiftSchema);

module.exports = Shift;
