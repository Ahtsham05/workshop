/**
 * Helpers for entering a pile of paper invoices into New Purchase / New Invoice without
 * entering one twice:
 *
 *  - `navigateRecords` — step back/forward through the saved documents one full record at
 *    a time (newest first), by the order they were entered or by their own date.
 *  - `findPossibleDuplicatePurchases` / `findPossibleDuplicateInvoices` — what the screen
 *    checks just before saving: the same supplier bill number, or the same party + amount
 *    on (nearly) the same day.
 *
 * Both are read-only and branch-scoped by the caller's `match`/scope.
 */
const mongoose = require('mongoose');
const { Purchase, Invoice } = require('../models');
const { escapeRegex } = require('../utils/productMatchKey');
const { parseBusinessDateTime, toBusinessCalendarDate, startOfBusinessDay, endOfBusinessDay } = require('../utils/businessTimezone');

const DAY_MS = 24 * 60 * 60 * 1000;
const toOid = (id) => (id && mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(String(id)) : null);

/**
 * One saved document at a position in the list, newest first.
 *
 * @param {Object} args
 * @param {import('mongoose').Model} args.Model
 * @param {Object} args.match       list filter (org/branch scope + any list filters)
 * @param {string} args.dateField   'purchaseDate' | 'invoiceDate'
 * @param {'entered'|'date'} [args.order='entered'] entry order (_id) or the document's date
 * @param {number} [args.index=0]   0 = newest
 * @param {string} [args.around]    a document id: return that one, at its own position
 * @returns {Promise<{ total: number, index: number|null, id: string|null, number: string|null }>}
 */
const navigateRecords = async ({ Model, match, dateField, order = 'entered', index = 0, around }) => {
  const byDate = order === 'date';
  const sort = byDate ? { [dateField]: -1, _id: -1 } : { _id: -1 };
  const total = await Model.countDocuments(match);
  if (!total) return { total: 0, index: null, id: null, number: null };

  let position = Math.min(Math.max(0, parseInt(index, 10) || 0), total - 1);
  const aroundId = toOid(around);
  if (aroundId) {
    const target = await Model.findOne({ ...match, _id: aroundId }).select(`_id ${dateField}`).lean();
    if (target) {
      // How many sort ahead of it = its position.
      const ahead = byDate
        ? {
            $or: [
              { [dateField]: { $gt: target[dateField] } },
              { [dateField]: target[dateField], _id: { $gt: target._id } },
            ],
          }
        : { _id: { $gt: target._id } };
      position = await Model.countDocuments({ $and: [match, ahead] });
    }
  }

  const [row] = await Model.find(match).sort(sort).skip(position).limit(1).select('_id invoiceNumber billNumber').lean();
  if (!row) return { total, index: null, id: null, number: null };
  return { total, index: position, id: String(row._id), number: row.billNumber || row.invoiceNumber || null };
};

/**
 * Bill numbers compare without case, spaces or punctuation: "INV-0042" ≡ "inv 0042".
 * ASCII letters/digits only — the matching regex below has to run on any MongoDB version,
 * so it can't rely on Unicode property classes.
 */
const billNumberKey = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Regex finding stored values whose key equals `key` (any separators between characters). */
const billNumberRegex = (key) =>
  new RegExp(`^[^a-z0-9]*${[...key].map(escapeRegex).join('[^a-z0-9]*')}[^a-z0-9]*$`, 'i');

/** The business day `value` falls on, widened by `days` on each side, as a Date range. */
const dayWindow = (value, days) => {
  const date = parseBusinessDateTime(value) || new Date();
  const day = toBusinessCalendarDate(date);
  return {
    $gte: new Date(startOfBusinessDay(day).getTime() - days * DAY_MS),
    $lte: new Date(endOfBusinessDay(day).getTime() + days * DAY_MS),
  };
};

const AMOUNT_TOLERANCE = 0.5;
/** Same supplier + same amount this many days either side counts as a possible repeat. */
const PURCHASE_AMOUNT_WINDOW_DAYS = 3;
const MAX_MATCHES = 5;

/**
 * Saved purchases the one about to be saved may repeat: the same supplier bill number
 * (strongest — a supplier never issues the same number twice), or the same supplier and
 * amount within a few days.
 */
