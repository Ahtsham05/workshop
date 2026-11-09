const httpStatus = require('http-status');
const mongoose = require('mongoose');
const {
  Customer,
  CustomerLedger,
  Invoice,
  Organization,
  Purchase,
  Supplier,
  SupplierLedger,
  User,
} = require('../models');
const ApiError = require('../utils/ApiError');
const Money = require('../utils/money');
const { parseBusinessDateBoundary, toBusinessCalendarDate } = require('../utils/businessTimezone');
const { LEDGER_DISCOUNT_REASONS } = require('../models/schemas/ledgerDiscount.schema');

/**
 * Ledger discounts — the "Discount Allowed / Discount Received" of a proper accounts package.
 *
 *   CUSTOMER  discount_allowed  — credit on the customer's ledger. We accepted less than they
 *             owed (cash/early-payment discount, "leave the rest", rebate, round-off, bad
 *             debt). Books: Dr Discount Allowed (expense) / Cr Receivable.
 *   SUPPLIER  discount_received — debit on the supplier's ledger. They accepted less from us.
 *             Books: Dr Payable / Cr Discount Received (income).
 *
 * A discount is its own ledger row (never folded into the payment's amount), so the cash
 * actually received stays exactly what hit the drawer/bank, statements show both lines, and
 * the register can total discounts by reason, party and user. It is usually given WITH a
 * payment ("received 9,950 + 50 discount = 10,000 settled"): that row carries
 * `discount.linkedEntryId` → the payment row, and goes when the payment goes.
 *
 * It moves no money: no Cash Book line, no wallet line. It settles open invoices oldest-first
 * exactly like a payment (customer/supplierPayment.service direction 'discount') but is never
 * spendable advance credit, and it can never push the account past zero.
 */

const EPS = 0.005;

const SIDES = {
  customer: {
    type: 'discount_allowed',
    paymentType: 'payment_received',
    Ledger: CustomerLedger,
    Party: Customer,
    partyField: 'customer',
    amountField: 'credit',
    label: 'Discount allowed',
  },
  supplier: {
    type: 'discount_received',
    paymentType: 'payment_made',
    Ledger: SupplierLedger,
    Party: Supplier,
    partyField: 'supplier',
    amountField: 'debit',
    label: 'Discount received',
  },
};

const REASON_LABELS = Object.freeze({
  cash_discount: 'Cash discount',
  early_payment: 'Early payment discount',
  settlement: 'Settlement (balance left)',
  volume_rebate: 'Volume rebate',
  round_off: 'Round off',
  goodwill: 'Goodwill',
  bad_debt: 'Bad debt written off',
  other: 'Other',
});

const DEFAULT_SETTINGS = Object.freeze({
  enabled: true,
  customerEnabled: true,
  supplierEnabled: true,
  // 0 = no limit. Percent is of the amount being settled (payment + discount), or of the
  // balance owed for a discount given on its own.
  maxPercent: 0,
  maxAmount: 0,
  // Above the limit: users with approveLedgerDiscount can still save, with a note.
  requireApprovalNote: true,
  requireNote: false,
  defaultReason: 'cash_discount',
  // Discount rows with no payment (rebate, write-off of an old balance).
  allowStandalone: true,
  quickPercents: [1, 2, 5],
  showOnStatements: true,
  showOnReceipts: true,
});

const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const num = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

