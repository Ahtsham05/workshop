const mongoose = require('mongoose');
const { paginate, toJSON } = require('./plugins');

const expenseSchema = new mongoose.Schema({
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
  expenseNumber: {
    type: String,
    sparse: true,
  },
  category: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'Bank Transfer', 'Card', 'Cheque', 'Wallet'],
    default: 'Cash',
  },
  // Wallet name when paymentMethod === 'Wallet'
  walletType: {
    type: String,
    trim: true,
  },
  date: {
    type: Date,
    required: true,
    default: Date.now,
  },
  vendor: {
    type: String,
  },
  reference: {
    type: String,
  },
  referenceId: {
    type: mongoose.Schema.Types.ObjectId,
    index: true,
  },
  referenceModel: {
    type: String,
    trim: true,
  },
  notes: {
    type: String,
  },
  attachments: [{
    url: { type: String },
    publicId: { type: String },
    filename: { type: String },
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, {
  timestamps: true,
});

expenseSchema.plugin(toJSON);
expenseSchema.plugin(paginate);

expenseSchema.index({ organizationId: 1, branchId: 1 });
expenseSchema.index({ organizationId: 1, expenseNumber: 1 }, { unique: true, sparse: true });
expenseSchema.index({ referenceId: 1, referenceModel: 1 });

async function getMaxExpenseSequence(organizationId, branchId) {
  const orgId = new mongoose.Types.ObjectId(String(organizationId));
  const branchObjId = new mongoose.Types.ObjectId(String(branchId));

  const rows = await mongoose.models.Expense.aggregate([
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

expenseSchema.statics.generateNextExpenseNumber = async function generateNextExpenseNumber(organizationId, branchId) {
  const seqId = `expense_${organizationId}_${branchId}`;
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
    { returnDocument: 'after' },
  );

  const seq = Number(result?.seq);
  if (!Number.isFinite(seq) || seq <= 0) {
    return `EXP-${Date.now().toString().slice(-8)}`;
  }

  return `EXP-${String(seq).padStart(6, '0')}`;
};

expenseSchema.pre('save', async function (next) {
  if (this.isNew && !this.expenseNumber) {
    try {
      this.expenseNumber = await this.constructor.generateNextExpenseNumber(
        this.organizationId,
        this.branchId,
      );
    } catch (err) {
      return next(err);
    }
  }
  next();
});

const Expense = mongoose.model('Expense', expenseSchema);

module.exports = Expense;
