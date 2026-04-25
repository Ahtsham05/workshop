const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const serviceSchema = new mongoose.Schema(
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
    serviceName: {
      type: String,
      required: true,
      trim: true,
    },
    details: {
      type: String,
      trim: true,
      default: '',
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

serviceSchema.plugin(toJSON);
serviceSchema.plugin(paginate);

serviceSchema.index({ organizationId: 1, branchId: 1, serviceName: 1 }, { unique: true });
serviceSchema.index({ organizationId: 1, branchId: 1, isActive: 1, serviceName: 1 });

const Service = mongoose.model('Service', serviceSchema);

module.exports = Service;
