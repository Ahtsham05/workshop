const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const voucherFeeItemSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FeeCategory',
    },
  },
  { _id: true }
);

const feeVoucherSchema = mongoose.Schema(
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
      index: true,
    },
    voucherNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolClass',
      required: true,
    },
    sectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Section',
    },
    feeStructureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FeeStructure',
    },
    month: {
      type: String,
      required: true,
      trim: true,
    },
    year: {
      type: Number,
      required: true,
    },
    feeItems: {
      type: [voucherFeeItemSchema],
      default: [],
    },
    totalAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    fine: {
      type: Number,
      default: 0,
      min: 0,
    },
    netAmount: {
      type: Number,
      min: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    paidDate: {
      type: Date,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank_transfer', 'cheque', 'online', 'other', 'credit_wallet', ''],
      default: '',
    },
    status: {
      type: String,
      enum: ['unpaid', 'partial', 'paid', 'overdue', 'cancelled'],
      default: 'unpaid',
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SchoolTransaction',
    },
    remarks: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

feeVoucherSchema.plugin(toJSON);
feeVoucherSchema.plugin(paginate);

// Recalculate netAmount before saving
feeVoucherSchema.pre('save', function (next) {
  this.totalAmount = (this.feeItems || []).reduce((sum, item) => sum + (item.amount || 0), 0);
  this.netAmount = this.totalAmount - (this.discount || 0) + (this.fine || 0);

  // Auto-update status
  if (this.paidAmount >= this.netAmount && this.netAmount > 0) {
    this.status = 'paid';
  } else if (this.paidAmount > 0) {
    this.status = 'partial';
  } else if (this.dueDate && new Date() > this.dueDate && this.status !== 'cancelled') {
    this.status = 'overdue';
  }

  next();
});

// Auto generate voucher number using an atomic per-org sequence counter.
// Using countDocuments() was racy — two concurrent saves could get the same
// count and both try to insert the same voucherNumber, causing E11000.
// findOneAndUpdate($inc) on a lightweight sequences collection is atomic.
feeVoucherSchema.pre('save', async function (next) {
  if (this.voucherNumber) return next(); // already assigned — skip

  try {
    const db = mongoose.connection.db;
    const seqKey = `voucher_${this.organizationId}`;
    const datePart = new Date().getFullYear().toString().slice(-2);

    // Retry up to 10 times in the (extremely rare) event of a concurrent
    // collision with a number that already exists in the collection.
    for (let attempt = 0; attempt < 10; attempt++) {
      const result = await db.collection('_sequences').findOneAndUpdate(
        { _id: seqKey },
        { $inc: { seq: 1 } },
        { upsert: true, returnDocument: 'after' }
      );

      // Mongo driver shape can vary by version:
      // - direct document with { seq }
      // - wrapper with { value: { seq } }
      const seq = Number(result?.seq ?? result?.value?.seq);
      if (!Number.isFinite(seq) || seq <= 0) {
        // Counter returned an invalid value; retry next attempt.
        continue;
      }
      // Numeric-only human-friendly voucher number: YY + 6-digit sequence
      const candidate = `${datePart}${String(seq).padStart(6, '0')}`;

      // Guard: make sure no existing doc already has this number
      const exists = await this.constructor.exists({ voucherNumber: candidate });
      if (!exists) {
        this.voucherNumber = candidate;
        return next();
      }
      // Collision (e.g. sequences collection was out of sync) — loop and fetch next seq
    }

    // Ultimate fallback: timestamp suffix — always numeric and unique-enough
    this.voucherNumber = `${datePart}${Date.now().toString().slice(-6)}`;
    next();
  } catch (err) {
    next(err);
  }
});

feeVoucherSchema.index({ organizationId: 1, branchId: 1, studentId: 1 });
feeVoucherSchema.index({ organizationId: 1, branchId: 1, status: 1 });
feeVoucherSchema.index({ organizationId: 1, branchId: 1, month: 1, year: 1 });
// Prevent duplicate vouchers for same student+month+year
feeVoucherSchema.index(
  { organizationId: 1, studentId: 1, month: 1, year: 1 },
  { unique: true, sparse: true }
);

const FeeVoucher = mongoose.model('FeeVoucher', feeVoucherSchema);

module.exports = FeeVoucher;
