const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const departmentSchema = mongoose.Schema(
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
    manager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    },
    parentDepartment: {
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

departmentSchema.plugin(toJSON);
departmentSchema.plugin(paginate);

departmentSchema.index({ organizationId: 1, branchId: 1 });
departmentSchema.index({ organizationId: 1, branchId: 1, name: 1 }, { unique: false });
departmentSchema.index({ organizationId: 1, branchId: 1, code: 1 }, { unique: false });

const Department = mongoose.model('Department', departmentSchema);

module.exports = Department;