const normalizeSettings = (raw = {}) => {
  const quick = Array.isArray(raw.quickPercents)
    ? [...new Set(raw.quickPercents.map((p) => Math.round(num(p, 0, 100, 0) * 100) / 100).filter((p) => p > 0))]
        .sort((a, b) => a - b)
        .slice(0, 6)
    : DEFAULT_SETTINGS.quickPercents;
  return {
    enabled: bool(raw.enabled, DEFAULT_SETTINGS.enabled),
    customerEnabled: bool(raw.customerEnabled, DEFAULT_SETTINGS.customerEnabled),
    supplierEnabled: bool(raw.supplierEnabled, DEFAULT_SETTINGS.supplierEnabled),
    maxPercent: Math.round(num(raw.maxPercent, 0, 100, DEFAULT_SETTINGS.maxPercent) * 100) / 100,
    maxAmount: Money.roundMoney(num(raw.maxAmount, 0, 1e12, DEFAULT_SETTINGS.maxAmount)),
    requireApprovalNote: bool(raw.requireApprovalNote, DEFAULT_SETTINGS.requireApprovalNote),
    requireNote: bool(raw.requireNote, DEFAULT_SETTINGS.requireNote),
    defaultReason: LEDGER_DISCOUNT_REASONS.includes(raw.defaultReason) ? raw.defaultReason : DEFAULT_SETTINGS.defaultReason,
    allowStandalone: bool(raw.allowStandalone, DEFAULT_SETTINGS.allowStandalone),
    quickPercents: quick.length ? quick : DEFAULT_SETTINGS.quickPercents,
    showOnStatements: bool(raw.showOnStatements, DEFAULT_SETTINGS.showOnStatements),
    showOnReceipts: bool(raw.showOnReceipts, DEFAULT_SETTINGS.showOnReceipts),
  };
};

const getSettings = async (organizationId) => {
  if (!organizationId) return normalizeSettings({});
  const org = await Organization.findById(organizationId).select('ledgerDiscounts').lean();
  return normalizeSettings(org?.ledgerDiscounts || {});
};

const updateSettings = async (organizationId, body = {}) => {
  const current = await getSettings(organizationId);
  const next = normalizeSettings({ ...current, ...body });
  await Organization.updateOne({ _id: organizationId }, { $set: { ledgerDiscounts: next } });
  return next;
};

const formatAmount = (n) =>
  Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** "Discount allowed — Cash discount 2% (on payment 9,800)" */
const buildDescription = ({ side, reason, percent, paymentAmount }) => {
  const parts = [`${SIDES[side].label} — ${REASON_LABELS[reason] || REASON_LABELS.other}`];
  if (percent && percent > 0) parts[0] += ` ${Math.round(percent * 100) / 100}%`;
  if (paymentAmount && paymentAmount > 0) parts.push(`(with payment ${formatAmount(paymentAmount)})`);
  return parts.join(' ');
};

/** What the party owes right now on this ledger (customer receivable / supplier payable). */
const getOutstanding = async (side, partyId) => {
  const party = await SIDES[side].Party.findById(partyId).select('balance name').lean();
  if (!party) throw new ApiError(httpStatus.NOT_FOUND, side === 'customer' ? 'Customer not found' : 'Supplier not found');
  return { outstanding: Money.roundMoney(party.balance || 0), name: party.name };
};

/**
 * Validate a discount before anything is written and return the clean values to store.
 * Throws 400 (rule broken) or 403 (needs approval) — the caller must not have posted the
 * payment yet, so a refused discount never leaves half a transaction behind.
 *
 * @param {Object} args
 * @param {'customer'|'supplier'} args.side
 * @param {string} args.organizationId
 * @param {string} args.partyId
 * @param {Object} args.discount — { amount, percent?, baseAmount?, reason?, approvalNote? }
 * @param {number} [args.paymentAmount] — the payment it rides with (0 = standalone)
 * @param {string} [args.notes] — the row's notes (for "note required")
 * @param {boolean} [args.canApprove] — holds approveLedgerDiscount
 */
