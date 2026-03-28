const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const branchSchema = mongoose.Schema(
  {
    organizationId: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'Organization',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    location: {
      address: { type: String, trim: true },
      city: { type: String, trim: true },
      country: { type: String, trim: true },
    },
    phone: {
      type: String,
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    manager: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
    },
    isDefault: {
      type: Boolean,
      default: false,
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

branchSchema.plugin(toJSON);
branchSchema.plugin(paginate);

/**
 * @typedef Branch
 */
const Branch = mongoose.model('Branch', branchSchema);

module.exports = Branch;
