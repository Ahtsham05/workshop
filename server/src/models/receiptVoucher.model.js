const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * A single line on a Receipt Voucher — one payer/category/amount. Mirrors
 * `paymentVoucher.model.js`'s line shape exactly, just for money coming IN: a voucher can
 * carry multiple lines so one bank deposit can cover several sources at once (e.g. a
 * customer payment + misc rental income in one voucher). `customerLedgerEntryId` is filled
 * in by the service right after `customerLedgerService.createLedgerEntry` succeeds, so a
 * delete can find and reverse exactly the record this line produced. 'income' lines have no
 * equivalent secondary mirror record (there's no generic "Income" collection in this app,
 * unlike Expense for Payment Voucher's expense lines) — they only ever touch Cash Book +
 * the Wallet ledger.
 */
const receiptVoucherLineSchema = new mongoose.Schema(
  {
    sourceType: {
      type: String,
      enum: ['customer', 'income'],
      required: true,
    },
    // Income category name when sourceType === 'income' (free text, matches how Payment
    // Voucher's expense category is a plain string, not a foreign key).
    category: {
      type: String,
      trim: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
    },
    // Denormalized customer name so the line stays readable if the customer is later renamed.
    customerName: {
      type: String,
      trim: true,
    },
    // Display name of who paid: the customer's name, or the income category label.
    payerName: {
      type: String,
      required: true,
      trim: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    description: {
      type: String,
      trim: true,
    },
    // Set after customerLedgerService.createLedgerEntry succeeds (sourceType === 'customer' only).
    customerLedgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerLedger',
    },
  },
  { _id: true }
);

// Lines are serialized as part of the parent voucher's JSON, but Mongoose only applies a
// subdocument schema's own toJSON transform, not the parent's — without this, each line
// would keep a raw `_id` instead of the `id` the client expects.
receiptVoucherLineSchema.plugin(toJSON);

/**
 * A standalone "money in" voucher (Tally/QuickBooks-style Receipt Voucher) — receives money
 * from one or more customers and/or miscellaneous income sources directly into a Bank
 * Account (Wallet) in a single voucher. Each line drives its own Cash Book entry + Wallet
 * balance movement (income lines) or is posted straight through
 * `customerLedgerService.createLedgerEntry` (customer lines, which already handles its own
 * wallet/cash-book/accounts sync) — mirrors `paymentVoucher.model.js` exactly, just for the
 * opposite cash direction.
 */
const receiptVoucherSchema = new mongoose.Schema(
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
    voucherNumber: {
      type: String,
      sparse: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    bankAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Wallet',
      required: true,
    },
    // Denormalized wallet.type at time of receipt so the voucher stays readable even if the
    // bank account is later renamed/deleted.
    bankAccountName: {
      type: String,
      trim: true,
    },
    lines: {
      type: [receiptVoucherLineSchema],
      validate: {
        validator: (lines) => Array.isArray(lines) && lines.length > 0,
        message: 'A receipt voucher needs at least one line',
      },
    },
    // Sum of all lines' amounts — stored for fast list/report display, recomputed by the
    // service on every create (never trusted from client input).
    totalAmount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    reference: {
      type: String,
      trim: true,
    },
    notes: {
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

receiptVoucherSchema.plugin(toJSON);
receiptVoucherSchema.plugin(paginate);

receiptVoucherSchema.index({ organizationId: 1, branchId: 1, date: -1 });
receiptVoucherSchema.index({ organizationId: 1, voucherNumber: 1 }, { unique: true, sparse: true });

async function getMaxReceiptVoucherSequence(organizationId, branchId) {
  const orgId = new mongoose.Types.ObjectId(String(organizationId));
  const branchObjId = new mongoose.Types.ObjectId(String(branchId));

  const rows = await mongoose.models.ReceiptVoucher.aggregate([
    {
      $match: {
        organizationId: orgId,
        branchId: branchObjId,
        voucherNumber: { $regex: /^RCT-\d+$/ },
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

receiptVoucherSchema.statics.generateNextVoucherNumber = async function generateNextVoucherNumber(organizationId, branchId) {
  const seqId = `receipt_voucher_${organizationId}_${branchId}`;
  const sequences = mongoose.connection.db.collection('_sequences');

  let doc = await sequences.findOne({ _id: seqId });
  if (!doc) {
    const maxExisting = await getMaxReceiptVoucherSequence(organizationId, branchId);
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
    return `RCT-${Date.now().toString().slice(-8)}`;
  }

  return `RCT-${String(seq).padStart(6, '0')}`;
};

receiptVoucherSchema.pre('save', async function (next) {
  if (this.isNew && !this.voucherNumber) {
    try {
      this.voucherNumber = await this.constructor.generateNextVoucherNumber(this.organizationId, this.branchId);
    } catch (err) {
      return next(err);
    }
  }
  next();
});

const ReceiptVoucher = mongoose.model('ReceiptVoucher', receiptVoucherSchema);

module.exports = ReceiptVoucher;