const evaluateDiscount = async ({
  side,
  organizationId,
  partyId,
  discount = {},
  paymentAmount = 0,
  notes,
  canApprove = false,
  // Money other lines of the same voucher settle for this party before this one posts
  // (negative = money a reversal hands back first, on a voucher edit).
  alreadySettled = 0,
}) => {
  const settings = await getSettings(organizationId);
  if (!settings.enabled || (side === 'customer' ? !settings.customerEnabled : !settings.supplierEnabled)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Ledger discounts are turned off in Settings → Ledger Discounts');
  }
  const linked = Number(paymentAmount) > 0;
  if (!linked && !settings.allowStandalone) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Discounts can only be given together with a payment (Settings → Ledger Discounts)');
  }

  const amount = Money.roundMoney(discount.amount);
  if (!(amount > 0)) throw new ApiError(httpStatus.BAD_REQUEST, 'Discount amount must be greater than 0');

  const reason = LEDGER_DISCOUNT_REASONS.includes(discount.reason) ? discount.reason : settings.defaultReason;
  if (settings.requireNote && !String(notes || discount.note || '').trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A note is required for every discount (Settings → Ledger Discounts)');
  }

  // Never past zero: a discount can only forgive what is actually owed after the payment.
  const { outstanding: owedNow } = await getOutstanding(side, partyId);
  const outstanding = Money.roundMoney(owedNow - (Number(alreadySettled) || 0));
  const available = Money.roundMoney(outstanding - (linked ? Money.roundMoney(paymentAmount) : 0));
  if (available <= EPS) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      linked ? 'Nothing is left owing after this payment, so there is nothing to discount' : 'Nothing is owing on this account, so there is nothing to discount'
    );
  }
  if (amount - available > EPS) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `Discount ${formatAmount(amount)} is more than the ${formatAmount(available)} still owing${linked ? ' after this payment' : ''}`
    );
  }

  // Limit base: gross settled (payment + discount) when it rides with a payment, else what
  // was owed before the discount.
  const limitBase = linked ? Money.addMoney(paymentAmount, amount) : outstanding;
  const effectivePercent = limitBase > 0 ? Math.round((amount / limitBase) * 10000) / 100 : 0;
  const overPercent = settings.maxPercent > 0 && effectivePercent - settings.maxPercent > 0.001;
  const overAmount = settings.maxAmount > 0 && amount - settings.maxAmount > EPS;
  const overLimit = overPercent || overAmount;
  const approvalNote = String(discount.approvalNote || '').trim().slice(0, 300);

  if (overLimit) {
    const limitText = [
      overPercent ? `${settings.maxPercent}%` : null,
      overAmount ? formatAmount(settings.maxAmount) : null,
    ]
      .filter(Boolean)
      .join(' / ');
    if (!canApprove) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        `This discount (${formatAmount(amount)}, ${effectivePercent}%) is above the limit of ${limitText}. Ask someone who can approve discounts.`
      );
    }
    if (settings.requireApprovalNote && !approvalNote) {
      throw new ApiError(httpStatus.BAD_REQUEST, `This discount is above the limit of ${limitText} — write why it is approved`);
    }
  }

  const percent = Number(discount.percent) > 0 ? Math.round(Number(discount.percent) * 100) / 100 : undefined;
  const baseAmount = percent && Number(discount.baseAmount) > 0 ? Money.roundMoney(discount.baseAmount) : undefined;

  return {
    amount,
    reason,
    percent,
    baseAmount,
    effectivePercent,
    overLimit,
    approvalNote: overLimit ? approvalNote || undefined : undefined,
    available,
  };
};

/** The ledger row body for an evaluated discount. */
const buildDiscountRow = ({ side, partyId, plan, base, linkedEntry, description, notes, reference }) => {
  const cfg = SIDES[side];
  const paymentAmount = linkedEntry ? Number(linkedEntry[side === 'customer' ? 'credit' : 'debit']) || 0 : 0;
  return {
    organizationId: base.organizationId,
    branchId: base.branchId,
    createdBy: base.createdBy,
    [cfg.partyField]: partyId,
    transactionType: cfg.type,
    transactionDate: linkedEntry?.transactionDate || base.transactionDate || new Date(),
    reference: reference || linkedEntry?.reference || undefined,
    description:
      String(description || '').trim() ||
      buildDescription({ side, reason: plan.reason, percent: plan.percent || plan.effectivePercent, paymentAmount }),
    debit: side === 'customer' ? 0 : plan.amount,
    credit: side === 'customer' ? plan.amount : 0,
    notes: notes || undefined,
    discount: {
      reason: plan.reason,
      percent: plan.percent,
      baseAmount: plan.baseAmount,
      linkedEntryId: linkedEntry?._id,
      linkedAmount: paymentAmount || undefined,
      overLimit: plan.overLimit,
      approvalNote: plan.approvalNote,
    },
  };
};

const ledgerService = (side) =>
  // eslint-disable-next-line global-require
  side === 'customer' ? require('./customerLedger.service') : require('./supplierLedger.service');

/**
 * Post the discount that rides with a payment the ledger service just created.
 * `plan` is what evaluateDiscount returned BEFORE the payment was written.
 */
