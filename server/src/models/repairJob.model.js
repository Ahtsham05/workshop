const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * A repair ticket — phones, tablets, laptops, desktops, printers, TVs, consoles, anything.
 *
 * Reports, the mobile dashboard and the commission engine read the original flat fields
 * directly, so they keep their meaning:
 *   charges        the bill total (items − discount once items exist, the estimate before)
 *   cost           what the parts cost the shop (sum of item unit cost × qty)
 *   advanceAmount  everything collected so far (sum of payments)
 *   status         'completed' = ready for pickup, 'delivered' = handed back
 *   technician     the technician's name (technicianId is the user it came from)
 *
 * Money: every payment posts its own cash book / wallet line keyed by `ledgerRefId`. A job
 * saved before payments existed had one aggregate line keyed by the job id; converting it
 * (repairJob.service.js#ensureV2) wraps that line in a `legacy` payment whose ledgerRefId is
 * the job id, so no money moves.
 */

const STATUSES = [
  'pending', // received at the counter, not looked at yet
  'diagnosing',
  'waiting_approval', // estimate sent, customer has to say yes
  'waiting_parts',
  'in_progress',
  'completed', // ready for pickup (repaired or not)
  'delivered',
  'cancelled',
];
const OPEN_STATUSES = ['pending', 'diagnosing', 'waiting_approval', 'waiting_parts', 'in_progress'];
const DEVICE_TYPES = [
  'mobile',
  'tablet',
  'laptop',
  'desktop',
  'printer',
  'tv',
  'console',
  'smartwatch',
  'camera',
  'appliance',
  'other',
];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const LOCK_TYPES = ['none', 'pin', 'password', 'pattern'];
const PAYMENT_METHODS = ['cash', 'bank', 'wallet', 'jazzcash', 'easypaisa'];

const itemSchema = new mongoose.Schema(
  {
    // 'part' comes out of inventory (productId set) or is a one-off bought for this job;
    // 'service' is labour / a fixed-price service line.
    kind: { type: String, enum: ['part', 'service'], required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', default: null },
    variantId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductVariant', default: null },
    batchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Batch', default: null },
    // The stock adjustment that took this part off the shelf — reversed when the line goes.
    adjustmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockAdjustment', default: null },
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0.0001 },
    unitPrice: { type: Number, default: 0, min: 0 },
    unitCost: { type: Number, default: 0, min: 0 },
    // A part bought outside for this job, paid from this account (posted as an expense).
    paidOutMethod: { type: String, enum: [...PAYMENT_METHODS, null], default: null },
    paidOutWallet: { type: String, trim: true },
    addedAt: { type: Date, default: Date.now },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true }
);

const paymentSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'cash' },
    walletType: { type: String, trim: true },
    date: { type: Date, default: Date.now },
    // 'refund' money handed back — posted as money out, subtracted from advanceAmount.
    kind: { type: String, enum: ['advance', 'payment', 'refund'], default: 'payment' },
    note: { type: String, trim: true },
    // Cash book / wallet entries for this payment are keyed by this id (the payment's own
    // _id, or the job's _id for a converted legacy payment).
    ledgerRefId: { type: mongoose.Schema.Types.ObjectId },
    legacy: { type: Boolean, default: false },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true }
);

const timelineSchema = new mongoose.Schema(
  {
    action: { type: String, trim: true }, // 'status' | 'note' | 'part' | 'payment' | 'edit' | 'created'
    status: { type: String, trim: true },
    note: { type: String, trim: true },
    at: { type: Date, default: Date.now },
    byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byUserName: { type: String, trim: true },
  },
  { _id: false }
);

// Lines and payments are addressed by id from the client (remove a part, delete a payment).
itemSchema.plugin(toJSON);
paymentSchema.plugin(toJSON);

