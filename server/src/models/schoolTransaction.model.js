const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const schoolTransactionSchema = mongoose.Schema(
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
    type: {
      type: String,
      enum: ['INCOME', 'EXPENSE'],
      required: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FeeCategory',
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    // Flexible reference: can be studentId, teacherId, voucherId, etc.
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    referenceModel: {
      type: String,
      enum: ['Student', 'Teacher', 'FeeVoucher', 'SchoolFee', 'SchoolRecurringExpense', null],
    },
    description: {
      type: String,
      trim: true,
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'bank_transfer', 'cheque', 'online', 'other'],
      default: 'cash',
    },
    // Free-text reference note (invoice/receipt/cheque number) — distinct from the
    // polymorphic referenceId/referenceModel pointer above, which links to another
    // internal document rather than an external paper trail.
    reference: {
      type: String,
      trim: true,
    },
    vendor: {
      type: String,
      trim: true,
    },
    // Auto-generated display number for EXPENSE-type rows only (e.g. EXP-000001) —
    // this row's own individual tracking number, always unique.
    expenseNumber: {
      type: String,
      sparse: true,
    },
    // Shared batch label (e.g. BEV-000003) set only when this row was recorded
    // together with others in one "Bulk Expense Voucher" entry — lets several
    // line items entered in one sitting be viewed/printed as a single voucher.
    // Null for a standalone expense recorded on its own.
    voucherNumber: {
      type: String,
      sparse: true,
      index: true,
    },
    // Auto-generated recurring cycles are recorded unpaid so they show up in the
    // Expenses tab immediately without posting to the accounting ledger. The
    // ledger entry is only created once someone confirms payment (see
    // markTransactionAsPaid in schoolTransaction.service.js) — mirrors the same
    // staging pattern used by the retail Expense/RecurringExpense modules.
    isPaid: {
      type: Boolean,
      default: true,
    },
    paidAt: {
      type: Date,
      default: null,
    },
    paidBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

schoolTransactionSchema.plugin(toJSON);
schoolTransactionSchema.plugin(paginate);

// Composite indexes for efficient dashboard aggregations
schoolTransactionSchema.index({ organizationId: 1, branchId: 1, date: -1 });
schoolTransactionSchema.index({ organizationId: 1, branchId: 1, type: 1, date: -1 });
schoolTransactionSchema.index({ organizationId: 1, branchId: 1, categoryId: 1, date: -1 });
schoolTransactionSchema.index({ organizationId: 1, expenseNumber: 1 }, { unique: true, sparse: true });
schoolTransactionSchema.index({ referenceId: 1, referenceModel: 1 });

async function getMaxExpenseSequence(organizationId, branchId) {
  const orgId = new mongoose.Types.ObjectId(String(organizationId));
  const branchObjId = new mongoose.Types.ObjectId(String(branchId));

  const rows = await mongoose.models.SchoolTransaction.aggregate([
    {
      $match: {
        organizationId: orgId,
        branchId: branchObjId,
        expenseNumber: { $regex: /^EXP-\d+$/ },
      },
    },
    {
      $project: {
        seq: {
          $convert: {
            input: { $substrBytes: ['$expenseNumber', 4, { $subtract: [{ $strLenBytes: '$expenseNumber' }, 4] }] },
            to: 'int',
            onError: 0,
            onNull: 0,
          },
        },
      },
    },
    { $group: { _id: null, maxSeq: { $max: '$seq' } } },
  ]);

  return rows[0]?.maxSeq || 0;
}

schoolTransactionSchema.statics.generateNextExpenseNumber = async function generateNextExpenseNumber(organizationId, branchId) {
  const seqId = `schoolExpense_${organizationId}_${branchId}`;
  const sequences = mongoose.connection.db.collection('_sequences');

  let doc = await sequences.findOne({ _id: seqId });
  if (!doc) {
    const maxExisting = await getMaxExpenseSequence(organizationId, branchId);
    await sequences.updateOne(
      { _id: seqId },
      { $setOnInsert: { seq: maxExisting } },
      { upsert: true },
    );
  }

  const result = await sequences.findOneAndUpdate(
    { _id: seqId },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', includeResultMetadata: false },
  );

  const seq = Number(result?.seq);
  if (!Number.isFinite(seq) || seq <= 0) {
    return `EXP-${Date.now().toString().slice(-8)}`;
  }

  return `EXP-${String(seq).padStart(6, '0')}`;
};

async function getMaxVoucherSequence(organizationId, branchId) {
  const orgId = new mongoose.Types.ObjectId(String(organizationId));
  const branchObjId = new mongoose.Types.ObjectId(String(branchId));

  const rows = await mongoose.models.SchoolTransaction.aggregate([
    {
      $match: {
        organizationId: orgId,
        branchId: branchObjId,
        voucherNumber: { $regex: /^BEV-\d+$/ },
      },
    },
    {
      $project: {
        seq: {
          $convert: {
            input: { $substrBytes: ['$voucherNumber', 4, { $subtract: [{ $strLenBytes: '$voucherNumber' }, 4] }] },
            to: 'int',
            onError: 0,
            onNull: 0,
          },
        },
      },
    },
    { $group: { _id: null, maxSeq: { $max: '$seq' } } },
  ]);

  return rows[0]?.maxSeq || 0;
}

schoolTransactionSchema.statics.generateNextVoucherNumber = async function generateNextVoucherNumber(organizationId, branchId) {
  const seqId = `schoolExpenseVoucher_${organizationId}_${branchId}`;
  const sequences = mongoose.connection.db.collection('_sequences');

  let doc = await sequences.findOne({ _id: seqId });
  if (!doc) {
    const maxExisting = await getMaxVoucherSequence(organizationId, branchId);
    await sequences.updateOne(
      { _id: seqId },
      { $setOnInsert: { seq: maxExisting } },
      { upsert: true },
    );
  }

  const result = await sequences.findOneAndUpdate(
    { _id: seqId },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', includeResultMetadata: false },
  );

  const seq = Number(result?.seq);
  if (!Number.isFinite(seq) || seq <= 0) {
    return `BEV-${Date.now().toString().slice(-8)}`;
  }

  return `BEV-${String(seq).padStart(6, '0')}`;
};

schoolTransactionSchema.pre('save', async function (next) {
  if (this.isNew && this.type === 'EXPENSE' && !this.expenseNumber) {
    try {
      this.expenseNumber = await this.constructor.generateNextExpenseNumber(this.organizationId, this.branchId);
    } catch (err) {
      return next(err);
    }
  }
  next();
});

const SchoolTransaction = mongoose.model('SchoolTransaction', schoolTransactionSchema);

module.exports = SchoolTransaction;