const createLinkedDiscount = async ({ side, paymentEntry, plan, input = {}, user }) => {
  const cfg = SIDES[side];
  const row = buildDiscountRow({
    side,
    partyId: paymentEntry[cfg.partyField],
    plan,
    base: {
      organizationId: paymentEntry.organizationId,
      branchId: paymentEntry.branchId,
      createdBy: paymentEntry.createdBy || user?.id || user?._id,
    },
    linkedEntry: paymentEntry,
    description: input.description,
    notes: input.note,
  });
  return ledgerService(side).createLedgerEntry(row, { user, discountEvaluated: true });
};

/** Discount rows hanging off one payment row. */
const findLinkedDiscounts = (side, entryId) =>
  SIDES[side].Ledger.find({ transactionType: SIDES[side].type, 'discount.linkedEntryId': entryId });

/** The payment is being deleted — its discount goes with it (releases its invoice settlement too). */
const deleteLinkedDiscounts = async (side, entryId) => {
  const linked = await findLinkedDiscounts(side, entryId).select('_id');
  for (const row of linked) {
    // eslint-disable-next-line no-await-in-loop
    await ledgerService(side).deleteLedgerEntry(row._id);
  }
  return linked.length;
};

/** The payment's date moved — keep its discount on the same day. */
const syncLinkedDiscountDates = async (side, paymentEntry) => {
  const linked = await findLinkedDiscounts(side, paymentEntry._id);
  for (const row of linked) {
    if (new Date(row.transactionDate).getTime() === new Date(paymentEntry.transactionDate).getTime()) continue;
    // eslint-disable-next-line no-await-in-loop
    await ledgerService(side).updateLedgerEntry(row._id, { transactionDate: paymentEntry.transactionDate });
  }
};

// ---------------------------------------------------------------------------------------
// Discount register (Reports → Discounts)
// ---------------------------------------------------------------------------------------

const toObjectId = (id) => (id && mongoose.Types.ObjectId.isValid(String(id)) ? new mongoose.Types.ObjectId(String(id)) : id);

const rangeOf = ({ startDate, endDate }) => {
  const end = parseBusinessDateBoundary(endDate, true) || new Date();
  const start = parseBusinessDateBoundary(startDate, false) || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { start, end };
};

/** Customer.id strings and ObjectIds — Invoice.customerId is stored as a plain string. */
const idForms = (id) => {
  const s = String(id);
  return mongoose.Types.ObjectId.isValid(s) ? [s, new mongoose.Types.ObjectId(s)] : [s];
};

/**
 * Every ledger discount in a period, plus the bill-level discounts given/received on invoices
 * and purchases in the same period, so the business sees ALL its discounting in one place.
 */