const repairJobSchema = new mongoose.Schema(
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
    // RJ-1001, RJ-1002, … per organization. Missing on jobs saved before numbering existed.
    jobNumber: { type: String, trim: true, index: true },
    customerName: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },

    // ── Device ──
    deviceType: { type: String, enum: DEVICE_TYPES, default: 'mobile' },
    brand: { type: String, trim: true },
    deviceModel: {
      type: String,
      required: true,
      trim: true,
    },
    serialNumber: {
      type: String,
      trim: true,
    },
    color: {
      type: String,
      trim: true,
    },
    accessories: {
      type: String,
      trim: true,
    },
    lockType: { type: String, enum: LOCK_TYPES, default: 'none' },
    lockCode: { type: String, trim: true },
    // Checklist keys ticked at intake (e.g. 'screen_cracked', 'water_damage', 'powers_on').
    conditionChecks: [{ type: String, trim: true }],
    conditionNotes: { type: String, trim: true },

    // ── Problem / work ──
    problems: [{ type: String, trim: true }],
    issue: {
      type: String,
      required: true,
      trim: true,
    },
    diagnosis: { type: String, trim: true },
    internalNotes: { type: String, trim: true },
    status: {
      type: String,
      enum: STATUSES,
      default: 'pending',
    },
    // How a 'completed' job ended — 'not_repairable' still goes back to the customer.
    outcome: { type: String, enum: ['repaired', 'not_repairable', null], default: null },
    priority: { type: String, enum: PRIORITIES, default: 'normal' },
    dueDate: { type: Date, default: null },
    technician: {
      type: String,
      trim: true,
    },
    technicianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelReason: { type: String, trim: true },

    // ── Money ──
    estimatedCharges: { type: Number, default: 0, min: 0 },
    items: { type: [itemSchema], default: [] },
    discount: { type: Number, default: 0, min: 0 },
    // A lump repair cost taken from the repair stock balance (the parts ledger) rather than
    // itemised — the old "Parts / Repair Cost" field. Added to `cost`.
    directCost: { type: Number, default: 0, min: 0 },
    charges: {
      type: Number,
      default: 0,
      min: 0,
    },
    cost: {
      type: Number,
      default: 0,
      min: 0,
    },
    payments: { type: [paymentSchema], default: [] },
    advanceAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    // Payment method of the latest payment — the flat field older reports read.
    paymentMethod: {
      type: String,
      // 'jazzcash'/'easypaisa' kept for backward compatibility with existing records;
      // new records use 'wallet' + walletType to reference an actual created wallet.
      enum: PAYMENT_METHODS,
      default: 'cash',
    },
    // Wallet name when paymentMethod === 'wallet'
    walletType: {
      type: String,
      trim: true,
    },
    // 2 = payments[] is authoritative for money (see header comment).
    paymentsVersion: { type: Number, default: 1 },

    // ── Repair warranty ──
    warrantyDays: { type: Number, default: 0, min: 0 },
    warrantyUntil: { type: Date, default: null },

    timeline: { type: [timelineSchema], default: [] },

    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    completedAt: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },
    cancelledAt: { type: Date },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    // Salesman credited with this sale for commission purposes — see invoice.model.js's
    // identical field for why this is separate from createdBy.
    salesmanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesmanProfile',
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

repairJobSchema.plugin(toJSON);
repairJobSchema.plugin(paginate);

repairJobSchema.index({ organizationId: 1, branchId: 1, date: -1, status: 1 });
repairJobSchema.index({ organizationId: 1, branchId: 1, serialNumber: 1 });
repairJobSchema.index({ organizationId: 1, branchId: 1, phone: 1 });

repairJobSchema.statics.STATUSES = STATUSES;
repairJobSchema.statics.OPEN_STATUSES = OPEN_STATUSES;
repairJobSchema.statics.DEVICE_TYPES = DEVICE_TYPES;
repairJobSchema.statics.PRIORITIES = PRIORITIES;
repairJobSchema.statics.LOCK_TYPES = LOCK_TYPES;
repairJobSchema.statics.PAYMENT_METHODS = PAYMENT_METHODS;

const RepairJob = mongoose.model('RepairJob', repairJobSchema);

module.exports = RepairJob;
