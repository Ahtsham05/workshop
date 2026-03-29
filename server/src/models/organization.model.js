const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const organizationSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    businessType: {
      type: String,
      enum: ['retail', 'wholesale', 'manufacturing', 'services', 'restaurant', 'pharmacy', 'education', 'healthcare', 'other'],
      default: 'retail',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    address: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    taxNumber: {
      type: String,
      trim: true,
    },
    website: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    logo: {
      url: { type: String },
      publicId: { type: String },
    },
    owner: {
      type: mongoose.SchemaTypes.ObjectId,
      ref: 'User',
      required: true,
    },
    subscription: {
      planType: { type: String, enum: ['trial', 'single', 'multi'], default: 'trial' },
      status: { type: String, enum: ['active', 'expired', 'pending'], default: 'pending' },
      startDate: { type: Date },
      endDate: { type: Date },
      isTrial: { type: Boolean, default: true },
      limits: {
        maxBranches: { type: Number, default: 1 },
        maxUsers: { type: Number, default: 2 },
      },
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

organizationSchema.plugin(toJSON);
organizationSchema.plugin(paginate);

/**
 * @typedef Organization
 */
const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;
