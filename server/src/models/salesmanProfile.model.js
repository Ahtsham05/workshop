const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

/**
 * A member of the sales team. Either linked to an existing staff User (`userId` set — the
 * login is reused, no separate identity created) or fully standalone (`userId` null — a
 * salesman with no login at all, e.g. floor staff a cashier attributes sales to). `name` is
 * always the canonical display name either way: a snapshot of the User's name when linked,
 * or entered directly when standalone. This is the one identity every commission-earning
 * sale (Invoice/SimSale/LoadTransaction/RepairJob/ServiceInvoice), CommissionRule,
 * SalesmanCommissionLedger, and SalesmanCommissionPayment ultimately references.
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
    // Optional — set only when this salesman is also a staff login.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    name: { type: String, trim: true, required: true },
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
// One salesman profile per user per organization — only enforced when userId is set, so
// any number of standalone (userId: null) salesmen can coexist.
salesmanProfileSchema.index(
  { organizationId: 1, userId: 1 },
  { unique: true, partialFilterExpression: { userId: { $type: 'objectId' } } }
);
salesmanProfileSchema.index({ organizationId: 1, salesmanCode: 1 }, { unique: true });

salesmanProfileSchema.plugin(toJSON);
salesmanProfileSchema.plugin(paginate);

const SalesmanProfile = mongoose.model('SalesmanProfile', salesmanProfileSchema);

module.exports = SalesmanProfile;
