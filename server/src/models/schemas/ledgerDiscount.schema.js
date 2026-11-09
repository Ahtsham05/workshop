const mongoose = require('mongoose');

/**
 * Why a ledger discount was given. Same list on both sides of the books:
 *   customer ledger → "Discount Allowed"  (we let the customer pay less; an expense to us)
 *   supplier ledger → "Discount Received" (the supplier let us pay less; income to us)
 */
const LEDGER_DISCOUNT_REASONS = Object.freeze([
  'cash_discount', // paid in cash / on the spot
  'early_payment', // paid before the due date
  'settlement', // "leave the rest" — balance settled for less
  'volume_rebate', // rebate on volume / target bonus
  'round_off', // small leftover rounded off
  'goodwill', // goodwill / relationship / complaint
  'bad_debt', // written off as not recoverable
  'other',
]);

/**
 * Details of a discount ledger row (transactionType discount_allowed / discount_received).
 * The amount itself lives in the row's debit/credit like every other ledger row, so running
 * balances, statements and exports need nothing special — this block only explains it.
 */
const ledgerDiscountSchema = new mongoose.Schema(
  {
    reason: { type: String, enum: LEDGER_DISCOUNT_REASONS, default: 'cash_discount' },
    // The % the user typed, when they typed one (kept for the register/receipt), and the
    // amount it was worked out on (outstanding balance or the bill).
    percent: { type: Number, min: 0, max: 100 },
    baseAmount: { type: Number, min: 0 },
    // The payment row this discount was given together with ("received 9,950 + 50 discount").
    // Deleting that payment deletes this discount too.
    linkedEntryId: { type: mongoose.Schema.Types.ObjectId },
    linkedAmount: { type: Number, min: 0 },
    // Given above the business's discount limit by someone allowed to approve that.
    overLimit: { type: Boolean, default: false },
    approvalNote: { type: String, trim: true, maxlength: 300 },
  },
  { _id: false }
);

module.exports = { ledgerDiscountSchema, LEDGER_DISCOUNT_REASONS };