const getRegister = async (scope, query = {}) => {
  const { start, end } = rangeOf(query);
  const side = ['customer', 'supplier'].includes(query.side) ? query.side : 'all';
  const sides = side === 'all' ? ['customer', 'supplier'] : [side];
  const base = { organizationId: toObjectId(scope.organizationId) };
  if (scope.branchId) base.branchId = toObjectId(scope.branchId);

  const rows = [];
  const collections = {};
  for (const s of sides) {
    const cfg = SIDES[s];
    const match = { ...base, transactionType: cfg.type, transactionDate: { $gte: start, $lte: end } };
    if (query.partyId && (side !== 'all')) match[cfg.partyField] = toObjectId(query.partyId);
    if (query.reason && LEDGER_DISCOUNT_REASONS.includes(query.reason)) match['discount.reason'] = query.reason;
    if (query.createdBy) match.createdBy = toObjectId(query.createdBy);
    // eslint-disable-next-line no-await-in-loop
    const found = await cfg.Ledger.find(match).sort({ transactionDate: -1, createdAt: -1 }).limit(5000).lean();
    found.forEach((r) => rows.push({ side: s, row: r }));

    // What was actually collected / paid on the same ledgers in the period — the denominator
    // of "discount as a % of collections".
    const payMatch = { ...base, transactionType: cfg.paymentType, transactionDate: { $gte: start, $lte: end } };
    if (query.partyId && side !== 'all') payMatch[cfg.partyField] = toObjectId(query.partyId);
    // eslint-disable-next-line no-await-in-loop
    const [pay] = await cfg.Ledger.aggregate([
      { $match: payMatch },
      { $group: { _id: null, total: { $sum: `$${cfg.amountField}` }, count: { $sum: 1 } } },
    ]);
    collections[s] = { total: Money.roundMoney(pay?.total || 0), count: pay?.count || 0 };
  }

  // Names in one round trip each.
  const customerIds = [...new Set(rows.filter((r) => r.side === 'customer').map((r) => String(r.row.customer)))];
  const supplierIds = [...new Set(rows.filter((r) => r.side === 'supplier').map((r) => String(r.row.supplier)))];
  const userIds = [...new Set(rows.map((r) => r.row.createdBy).filter(Boolean).map(String))];
  const [customers, suppliers, users] = await Promise.all([
    customerIds.length ? Customer.find({ _id: { $in: customerIds } }).select('name nameUrdu phone').lean() : [],
    supplierIds.length ? Supplier.find({ _id: { $in: supplierIds } }).select('name nameUrdu phone').lean() : [],
    userIds.length ? User.find({ _id: { $in: userIds } }).select('name email').lean() : [],
  ]);
  const customerById = new Map(customers.map((c) => [String(c._id), c]));
  const supplierById = new Map(suppliers.map((c) => [String(c._id), c]));
  const userById = new Map(users.map((u) => [String(u._id), u]));

  const search = String(query.search || '').trim().toLowerCase();
  let items = rows.map(({ side: s, row }) => {
    const partyId = String(row[SIDES[s].partyField]);
    const party = s === 'customer' ? customerById.get(partyId) : supplierById.get(partyId);
    const amount = Money.roundMoney(s === 'customer' ? row.credit : row.debit);
    const linkedAmount = Number(row.discount?.linkedAmount) || 0;
    const user = row.createdBy ? userById.get(String(row.createdBy)) : null;
    return {
      id: String(row._id),
      side: s,
      date: row.transactionDate,
      partyId,
      partyName: party?.name || '(deleted)',
      partyNameUrdu: party?.nameUrdu,
      partyPhone: party?.phone,
      reason: row.discount?.reason || 'other',
      amount,
      percent: row.discount?.percent || (linkedAmount > 0 ? Math.round((amount / (linkedAmount + amount)) * 10000) / 100 : null),
      paymentAmount: linkedAmount || null,
      settledAmount: linkedAmount ? Money.addMoney(linkedAmount, amount) : null,
      linked: Boolean(row.discount?.linkedEntryId),
      overLimit: Boolean(row.discount?.overLimit),
      approvalNote: row.discount?.approvalNote,
      description: row.description,
      reference: row.reference,
      notes: row.notes,
      createdById: row.createdBy ? String(row.createdBy) : null,
      createdByName: user?.name || user?.email || null,
    };
  });
  if (search) {
    items = items.filter((i) =>
      [i.partyName, i.partyNameUrdu, i.partyPhone, i.description, i.reference, i.notes, i.createdByName]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(search))
    );
  }

  // ---- Summaries ----
  const sumBy = (list, key, labelOf) => {
    const map = new Map();
    list.forEach((i) => {
      const k = key(i);
      const cur = map.get(k) || { key: k, label: labelOf(i), count: 0, amount: 0, allowed: 0, received: 0 };
      cur.count += 1;
      cur.amount = Money.addMoney(cur.amount, i.amount);
      if (i.side === 'customer') cur.allowed = Money.addMoney(cur.allowed, i.amount);
      else cur.received = Money.addMoney(cur.received, i.amount);
      map.set(k, cur);
    });
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  };

  const allowed = items.filter((i) => i.side === 'customer');
  const received = items.filter((i) => i.side === 'supplier');
  const total = (list) => Money.sumMoney(list.map((i) => i.amount));
  const totalAllowed = total(allowed);
  const totalReceived = total(received);

  const byMonth = sumBy(items, (i) => toBusinessCalendarDate(new Date(i.date)).slice(0, 7), (i) => toBusinessCalendarDate(new Date(i.date)).slice(0, 7)).sort(
    (a, b) => a.key.localeCompare(b.key)
  );

  // Bill-level discounts for the same period — given at the counter on the invoice itself.
  const billMatch = { ...base };
  const [salesBills, purchaseBills] = await Promise.all([
    sides.includes('customer')
      ? Invoice.aggregate([
          {
            $match: {
              ...billMatch,
              invoiceDate: { $gte: start, $lte: end },
              type: { $in: ['cash', 'credit'] },
              status: { $ne: 'cancelled' },
              ...(query.partyId && side !== 'all' ? { customerId: { $in: idForms(query.partyId) } } : {}),
            },
          },
          {
            $project: {
              bill: { $ifNull: ['$discount', 0] },
              lines: { $sum: { $map: { input: { $ifNull: ['$items', []] }, as: 'it', in: { $ifNull: ['$$it.discountAmount', 0] } } } },
              total: { $ifNull: ['$total', 0] },
            },
          },
          {
            $group: {
              _id: null,
              bill: { $sum: '$bill' },
              lines: { $sum: '$lines' },
              sales: { $sum: '$total' },
              invoices: { $sum: { $cond: [{ $gt: [{ $add: ['$bill', '$lines'] }, 0] }, 1, 0] } },
            },
          },
        ])
      : [],
    sides.includes('supplier')
      ? Purchase.aggregate([
          {
            $match: {
              ...billMatch,
              purchaseDate: { $gte: start, $lte: end },
              ...(query.partyId && side !== 'all' ? { supplier: toObjectId(query.partyId) } : {}),
            },
          },
          {
            $project: {
              bill: { $ifNull: ['$discount', 0] },
              lines: { $sum: { $map: { input: { $ifNull: ['$items', []] }, as: 'it', in: { $ifNull: ['$$it.discountAmount', 0] } } } },
              total: { $ifNull: ['$totalAmount', 0] },
            },
          },
          {
            $group: {
              _id: null,
              bill: { $sum: '$bill' },
              lines: { $sum: '$lines' },
              purchases: { $sum: '$total' },
              invoices: { $sum: { $cond: [{ $gt: [{ $add: ['$bill', '$lines'] }, 0] }, 1, 0] } },
            },
          },
        ])
      : [],
  ]);
  const sb = salesBills[0] || {};
  const pb = purchaseBills[0] || {};

  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 10000) / 100 : 0);

  return {
    period: { startDate: start, endDate: end },
    side,
    summary: {
      allowed: {
        total: totalAllowed,
        count: allowed.length,
        withPayment: allowed.filter((i) => i.linked).length,
        overLimit: allowed.filter((i) => i.overLimit).length,
        collections: collections.customer?.total || 0,
        // Of every rupee collected on customer ledgers, how much was let go as discount.
        rateOfCollections: pct(totalAllowed, Money.addMoney(collections.customer?.total || 0, totalAllowed)),
        parties: new Set(allowed.map((i) => i.partyId)).size,
      },
      received: {
        total: totalReceived,
        count: received.length,
        withPayment: received.filter((i) => i.linked).length,
        overLimit: received.filter((i) => i.overLimit).length,
        payments: collections.supplier?.total || 0,
        rateOfPayments: pct(totalReceived, Money.addMoney(collections.supplier?.total || 0, totalReceived)),
        parties: new Set(received.map((i) => i.partyId)).size,
      },
      // Positive = suppliers gave us more than we gave customers.
      net: Money.subtractMoney(totalReceived, totalAllowed),
      billDiscounts: {
        sales: {
          bill: Money.roundMoney(sb.bill || 0),
          lines: Money.roundMoney(sb.lines || 0),
          total: Money.roundMoney((sb.bill || 0) + (sb.lines || 0)),
          invoices: sb.invoices || 0,
          rateOfSales: pct((sb.bill || 0) + (sb.lines || 0), (sb.sales || 0) + (sb.bill || 0) + (sb.lines || 0)),
        },
        purchases: {
          bill: Money.roundMoney(pb.bill || 0),
          lines: Money.roundMoney(pb.lines || 0),
          total: Money.roundMoney((pb.bill || 0) + (pb.lines || 0)),
          invoices: pb.invoices || 0,
          rateOfPurchases: pct((pb.bill || 0) + (pb.lines || 0), (pb.purchases || 0) + (pb.bill || 0) + (pb.lines || 0)),
        },
      },
    },
    byReason: sumBy(items, (i) => i.reason, (i) => REASON_LABELS[i.reason] || i.reason),
    byParty: sumBy(items, (i) => `${i.side}:${i.partyId}`, (i) => i.partyName).slice(0, 25).map((p) => ({
      ...p,
      side: p.key.split(':')[0],
      partyId: p.key.split(':')[1],
    })),
    byUser: sumBy(items, (i) => i.createdById || 'unknown', (i) => i.createdByName || 'Unknown'),
    byMonth,
    rows: items,
  };
};

