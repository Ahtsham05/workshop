/**
 * Settlement (how much of a customer invoice is actually paid off) in ONE place, so the
 * list filters, the sort keys, the payment allocator and the client all agree. Mirrors
 * utils/purchaseSettlement.js field-for-field — see that file for the full rationale.
 *
 * An invoice is settled from two independent sources:
 *   1. `paidAmount`      — money collected while recording the sale itself (this is the leg
 *                          that owns the invoice's own Cash Book/Wallet entry, see
 *                          invoice.service.js's syncInvoiceCashAndWalletEntries).
 *   2. `allocatedAmount` — money applied afterwards by a CustomerPayment (see
 *                          customerPayment.service.js). That payment owns its own Customer
 *                          Ledger + Cash Book/Wallet legs, so it must never be folded back
 *                          into `paidAmount` or the same rupee would be banked twice.
 *
 * settledAmount = paidAmount + allocatedAmount, and remainingAmount is what the customer
 * still owes on this invoice. Nothing here is stored as a derived column — `allocatedAmount`
 * is the only new persisted number; everything else is computed, which keeps legacy invoices
 * (written before allocations existed) correct with no backfill.
 */

const SETTLEMENT_EPSILON = 0.001;

/** Milliseconds in a day — "due soon" window math. */
const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_DAYS = 7;

const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid', 'overpaid'];
const DUE_STATUSES = ['overdue', 'due_today', 'due_soon', 'not_due', 'no_due_date', 'settled'];

const toNumber = (value) => Number(value || 0);

/** Settlement status from raw amounts — the single definition every layer reuses. */
const resolveSettlementStatus = (total, settledAmount) => {
  const totalAmount = toNumber(total);
  const settled = toNumber(settledAmount);
  if (settled > totalAmount + SETTLEMENT_EPSILON) return 'overpaid';
  if (totalAmount > 0 && settled >= totalAmount - SETTLEMENT_EPSILON) return 'paid';
  if (settled > SETTLEMENT_EPSILON) return 'partial';
  return totalAmount <= 0 ? 'paid' : 'unpaid';
};

/** Due bucket for an invoice — only meaningful while something is still owed. */
const resolveDueStatus = (dueDate, remainingAmount, now = new Date()) => {
  if (toNumber(remainingAmount) <= SETTLEMENT_EPSILON) return 'settled';
  if (!dueDate) return 'no_due_date';
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return 'no_due_date';

  const endOfDue = new Date(due);
  endOfDue.setHours(23, 59, 59, 999);
  if (endOfDue.getTime() < now.getTime()) return 'overdue';

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (due.getTime() <= startOfToday.getTime() + DAY_MS - 1) return 'due_today';
  if (due.getTime() <= startOfToday.getTime() + DUE_SOON_DAYS * DAY_MS) return 'due_soon';
  return 'not_due';
};

/**
 * Full settlement snapshot for one invoice document (lean object or Mongoose doc).
 * @param {Object} invoice
 * @returns {{settledAmount:number, remainingAmount:number, settlementStatus:string, dueStatus:string}}
 */
const resolveInvoiceSettlement = (invoice, now = new Date()) => {
  const total = toNumber(invoice?.total);
  const settledAmount = toNumber(invoice?.paidAmount) + toNumber(invoice?.allocatedAmount);
  const remainingAmount = total - settledAmount;
  return {
    settledAmount,
    remainingAmount,
    settlementStatus: resolveSettlementStatus(total, settledAmount),
    dueStatus: resolveDueStatus(invoice?.dueDate, remainingAmount, now),
  };
};

/**
 * The same math as an aggregation stage, so the list endpoint can filter AND sort on
 * settlement without storing denormalized columns. Keep in lockstep with the JS version
 * above — they are two encodings of one rule.
 */
const buildSettlementAddFieldsStage = (now = new Date()) => {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dueSoonCutoff = new Date(startOfToday.getTime() + DUE_SOON_DAYS * DAY_MS);

  return {
    $addFields: {
      settledAmount: { $add: [{ $ifNull: ['$paidAmount', 0] }, { $ifNull: ['$allocatedAmount', 0] }] },
      remainingAmount: {
        $subtract: [
          { $ifNull: ['$total', 0] },
          { $add: [{ $ifNull: ['$paidAmount', 0] }, { $ifNull: ['$allocatedAmount', 0] }] },
        ],
      },
      settlementStatus: {
        $let: {
          vars: {
            total: { $ifNull: ['$total', 0] },
            settled: { $add: [{ $ifNull: ['$paidAmount', 0] }, { $ifNull: ['$allocatedAmount', 0] }] },
          },
          in: {
            $switch: {
              branches: [
                { case: { $gt: ['$$settled', { $add: ['$$total', SETTLEMENT_EPSILON] }] }, then: 'overpaid' },
                {
                  case: {
                    $and: [
                      { $gt: ['$$total', 0] },
                      { $gte: ['$$settled', { $subtract: ['$$total', SETTLEMENT_EPSILON] }] },
                    ],
                  },
                  then: 'paid',
                },
                { case: { $gt: ['$$settled', SETTLEMENT_EPSILON] }, then: 'partial' },
                { case: { $lte: ['$$total', 0] }, then: 'paid' },
              ],
              default: 'unpaid',
            },
          },
        },
      },
      dueStatus: {
        $let: {
          vars: {
            remaining: {
              $subtract: [
                { $ifNull: ['$total', 0] },
                { $add: [{ $ifNull: ['$paidAmount', 0] }, { $ifNull: ['$allocatedAmount', 0] }] },
              ],
            },
          },
          in: {
            $switch: {
              branches: [
                { case: { $lte: ['$$remaining', SETTLEMENT_EPSILON] }, then: 'settled' },
                { case: { $eq: [{ $ifNull: ['$dueDate', null] }, null] }, then: 'no_due_date' },
                { case: { $lt: ['$dueDate', now] }, then: 'overdue' },
                { case: { $lt: ['$dueDate', new Date(startOfToday.getTime() + DAY_MS)] }, then: 'due_today' },
                { case: { $lte: ['$dueDate', dueSoonCutoff] }, then: 'due_soon' },
              ],
              default: 'not_due',
            },
          },
        },
      },
    },
  };
};

module.exports = {
  SETTLEMENT_EPSILON,
  PAYMENT_STATUSES,
  DUE_STATUSES,
  resolveSettlementStatus,
  resolveDueStatus,
  resolveInvoiceSettlement,
  buildSettlementAddFieldsStage,
};
