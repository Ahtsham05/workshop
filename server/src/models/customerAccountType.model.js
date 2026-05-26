const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const customerAccountTypeSchema = new mongoose.Schema(
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
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    color: {
      type: String,
      default: '#6366f1',
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true },
);

customerAccountTypeSchema.plugin(toJSON);
customerAccountTypeSchema.plugin(paginate);

customerAccountTypeSchema.index(
  { organizationId: 1, branchId: 1, slug: 1 },
  { unique: true },
);

const CustomerAccountType = mongoose.model('CustomerAccountType', customerAccountTypeSchema);

module.exports = CustomerAccountType;