/** Ledger discounts in a period, for Profit & Loss. */
const getTotalsForPeriod = async (scope, start, end) => {
  const base = { organizationId: toObjectId(scope.organizationId) };
  if (scope.branchId) base.branchId = toObjectId(scope.branchId);
  const [[allowed], [received]] = await Promise.all([
    CustomerLedger.aggregate([
      { $match: { ...base, transactionType: 'discount_allowed', transactionDate: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: '$credit' }, count: { $sum: 1 } } },
    ]),
    SupplierLedger.aggregate([
      { $match: { ...base, transactionType: 'discount_received', transactionDate: { $gte: start, $lte: end } } },
      { $group: { _id: null, total: { $sum: '$debit' }, count: { $sum: 1 } } },
    ]),
  ]);
  return {
    discountAllowed: Money.roundMoney(allowed?.total || 0),
    discountAllowedCount: allowed?.count || 0,
    discountReceived: Money.roundMoney(received?.total || 0),
    discountReceivedCount: received?.count || 0,
  };
};

/**
 * Check every discount on a voucher BEFORE the voucher writes anything, in posting order, so
 * a refused discount on line 3 never leaves lines 1–2 posted. Lines for the same party add up
 * (two lines for Ali can't each discount the full balance). `restored` = per-party money a
 * voucher edit will hand back by reversing old lines first.
 *
 * @param {Object} args
 * @param {'customer'|'supplier'} args.side
 * @param {Array<{partyId, amount, discount?}>} args.lines — only this side's lines, in order
 * @returns {Promise<Map<number, Object>>} index in `lines` → evaluated plan
 */
