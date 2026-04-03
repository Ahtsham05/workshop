const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const utilityCompanySchema = new mongoose.Schema(
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
      required: false,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    billType: {
      type: String,
      enum: ['electricity', 'gas', 'water', 'internet', 'other'],
      required: true,
    },
    defaultServiceCharge: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

utilityCompanySchema.plugin(toJSON);
utilityCompanySchema.plugin(paginate);

utilityCompanySchema.index({ organizationId: 1, branchId: 1, billType: 1 });

const UtilityCompany = mongoose.model('UtilityCompany', utilityCompanySchema);

module.exports = UtilityCompany;
