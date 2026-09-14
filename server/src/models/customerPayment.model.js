const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

/**
 * One invoice this payment was applied to. `amount` is what THIS payment put against THAT
 * invoice — a payment can cover several invoices (FIFO spill-over) and an invoice can be
 * covered by several payments (instalments), so allocations are many-to-many by nature.
 * The invoice-side snapshot fields are denormalized so the allocation stays readable in the
 * payment's own history without re-fetching (and re-deriving) every invoice. Mirrors
 * supplierPayment.model.js's allocationSchema.
 */
const allocationSchema = new mongoose.Schema(
  {
    invoice: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice', required: true },
    invoiceNumber: { type: String, trim: true },
    invoiceDate: { type: Date },
    dueDate: { type: Date, default: null },
    // Invoice total and what was still owed on it the moment this allocation was made —
    // a point-in-time snapshot for the audit trail, NOT a live figure.
    invoiceTotal: { type: Number, default: 0 },
    outstandingBefore: { type: Number, default: 0 },
    amount: { type: Number, required: true, min: 0 },
    // Set when this allocation was added after the payment was first posted (applying the
    // payment's leftover credit to a newer invoice) — money already came in then, so this
    // never moves cash again, it only re-labels where the existing payment sits.
    appliedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

allocationSchema.plugin(toJSON);

/** Immutable "who did what to this payment" trail — appended to, never rewritten. */
const paymentHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['created', 'allocated', 'reallocated', 'credit_applied', 'voided', 'refunded'],
      required: true,
    },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String, trim: true },
    details: { type: String, trim: true },
    amount: { type: Number },
  },
  { _id: true }
);

paymentHistorySchema.plugin(toJSON);

/**
 * A standalone "money in from a customer" document that settles one or more invoices — the
 * piece the app was missing: before this, an invoice could only be paid at the moment it was
 * recorded (Invoice.paidAmount) or as an untethered Customer Ledger entry that no invoice
 * knew about. Mirrors supplierPayment.model.js's shape exactly (customer instead of supplier,
 * Invoice instead of Purchase).
 *
 * Money movement is NOT owned here. Exactly one Customer Ledger entry is created per payment
 * (`customerLedgerEntryId`) and that entry owns the Cash Book/Wallet/accounts legs. This
 * document owns the *allocation* — which invoices the money paid off — plus whatever is left
 * over (`unappliedAmount`), which is the customer's advance/credit balance.
 */
const customerPaymentSchema = new mongoose.Schema(
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
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    paymentNumber: { type: String, trim: true, index: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
    // Denormalized so a voided payment still reads correctly if the customer is renamed.
    customerName: { type: String, trim: true },
    /**
     * 'payment'       — the customer paid us (money in, the normal case).
     * 'refund'        — we gave money back to the customer, which eats into the credit
     *                   balance their earlier over-payments created.
     * 'return_credit' — goods came back from the customer, so their invoice is worth less.
     *                   Carries no cash movement of its own (the SalesReturn already posted
     *                   the ledger credit and any cash refund); this record exists so the
     *                   credit lands on the ORIGINAL invoice instead of floating on the
     *                   account, and so it can be released if the return is undone. Mirrors
     *                   SupplierPayment's identical 'return_credit' direction.
     */
    direction: { type: String, enum: ['payment', 'refund', 'return_credit'], default: 'payment', index: true },
    paymentDate: { type: Date, default: Date.now, index: true },
    amount: { type: Number, required: true, min: 0.01 },
    // Which account the money moved through. 'wallet' pairs with walletType (a Bank Account
    // name) — same two-bucket convention invoices use, so the Cash Book/Wallet split is
    // identical no matter which screen recorded the payment.
    paymentMethod: { type: String, enum: ['cash', 'wallet'], default: 'cash' },
    walletType: { type: String, trim: true },
    // Cheque number, bank transfer id, or whatever the business writes on the receipt.
    referenceNumber: { type: String, trim: true },
    notes: { type: String, trim: true },
    /**
     * How `allocations` was decided:
     *   fifo      — oldest invoice first (the default; what most shops mean by "just pay it off")
     *   due_date  — earliest due date first, undated invoices last
     *   manual    — the user typed an amount per invoice
     *   reference — matched to specific invoice numbers the user named
     *   none      — pure advance, applied to nothing yet
     */
    allocationMode: {
      type: String,
      enum: ['fifo', 'due_date', 'manual', 'reference', 'none'],
      default: 'fifo',
    },
    allocations: { type: [allocationSchema], default: [] },
    // Sum of allocations[].amount, kept in step by the service on every mutation.
    allocatedTotal: { type: Number, default: 0, min: 0 },
    // amount - allocatedTotal: money sitting with us as the customer's advance/credit
    // balance, available to apply to a future invoice (see applyCredit).
    unappliedAmount: { type: Number, default: 0, min: 0 },
    // 'void' keeps the record (and its history) but reverses every effect it had: the
    // ledger entry is deleted, allocations are handed back to their invoices.
    status: { type: String, enum: ['posted', 'void'], default: 'posted', index: true },
    // The one Customer Ledger entry that carries this payment's cash/wallet movement.
    customerLedgerEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerLedger' },
    voidedAt: { type: Date },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voidReason: { type: String, trim: true },
    history: { type: [paymentHistorySchema], default: [] },
  },
  { timestamps: true }
);

customerPaymentSchema.plugin(toJSON);
customerPaymentSchema.plugin(paginate);

// The payment list (newest first, per customer) and the per-invoice payment history both
// scan on these.
customerPaymentSchema.index({ organizationId: 1, branchId: 1, paymentDate: -1 });
customerPaymentSchema.index({ organizationId: 1, branchId: 1, customer: 1, status: 1, paymentDate: -1 });
customerPaymentSchema.index({ 'allocations.invoice': 1 });

const CustomerPayment = mongoose.model('CustomerPayment', customerPaymentSchema);

module.exports = CustomerPayment;