const findPossibleDuplicatePurchases = async (scope, { supplier, vendorBillNumber, totalAmount, purchaseDate, excludeId }) => {
  const supplierId = toOid(supplier);
  if (!supplierId) return [];
  const base = { organizationId: toOid(scope.organizationId), supplier: supplierId };
  if (scope.branchId) base.branchId = toOid(scope.branchId);
  const exclude = toOid(excludeId);
  if (exclude) base._id = { $ne: exclude };

  const or = [];
  const billKey = billNumberKey(vendorBillNumber);
  if (billKey) or.push({ vendorBillNumber: billNumberRegex(billKey) });
  const amount = Number(totalAmount);
  if (Number.isFinite(amount) && amount > 0) {
    or.push({
      totalAmount: { $gte: amount - AMOUNT_TOLERANCE, $lte: amount + AMOUNT_TOLERANCE },
      purchaseDate: dayWindow(purchaseDate, PURCHASE_AMOUNT_WINDOW_DAYS),
    });
  }
  if (!or.length) return [];

  const rows = await Purchase.find({ ...base, $or: or })
    .sort({ _id: -1 })
    .limit(MAX_MATCHES)
    .select('invoiceNumber vendorBillNumber purchaseDate totalAmount items createdAt createdBy')
    .populate('createdBy', 'name')
    .lean();

  return rows.map((row) => ({
    id: String(row._id),
    number: row.invoiceNumber,
    partyBillNumber: row.vendorBillNumber || null,
    date: row.purchaseDate,
    amount: row.totalAmount,
    itemCount: (row.items || []).length,
    enteredAt: row.createdAt || row._id.getTimestamp(),
    enteredBy: row.createdBy?.name || null,
    reason: billKey && billNumberKey(row.vendorBillNumber) === billKey ? 'same_bill_number' : 'same_amount',
  }));
};

const WALK_IN = 'walk-in';

/**
 * Saved sales the one about to be saved may repeat: same customer, same total, same day.
 * A walk-in sale is only checked when it is dated another day (a pile of old bills being
 * typed in) — at the counter, two walk-ins buying the same thing today is normal trade.
 */
const findPossibleDuplicateInvoices = async (scope, { customerId, total, invoiceDate, excludeId }) => {
  const amount = Number(total);
  if (!Number.isFinite(amount) || amount <= 0) return [];
  const isWalkIn = !customerId || customerId === WALK_IN;
  const date = parseBusinessDateTime(invoiceDate) || new Date();
  if (isWalkIn && toBusinessCalendarDate(date) === toBusinessCalendarDate(new Date())) return [];

  const match = {
    organizationId: toOid(scope.organizationId),
    total: { $gte: amount - AMOUNT_TOLERANCE, $lte: amount + AMOUNT_TOLERANCE },
    invoiceDate: dayWindow(date, 0),
    type: { $ne: 'quotation' },
    status: { $ne: 'cancelled' },
  };
  if (scope.branchId) match.branchId = toOid(scope.branchId);
  // customerId is Mixed (ObjectId or string) — match both spellings.
  if (isWalkIn) match.customerId = { $in: [WALK_IN, null] };
  else {
    const oid = toOid(customerId);
    match.customerId = { $in: oid ? [String(customerId), oid] : [String(customerId)] };
  }
  const exclude = toOid(excludeId);
  if (exclude) match._id = { $ne: exclude };

  const rows = await Invoice.find(match)
    .sort({ _id: -1 })
    .limit(MAX_MATCHES)
    .select('invoiceNumber billNumber invoiceDate total items createdAt createdBy type')
    .populate('createdBy', 'name')
    .lean();

  return rows.map((row) => ({
    id: String(row._id),
    number: row.billNumber || row.invoiceNumber,
    partyBillNumber: null,
    date: row.invoiceDate,
    amount: row.total,
    itemCount: (row.items || []).length,
    enteredAt: row.createdAt || row._id.getTimestamp(),
    enteredBy: row.createdBy?.name || null,
    reason: 'same_amount',
  }));
};

module.exports = {
  navigateRecords,
  findPossibleDuplicatePurchases,
  findPossibleDuplicateInvoices,
  billNumberKey,
};
