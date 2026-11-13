const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * A single distribution line on a Payment Voucher — one payee/category/amount. A voucher
 * can carry multiple lines so one bank withdrawal can cover several payees at once (e.g.
 * Rent + a supplier bill + petty cash in one voucher), like Tally/QuickBooks multi-line
 * payment vouchers. `expenseId`/`supplierLedgerEntryId` are filled in by the service right
 * after the corresponding Expense/SupplierLedger record is created, so a delete can find
 * and reverse exactly the records this line produced.
 */
const paymentVoucherLineSchema = new mongoose.Schema(
  {
    payeeType: {
      type: String,
      // 'customer' = cash handed to a customer (refund of their advance, or money lent/paid out
      // to them) — posted as a Payment Made (debit) on their Customer Ledger.
      // 'employee' = salary or an advance paid to a staff member — posted on their Employee
      // Ledger (salary also lands in Expenses as a staff cost; an advance is money they owe back).
      enum: ['expense', 'supplier', 'customer', 'employee', 'other'],
      required: true,
    },
    // Expense category name when payeeType === 'expense' (free text — Expense.category
    // itself is a plain string, not a foreign key).
    category: {
      type: String,
      trim: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
    },
    // Denormalized supplier name so the line stays readable if the supplier is later renamed.
    supplierName: {
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
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Employee',
    },
    // Denormalized employee name so the line stays readable if the employee is later renamed.
    employeeName: {
      type: String,
      trim: true,
    },
    // What the money paid to an employee is: earned salary (capped at what is payable, counted as
    // a staff expense) or an advance / loan (they owe it back — recovered from salary or received
    // back on a Receipt Voucher).
    employeePurpose: {
      type: String,
      enum: ['salary', 'advance'],
    },
    // Display name of who was paid: the expense category label, the supplier's or customer's
    // name, or the free-text payee name entered for 'other'.
    payeeName: {
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
    // Set after createExpense succeeds (payeeType === 'expense' only).
    expenseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Expense',
    },
    // Set after supplierLedgerService.createLedgerEntry succeeds (payeeType === 'supplier' only).
    supplierLedgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SupplierLedger',
    },
    // Set after customerLedgerService.createLedgerEntry succeeds (payeeType === 'customer' only).
    customerLedgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomerLedger',
    },
    // Set after employeeLedgerService.postVoucherEntry succeeds (payeeType === 'employee' only).
    employeeLedgerEntryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EmployeeLedger',
    },
    // Advance credit (unapplied CustomerPayment money) this customer payout used up, per source
    // payment — a payout first returns money the customer had paid us in advance, so that credit
    // can't later be applied to an invoice too. Given back exactly as drawn when the line is
    // reversed (edit / delete).
    creditDraws: {
      type: [
        new mongoose.Schema(
          {
            paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerPayment', required: true },
            amount: { type: Number, required: true, min: 0 },
          },
          { _id: false }
        ),
      ],
      default: undefined,
    },
    // Settlement discount given with this line (supplier lines — Discount Received) — its own ledger row, linked to the
    // payment row (services/ledgerDiscount.service.js). Cash moved = amount; settled = amount +
    // discountAmount. Removed / re-posted together with the line.
    discountAmount: { type: Number, min: 0, default: 0 },
    discountReason: { type: String, trim: true },
    discountPercent: { type: Number, min: 0, max: 100 },
    discountBaseAmount: { type: Number, min: 0 },
    discountApprovalNote: { type: String, trim: true },
    discountNote: { type: String, trim: true },
    discountLedgerEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'SupplierLedger' },
  },
  { _id: true }
);

// Lines are serialized as part of the parent voucher's JSON, but Mongoose only applies a
// subdocument schema's own toJSON transform, not the parent's — without this, each line
// would keep a raw `_id` instead of the `id` the client (and every other list in this app)
// expects.
paymentVoucherLineSchema.plugin(toJSON);

/**
 * A standalone "money out" voucher (Tally/QuickBooks-style Payment Voucher) — pays one or
 * more expense categories, suppliers, and/or miscellaneous payees directly from a Bank
 * Account (Wallet) in a single voucher, independent of the existing bill-payment/
 * commission-payment/expense-form flows. Each line drives its own Cash Book entry + Wallet
 * balance movement (expense/other lines) or is posted straight through
 * `supplierLedgerService.createLedgerEntry` (supplier lines, which already handles its own
 * wallet/cash-book/accounts sync) — so the bank account's balance drops by the sum of all
 * lines even though there's no single combined ledger row. Same multi-leg-per-document
 * precedent as `billPayment.model.js`.
 */
const paymentVoucherSchema = new mongoose.Schema(
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
    // Denormalized wallet.type at time of payment so the voucher stays readable even if
    // the bank account is later renamed/deleted — same reasoning as agentBill's customerName.
    bankAccountName: {
      type: String,
      trim: true,
    },
    lines: {
      type: [paymentVoucherLineSchema],
      validate: {
        validator: (lines) => Array.isArray(lines) && lines.length > 0,
        message: 'A payment voucher needs at least one line',
      },
    },
    // Sum of all lines' amounts — stored for fast list/report display, recomputed by the
    // service on every create (never trusted from client input).
    // Sum of line discounts (no cash) — amount settled on ledgers = totalAmount + totalDiscount.
    totalDiscount: { type: Number, min: 0, default: 0 },
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
    // Set only when the voucher is edited after creation.
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

paymentVoucherSchema.plugin(toJSON);
paymentVoucherSchema.plugin(paginate);

paymentVoucherSchema.index({ organizationId: 1, branchId: 1, date: -1 });
paymentVoucherSchema.index({ organizationId: 1, voucherNumber: 1 }, { unique: true, sparse: true });

async function getMaxPaymentVoucherSequence(organizationId, branchId) {
  const orgId = new mongoose.Types.ObjectId(String(organizationId));
  const branchObjId = new mongoose.Types.ObjectId(String(branchId));

  const rows = await mongoose.models.PaymentVoucher.aggregate([
    {
      $match: {
        organizationId: orgId,
        branchId: branchObjId,
        voucherNumber: { $regex: /^PMT-\d+$/ },
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

paymentVoucherSchema.statics.generateNextVoucherNumber = async function generateNextVoucherNumber(organizationId, branchId) {
  const seqId = `payment_voucher_${organizationId}_${branchId}`;
  const sequences = mongoose.connection.db.collection('_sequences');

  let doc = await sequences.findOne({ _id: seqId });
  if (!doc) {
    const maxExisting = await getMaxPaymentVoucherSequence(organizationId, branchId);
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
    return `PMT-${Date.now().toString().slice(-8)}`;
  }

  return `PMT-${String(seq).padStart(6, '0')}`;
};

paymentVoucherSchema.pre('save', async function (next) {
  if (this.isNew && !this.voucherNumber) {
    try {
      this.voucherNumber = await this.constructor.generateNextVoucherNumber(this.organizationId, this.branchId);
    } catch (err) {
      return next(err);
    }
  }
  next();
});

const PaymentVoucher = mongoose.model('PaymentVoucher', paymentVoucherSchema);

module.exports = PaymentVoucher;
