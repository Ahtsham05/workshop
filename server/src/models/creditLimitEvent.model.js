const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * Audit trail for customer credit control — one row per change to a customer's credit
 * terms (limit set/raised/lowered, temporary increase, hold on/off) and per sale that went
 * through over the limit (manager override, warning-mode sale, offline sale synced later).
 * Read by the customer's "Credit history" panel; never edited after it is written.
 */
const CREDIT_EVENT_TYPES = [
  'limit_set',
  'limit_increase',
  'limit_decrease',
  'temp_limit_set',
  'temp_limit_cleared',
  'hold_on',
  'hold_off',
  'override',
  'warning',
  'offline_sale',
];

const creditLimitEventSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch' },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    type: { type: String, enum: CREDIT_EVENT_TYPES, required: true },
    previousLimit: { type: Number },
    newLimit: { type: Number },
    // Temporary increases: the temporary limit and when it lapses.
    expiresAt: { type: Date },
    reason: { type: String, trim: true, maxlength: 500 },
    // Sale events: which invoice, what the customer would owe after it, and by how much it
    // went over. `reasons` holds the rule(s) the sale broke: over_limit, on_hold, overdue.
    invoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
    invoiceNumber: { type: String },
    saleAmount: { type: Number },
    exposure: { type: Number },
    excess: { type: Number },
    reasons: { type: [String], default: undefined },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedByName: { type: String },
  },
  { timestamps: true }
);

creditLimitEventSchema.index({ organizationId: 1, customerId: 1, createdAt: -1 });
creditLimitEventSchema.index({ organizationId: 1, type: 1, createdAt: -1 });

creditLimitEventSchema.plugin(toJSON);
creditLimitEventSchema.plugin(paginate);

const CreditLimitEvent = mongoose.model('CreditLimitEvent', creditLimitEventSchema);

module.exports = CreditLimitEvent;
module.exports.CREDIT_EVENT_TYPES = CREDIT_EVENT_TYPES;
