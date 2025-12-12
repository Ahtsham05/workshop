const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const designationSchema = mongoose.Schema(
  {
    title: {
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
    description: {
      type: String,
      trim: true,
    },
    level: {
      type: Number,
      required: true,
      default: 1,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

designationSchema.plugin(toJSON);
designationSchema.plugin(paginate);

const Designation = mongoose.model('Designation', designationSchema);

module.exports = Designation;
