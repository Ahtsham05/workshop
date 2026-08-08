const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

/**
 * Extends an existing staff User with commission-tracking metadata. Deliberately does not
 * duplicate identity fields (name/email/phone) already on User — those are populated via
 * `userId` so the salesman's login and their sales-team profile never drift apart.
 */
const salesmanProfileSchema = mongoose.Schema(
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
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    salesmanCode: {
      type: String,
      required: true,
      trim: true,
    },
    phone: { type: String, trim: true },
    cnic: { type: String, trim: true },
    // % of sale amount (revenue) — used by the commission engine when no more specific
    // rule matches this salesman. See Module 3 (Commission Rules Engine).
    defaultCommissionRate: { type: Number, default: 0, min: 0, max: 100 },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active',
      index: true,
    },
    joiningDate: { type: Date, default: Date.now },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

salesmanProfileSchema.index({ organizationId: 1, branchId: 1 });
// One salesman profile per user per organization.
salesmanProfileSchema.index({ organizationId: 1, userId: 1 }, { unique: true });
salesmanProfileSchema.index({ organizationId: 1, salesmanCode: 1 }, { unique: true });

salesmanProfileSchema.plugin(toJSON);
salesmanProfileSchema.plugin(paginate);

const SalesmanProfile = mongoose.model('SalesmanProfile', salesmanProfileSchema);

module.exports = SalesmanProfile;
