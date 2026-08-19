const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const designationSchema = mongoose.Schema(
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
    title: {
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

designationSchema.index({ organizationId: 1, branchId: 1 });
designationSchema.index({ organizationId: 1, branchId: 1, title: 1 }, { unique: true });
designationSchema.index({ organizationId: 1, branchId: 1, code: 1 }, { unique: true });

const Designation = mongoose.model('Designation', designationSchema);

module.exports = Designation;