const preflightVoucherDiscounts = async ({ side, organizationId, lines, canApprove = false, restored = new Map() }) => {
  const consumed = new Map();
  const plans = new Map();
  for (let i = 0; i < lines.length; i += 1) {
    const { partyId, amount, discount } = lines[i];
    const key = String(partyId);
    const settledBefore = Money.subtractMoney(consumed.get(key) || 0, restored.get(key) || 0);
    let discountAmount = 0;
    if (discount && Number(discount.amount) > 0) {
      // eslint-disable-next-line no-await-in-loop
      const plan = await evaluateDiscount({
        side,
        organizationId,
        partyId,
        discount,
        paymentAmount: Number(amount) || 0,
        notes: discount.note,
        canApprove,
        alreadySettled: settledBefore,
      });
      plans.set(i, plan);
      discountAmount = plan.amount;
    }
    consumed.set(key, Money.addMoney(consumed.get(key) || 0, Money.addMoney(Number(amount) || 0, discountAmount)));
  }
  return plans;
};

/** A voucher line's discount fields → the settlementDiscount body the ledger services take. */
const voucherLineDiscount = (line) =>
  Number(line?.discountAmount) > 0
    ? {
        amount: Number(line.discountAmount),
        reason: line.discountReason || undefined,
        percent: line.discountPercent || undefined,
        baseAmount: line.discountBaseAmount || undefined,
        approvalNote: line.discountApprovalNote || undefined,
        note: line.discountNote || undefined,
      }
    : null;

module.exports = {
  preflightVoucherDiscounts,
  voucherLineDiscount,
  DEFAULT_SETTINGS,
  REASON_LABELS,
  LEDGER_DISCOUNT_REASONS,
  normalizeSettings,
  getSettings,
  updateSettings,
  evaluateDiscount,
  buildDiscountRow,
  buildDescription,
  createLinkedDiscount,
  deleteLinkedDiscounts,
  syncLinkedDiscountDates,
  getRegister,
  getTotalsForPeriod,
};
