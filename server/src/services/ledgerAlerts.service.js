const mongoose = require('mongoose');
const { Customer, CustomerLedger, Invoice, Organization } = require('../models');
const { toBusinessCalendarDate, extractBusinessCalendarDate } = require('../utils/businessTimezone');

/**
 * Ledger alerts — due dates on credit sales, and colour bands for customers who are late.
 *
 * 1. DUE DATES. A credit (and, optionally, pending) invoice gets a due date when it is made:
 *    the customer's payment terms (net 15/30/60) when "use customer terms" is on, else the
 *    org's default days. The invoice screen pre-fills the same date so the cashier sees and
 *    can change it; the server fills it only when the request didn't send one at all
 *    (fast billing, AI assistant, desktop sync…). `dueDate: null` means "no due date" on
 *    purpose and is kept.
 *
 * 2. AGING, ledger-true. Customer payments are often recorded straight in the ledger and not
 *    tied to an invoice, so "which invoice is still unpaid" is worked out the standard
 *    balance-forward way: the customer's ledger balance is matched against their NEWEST
 *    unpaid-at-sale amounts first (= payments always clear the OLDEST invoices first).
 *      open items = credit invoices' unpaid-at-sale part (total − paidAmount)
 *                 + ledger debits that are not invoice sales (opening balance, adjustments…)
 *    A customer whose ledger says 0 is therefore never shown as late, whatever the invoices
 *    say. Pending invoices (goods handed over, not billed) are not in the ledger; each one
 *    open is its own item when pending invoices are included.
 *
 * 3. COLOURS. A customer's colour is the band their OLDEST overdue item falls in
 *    (bands: "from N days overdue"), or the due-today / due-soon colour when nothing is late
 *    yet. Every list and report reads the same /ledger-alerts/status payload.
 *
 * Day maths runs on Pakistan calendar dates (utils/businessTimezone.js), never UTC.
 */

const EPS = 0.005;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_BANDS = 8;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/** Days a customer's payment terms allow. 'cash' has no credit terms, so it is skipped. */
const PAYMENT_TERM_DAYS = { due_on_receipt: 0, net_15: 15, net_30: 30, net_60: 60 };

const DEFAULT_BANDS = Object.freeze([
  { label: 'Overdue', fromDays: 1, color: '#EAB308' },
  { label: 'Overdue 10+ days', fromDays: 11, color: '#F97316' },
  { label: 'Overdue 30+ days', fromDays: 31, color: '#EF4444' },
  { label: 'Critical 60+ days', fromDays: 61, color: '#9F1239' },
]);

const DEFAULT_SETTINGS = Object.freeze({
  // Due dates
  dueDatesEnabled: false,
  defaultDueDays: 15,
  applyToPending: true,
  useCustomerTerms: true,
  // Invoices/ledger debits with no due date: 'ignore' = never late, 'default_days' = treat
  // as due defaultDueDays after their date (useful for invoices made before due dates).
  undatedRule: 'ignore',
  // Colours
  colorsEnabled: true,
  dueSoonEnabled: true,
  dueSoonDays: 3,
  dueSoonColor: '#0EA5E9',
  dueSoonLabel: 'Due soon',
  dueTodayColor: '#6366F1',
  dueTodayLabel: 'Due today',
  bands: DEFAULT_BANDS,
  rowStyle: 'tint', // tint = soft row background + colour bar, bar = colour bar only, badge = chip only
  intensity: 'medium', // light | medium | strong
  minAmount: 0, // overdue below this amount is ignored (small leftover balances)
  showInReports: true,
  printColors: true,
});

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const clampInt = (value, min, max, fallback) => {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};
const cleanColor = (value, fallback) => (HEX_RE.test(String(value || '').trim()) ? String(value).trim().toUpperCase() : fallback);
const cleanLabel = (value, fallback) => {
  const text = String(value === undefined || value === null ? '' : value).trim().slice(0, 40);
  return text || fallback;
};

// ---------------------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------------------

const normalizeBands = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_BANDS.map((band) => ({ ...band }));
  const seen = new Set();
  const bands = [];
  raw.slice(0, MAX_BANDS).forEach((band, index) => {
    const fromDays = clampInt(band?.fromDays, 1, 3650, index === 0 ? 1 : 30);
    if (seen.has(fromDays)) return; // two bands starting on the same day can't both apply
    seen.add(fromDays);
    bands.push({
      label: cleanLabel(band?.label, `Overdue ${fromDays}+ days`),
      fromDays,
      color: cleanColor(band?.color, '#EF4444'),
    });
  });
  bands.sort((a, b) => a.fromDays - b.fromDays);
  return bands.length ? bands : DEFAULT_BANDS.map((band) => ({ ...band }));
};

const bool = (value, fallback) => (value === undefined || value === null ? fallback : Boolean(value));

const normalizeSettings = (raw = {}) => ({
  dueDatesEnabled: bool(raw.dueDatesEnabled, DEFAULT_SETTINGS.dueDatesEnabled),
  defaultDueDays: clampInt(raw.defaultDueDays, 0, 3650, DEFAULT_SETTINGS.defaultDueDays),
  applyToPending: bool(raw.applyToPending, DEFAULT_SETTINGS.applyToPending),
  useCustomerTerms: bool(raw.useCustomerTerms, DEFAULT_SETTINGS.useCustomerTerms),
  undatedRule: raw.undatedRule === 'default_days' ? 'default_days' : 'ignore',
  colorsEnabled: bool(raw.colorsEnabled, DEFAULT_SETTINGS.colorsEnabled),
  dueSoonEnabled: bool(raw.dueSoonEnabled, DEFAULT_SETTINGS.dueSoonEnabled),
  dueSoonDays: clampInt(raw.dueSoonDays, 1, 60, DEFAULT_SETTINGS.dueSoonDays),
  dueSoonColor: cleanColor(raw.dueSoonColor, DEFAULT_SETTINGS.dueSoonColor),
  dueSoonLabel: cleanLabel(raw.dueSoonLabel, DEFAULT_SETTINGS.dueSoonLabel),
  dueTodayColor: cleanColor(raw.dueTodayColor, DEFAULT_SETTINGS.dueTodayColor),
  dueTodayLabel: cleanLabel(raw.dueTodayLabel, DEFAULT_SETTINGS.dueTodayLabel),
  bands: normalizeBands(raw.bands),
  rowStyle: ['tint', 'bar', 'badge'].includes(raw.rowStyle) ? raw.rowStyle : DEFAULT_SETTINGS.rowStyle,
  intensity: ['light', 'medium', 'strong'].includes(raw.intensity) ? raw.intensity : DEFAULT_SETTINGS.intensity,
  minAmount: Math.max(0, round2(raw.minAmount)),
  showInReports: bool(raw.showInReports, DEFAULT_SETTINGS.showInReports),
  printColors: bool(raw.printColors, DEFAULT_SETTINGS.printColors),
});

const getSettings = async (organizationId) => {
  if (!organizationId) return normalizeSettings({});
  const org = await Organization.findById(organizationId).select('ledgerAlerts').lean();
  return normalizeSettings(org?.ledgerAlerts || {});
};

const updateSettings = async (organizationId, body = {}) => {
  const current = await getSettings(organizationId);
  const next = normalizeSettings({ ...current, ...body });
  await Organization.updateOne({ _id: organizationId }, { $set: { ledgerAlerts: next } });
  return next;
};

// ---------------------------------------------------------------------------------------
// Calendar helpers (Pakistan calendar dates as 'YYYY-MM-DD')
// ---------------------------------------------------------------------------------------

const calendarOf = (value) => {
  if (!value) return null;
  if (value instanceof Date) return toBusinessCalendarDate(value);
  return extractBusinessCalendarDate(value);
};

const calendarToUtc = (ymd) => new Date(`${ymd}T00:00:00.000Z`);

const addDays = (ymd, days) => {
  const date = calendarToUtc(ymd);
  return new Date(date.getTime() + days * DAY_MS).toISOString().slice(0, 10);
};

/** Whole days from a to b (b − a), both calendar dates. */
const daysBetween = (a, b) => Math.round((calendarToUtc(b).getTime() - calendarToUtc(a).getTime()) / DAY_MS);

/**
 * Stored form of a due date: UTC midnight of the calendar day — the same value the invoice
 * screen's date field sends, so every due date reads back as the day that was picked.
 */
const toStoredDueDate = (ymd) => (ymd ? calendarToUtc(ymd) : null);

// ---------------------------------------------------------------------------------------
// Due dates on invoices
// ---------------------------------------------------------------------------------------

const termDaysOf = (customer, settings) => {
  if (!settings.useCustomerTerms || !customer) return undefined;
  return PAYMENT_TERM_DAYS[customer.paymentTerms];
};

const isDueDateInvoiceType = (type, settings) => type === 'credit' || (type === 'pending' && settings.applyToPending);

/** The due date (calendar 'YYYY-MM-DD') a new invoice of this type/customer gets, or null. */
const resolveDefaultDueCalendar = ({ settings, invoiceDate, type, customer }) => {
  if (!settings.dueDatesEnabled || !isDueDateInvoiceType(type, settings)) return null;
  const base = calendarOf(invoiceDate) || toBusinessCalendarDate(new Date());
  const termDays = termDaysOf(customer, settings);
  return addDays(base, termDays !== undefined ? termDays : settings.defaultDueDays);
};

const isRegisteredCustomerId = (id) => Boolean(id) && id !== 'walk-in' && mongoose.Types.ObjectId.isValid(String(id));

/**
 * Fill invoice.dueDate from the org's settings when the request didn't mention a due date.
 * `body.dueDate === null` (cleared on purpose) and any sent date are kept as they are.
 * With `{ onlyWhenMissing: true }` (edits) a date is added only if the invoice has none,
 * e.g. a cash invoice switched to credit by a client that doesn't know about due dates.
 */
const applyDefaultDueDate = async (invoice, body = {}, { onlyWhenMissing = false } = {}) => {
  try {
    if (!invoice || Object.prototype.hasOwnProperty.call(body, 'dueDate')) return;
    if (onlyWhenMissing && invoice.dueDate) return;
    if (invoice.type !== 'credit' && invoice.type !== 'pending') return;
    const settings = await getSettings(invoice.organizationId);
    if (!settings.dueDatesEnabled || !isDueDateInvoiceType(invoice.type, settings)) return;
    let customer = null;
    if (settings.useCustomerTerms && isRegisteredCustomerId(invoice.customerId)) {
      customer = await Customer.findById(invoice.customerId).select('paymentTerms').lean();
    }
    const ymd = resolveDefaultDueCalendar({ settings, invoiceDate: invoice.invoiceDate, type: invoice.type, customer });
    if (ymd) invoice.dueDate = toStoredDueDate(ymd);
  } catch (error) {
    // A due date is a convenience — never fail a sale over it.
    console.error('ledgerAlerts.applyDefaultDueDate failed:', error.message);
  }
};

// ---------------------------------------------------------------------------------------
// Aging
// ---------------------------------------------------------------------------------------

/** Band for N days overdue: the last band whose fromDays ≤ N. */
const bandIndexFor = (daysOverdue, bands) => {
  let found = -1;
  bands.forEach((band, index) => {
    if (daysOverdue >= band.fromDays) found = index;
  });
  return found;
};

const AGING_BUCKETS = [
  { key: 'd1_30', from: 1, to: 30 },
  { key: 'd31_60', from: 31, to: 60 },
  { key: 'd61_90', from: 61, to: 90 },
  { key: 'd90_plus', from: 91, to: Infinity },
];

const emptyBuckets = () => ({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, noDueDate: 0 });

/** Due calendar date of an open item, following the same fallbacks for every list. */
const resolveItemDue = (item, customer, settings) => {
  const own = calendarOf(item.dueDate);
  if (own) return { due: own, source: 'invoice' };
  const date = calendarOf(item.date);
  if (!date) return { due: null, source: 'none' };
  if (item.kind === 'invoice' || item.kind === 'pending') {
    const termDays = termDaysOf(customer, settings);
    if (termDays !== undefined) return { due: addDays(date, termDays), source: 'terms' };
  }
  if (settings.undatedRule === 'default_days') return { due: addDays(date, settings.defaultDueDays), source: 'default' };
  return { due: null, source: 'none' };
};

const classifyItem = (dueYmd, todayYmd, settings) => {
  if (!dueYmd) return { state: 'no_due_date', daysOverdue: 0, daysUntilDue: null };
  const diff = daysBetween(dueYmd, todayYmd); // > 0 → late by diff days
  if (diff > 0) return { state: 'overdue', daysOverdue: diff, daysUntilDue: -diff };
  if (diff === 0) return { state: 'due_today', daysOverdue: 0, daysUntilDue: 0 };
  const until = -diff;
  if (settings.dueSoonEnabled && until <= settings.dueSoonDays) return { state: 'due_soon', daysOverdue: 0, daysUntilDue: until };
  return { state: 'not_due', daysOverdue: 0, daysUntilDue: until };
};

/**
 * Open items per customer from the ledger balance (see the header). Returns
 * Map<customerId, item[]> with items newest first; each item carries `openAmount`.
 */
const loadLedgerOpenItems = async (organizationId, customers) => {
  const owing = customers.filter((c) => Number(c.balance) > EPS);
  const result = new Map();
  if (!owing.length) return result;

  const objectIds = owing.map((c) => new mongoose.Types.ObjectId(String(c._id)));
  const stringIds = objectIds.map(String);
  const balances = new Map(owing.map((c) => [String(c._id), round2(c.balance)]));

  const cursor = Invoice.aggregate([
    {
      $match: {
        organizationId: new mongoose.Types.ObjectId(String(organizationId)),
        customerId: { $in: [...objectIds, ...stringIds] },
        type: { $nin: ['quotation', 'pending'] },
        status: { $ne: 'cancelled' },
      },
    },
    {
      $project: {
        _id: 0,
        customer: { $toString: '$customerId' },
        date: { $ifNull: ['$invoiceDate', '$createdAt'] },
        sortId: '$_id',
        amount: { $subtract: [{ $ifNull: ['$total', 0] }, { $ifNull: ['$paidAmount', 0] }] },
        dueDate: '$dueDate',
        reference: { $ifNull: ['$billNumber', '$invoiceNumber'] },
        invoiceNumber: '$invoiceNumber',
        billNumber: '$billNumber',
        invoiceId: '$_id',
        invoiceType: '$type',
        total: '$total',
        kind: 'invoice',
      },
    },
    { $match: { amount: { $gt: EPS } } },
    {
      $unionWith: {
        coll: CustomerLedger.collection.name,
        pipeline: [
          {
            $match: {
              customer: { $in: objectIds },
              debit: { $gt: 0 },
              // Invoice sales are counted from the invoice above; everything else that
              // raised the balance (opening balance, adjustments, debit notes, a manual
              // "sale" line with no invoice) is its own item.
              $or: [{ transactionType: { $ne: 'sale' } }, { referenceId: { $exists: false } }, { referenceId: null }],
            },
          },
          {
            $project: {
              _id: 0,
              customer: { $toString: '$customer' },
              date: '$transactionDate',
              sortId: '$_id',
              amount: '$debit',
              reference: '$reference',
              description: '$description',
              ledgerEntryId: '$_id',
              kind: '$transactionType',
            },
          },
        ],
      },
    },
    { $sort: { customer: 1, date: -1, sortId: -1 } },
  ])
    .allowDiskUse(true)
    .cursor({ batchSize: 1000 });

  const remainingByCustomer = new Map(balances);
  for await (const row of cursor) {
    const remaining = remainingByCustomer.get(row.customer) || 0;
    if (remaining <= EPS) continue; // older than what the balance still covers = paid off
    const openAmount = round2(Math.min(remaining, Number(row.amount) || 0));
    remainingByCustomer.set(row.customer, round2(remaining - openAmount));
    if (!result.has(row.customer)) result.set(row.customer, []);
    result.get(row.customer).push({ ...row, kind: row.kind === 'invoice' ? 'invoice' : 'ledger', entryType: row.kind, openAmount });
  }
  // Balance not explained by any invoice or debit line (very old data, imports): an
  // undated item, so the totals always add up to the ledger balance.
  for (const [customerId, remaining] of remainingByCustomer) {
    if (remaining > EPS) {
      if (!result.has(customerId)) result.set(customerId, []);
      result.get(customerId).push({ customer: customerId, kind: 'unmatched', reference: null, date: null, openAmount: round2(remaining) });
    }
  }
  return result;
};

/** Unbilled pending invoices still open, per customer (they are not in the ledger). */
const loadPendingOpenItems = async (organizationId, customerIds) => {
  const result = new Map();
  if (!customerIds.length) return result;
  const objectIds = customerIds.map((id) => new mongoose.Types.ObjectId(String(id)));
  const rows = await Invoice.find({
    organizationId,
    customerId: { $in: [...objectIds, ...objectIds.map(String)] },
    type: 'pending',
    isConvertedToBill: { $ne: true },
    status: { $ne: 'cancelled' },
  })
    .select('customerId invoiceNumber invoiceDate createdAt dueDate total paidAmount allocatedAmount')
    .lean();
  for (const inv of rows) {
    const open = round2((Number(inv.total) || 0) - (Number(inv.paidAmount) || 0) - (Number(inv.allocatedAmount) || 0));
    if (open <= EPS) continue;
    const key = String(inv.customerId);
    if (!result.has(key)) result.set(key, []);
    result.get(key).push({
      customer: key,
      kind: 'pending',
      entryType: 'pending',
      invoiceId: inv._id,
      invoiceNumber: inv.invoiceNumber,
      reference: inv.invoiceNumber,
      date: inv.invoiceDate || inv.createdAt,
      dueDate: inv.dueDate,
      total: inv.total,
      openAmount: open,
    });
  }
  return result;
};

/** Customer summary from their open items. */
const summarize = (customer, items, settings, todayYmd, { includeItems = false } = {}) => {
  const buckets = emptyBuckets();
  const amounts = { overdue: 0, dueToday: 0, dueSoon: 0, notDue: 0, noDueDate: 0, pending: 0 };
  let overdueCount = 0;
  let oldestDaysOverdue = 0;
  let oldestDueDate = null;
  let nextDueDate = null;
  let nextDueAmount = 0;

  const detailed = items.map((item) => {
    const { due, source } = resolveItemDue(item, customer, settings);
    const cls = classifyItem(due, todayYmd, settings);
    const amount = item.openAmount;
    if (item.kind === 'pending') amounts.pending = round2(amounts.pending + amount);
    switch (cls.state) {
      case 'overdue': {
        amounts.overdue = round2(amounts.overdue + amount);
        overdueCount += 1;
        if (cls.daysOverdue > oldestDaysOverdue) {
          oldestDaysOverdue = cls.daysOverdue;
          oldestDueDate = due;
        }
        const bucket = AGING_BUCKETS.find((b) => cls.daysOverdue >= b.from && cls.daysOverdue <= b.to);
        buckets[bucket.key] = round2(buckets[bucket.key] + amount);
        break;
      }
      case 'due_today':
        amounts.dueToday = round2(amounts.dueToday + amount);
        buckets.current = round2(buckets.current + amount);
        break;
      case 'due_soon':
        amounts.dueSoon = round2(amounts.dueSoon + amount);
        buckets.current = round2(buckets.current + amount);
        break;
      case 'not_due':
        amounts.notDue = round2(amounts.notDue + amount);
        buckets.current = round2(buckets.current + amount);
        break;
      default:
        amounts.noDueDate = round2(amounts.noDueDate + amount);
        buckets.noDueDate = round2(buckets.noDueDate + amount);
    }
    if (due && cls.state !== 'overdue' && (!nextDueDate || due < nextDueDate)) {
      nextDueDate = due;
      nextDueAmount = amount;
    } else if (due && due === nextDueDate && cls.state !== 'overdue') {
      nextDueAmount = round2(nextDueAmount + amount);
    }
    const bandIndex = cls.state === 'overdue' ? bandIndexFor(cls.daysOverdue, settings.bands) : -1;
    return {
      kind: item.kind,
      entryType: item.entryType,
      invoiceId: item.invoiceId || null,
      ledgerEntryId: item.ledgerEntryId || null,
      reference: item.reference || null,
      invoiceNumber: item.invoiceNumber || null,
      billNumber: item.billNumber || null,
      description: item.description || null,
      date: calendarOf(item.date),
      dueDate: due,
      dueSource: source,
      total: item.total !== undefined ? round2(item.total) : null,
      openAmount: amount,
      state: cls.state,
      daysOverdue: cls.daysOverdue,
      daysUntilDue: cls.daysUntilDue,
      bandIndex,
    };
  });

  const openAmount = round2(items.reduce((sum, item) => sum + item.openAmount, 0));
  const lateEnough = amounts.overdue > EPS && amounts.overdue + EPS >= settings.minAmount;
  let state = 'clear';
  if (openAmount <= EPS) state = 'clear';
  else if (lateEnough) state = 'overdue';
  else if (amounts.dueToday > EPS) state = 'due_today';
  else if (amounts.dueSoon > EPS) state = 'due_soon';
  else if (amounts.notDue > EPS || amounts.overdue > EPS) state = 'current';
  else state = 'no_due_date';

  const bandIndex = state === 'overdue' ? bandIndexFor(oldestDaysOverdue, settings.bands) : -1;

  const summary = {
    customerId: String(customer._id),
    name: customer.name,
    nameUrdu: customer.nameUrdu,
    phone: customer.phone,
    whatsapp: customer.whatsapp,
    balance: round2(customer.balance),
    openAmount,
    pendingAmount: amounts.pending,
    overdueAmount: amounts.overdue,
    overdueCount,
    oldestDaysOverdue: state === 'overdue' ? oldestDaysOverdue : 0,
    oldestDueDate: state === 'overdue' ? oldestDueDate : null,
    dueTodayAmount: amounts.dueToday,
    dueSoonAmount: amounts.dueSoon,
    notDueAmount: amounts.notDue,
    noDueDateAmount: amounts.noDueDate,
    nextDueDate,
    nextDueAmount: round2(nextDueAmount),
    buckets,
    state,
    bandIndex,
  };
  if (includeItems) {
    // Oldest first reads naturally on a statement.
    summary.items = detailed.sort((a, b) => String(a.dueDate || a.date || '').localeCompare(String(b.dueDate || b.date || '')));
  } else {
    summary.topOverdue = detailed
      .filter((item) => item.state === 'overdue')
      .sort((a, b) => b.daysOverdue - a.daysOverdue)
      .slice(0, 3);
  }
  return summary;
};

/**
 * Aging for a set of customers (lean docs with _id, name, balance, paymentTerms…).
 * @returns {Promise<Object[]>} one summary per customer that owes something
 */
const computeAging = async ({ organizationId, customers, settings, now = new Date(), includeItems = false }) => {
  const todayYmd = toBusinessCalendarDate(now);
  const [ledgerItems, pendingItems] = await Promise.all([
    loadLedgerOpenItems(organizationId, customers),
    settings.applyToPending ? loadPendingOpenItems(organizationId, customers.map((c) => c._id)) : Promise.resolve(new Map()),
  ]);
  const rows = [];
  for (const customer of customers) {
    const key = String(customer._id);
    const items = [...(ledgerItems.get(key) || []), ...(pendingItems.get(key) || [])];
    if (!items.length) continue;
    rows.push(summarize(customer, items, settings, todayYmd, { includeItems }));
  }
  return rows;
};

const STATE_RANK = { overdue: 0, due_today: 1, due_soon: 2, current: 3, no_due_date: 4, clear: 5 };

/** Customers in scope who owe something (or have an open pending invoice), lean. */
const loadOwingCustomers = async ({ organizationId, branchId, settings }) => {
  const scope = { organizationId, isEmployeeAccount: { $ne: true }, isSupplierAccount: { $ne: true } };
  if (branchId) scope.branchId = branchId;

  let pendingCustomerIds = [];
  if (settings.applyToPending) {
    const pendingFilter = { organizationId, type: 'pending', isConvertedToBill: { $ne: true }, status: { $ne: 'cancelled' } };
    if (branchId) pendingFilter.branchId = branchId;
    pendingCustomerIds = (await Invoice.distinct('customerId', pendingFilter))
      .map(String)
      .filter((id) => mongoose.Types.ObjectId.isValid(id));
  }

  return Customer.find({
    ...scope,
    $or: [{ balance: { $gt: EPS } }, ...(pendingCustomerIds.length ? [{ _id: { $in: pendingCustomerIds } }] : [])],
  })
    .select('name nameUrdu phone whatsapp balance paymentTerms')
    .lean();
};

/**
 * Every customer in scope who owes something, with their aging + colour band, plus totals
 * per band. One call feeds the customer lists' colours and the Overdue Ledgers report.
 * @param {{organizationId, branchId?, now?}} params
 */
const getStatusBoard = async ({ organizationId, branchId, now = new Date() }) => {
  const settings = await getSettings(organizationId);
  const customers = await loadOwingCustomers({ organizationId, branchId, settings });
  const rows = await computeAging({ organizationId, customers, settings, now });
  rows.sort(
    (a, b) =>
      STATE_RANK[a.state] - STATE_RANK[b.state] ||
      b.oldestDaysOverdue - a.oldestDaysOverdue ||
      b.overdueAmount - a.overdueAmount ||
      b.openAmount - a.openAmount
  );

  const totals = {
    customersOwing: rows.length,
    openAmount: 0,
    overdueCustomers: 0,
    overdueAmount: 0,
    dueTodayCustomers: 0,
    dueTodayAmount: 0,
    dueSoonCustomers: 0,
    dueSoonAmount: 0,
    noDueDateAmount: 0,
    buckets: emptyBuckets(),
    bands: settings.bands.map((band, index) => ({ index, ...band, customers: 0, amount: 0 })),
  };
  for (const row of rows) {
    totals.openAmount = round2(totals.openAmount + row.openAmount);
    totals.noDueDateAmount = round2(totals.noDueDateAmount + row.noDueDateAmount);
    Object.keys(totals.buckets).forEach((key) => {
      totals.buckets[key] = round2(totals.buckets[key] + (row.buckets[key] || 0));
    });
    if (row.state === 'overdue') {
      totals.overdueCustomers += 1;
      totals.overdueAmount = round2(totals.overdueAmount + row.overdueAmount);
      const band = totals.bands[row.bandIndex];
      if (band) {
        band.customers += 1;
        band.amount = round2(band.amount + row.overdueAmount);
      }
    }
    if (row.dueTodayAmount > EPS) {
      totals.dueTodayCustomers += 1;
      totals.dueTodayAmount = round2(totals.dueTodayAmount + row.dueTodayAmount);
    }
    if (row.dueSoonAmount > EPS) {
      totals.dueSoonCustomers += 1;
      totals.dueSoonAmount = round2(totals.dueSoonAmount + row.dueSoonAmount);
    }
  }

  return { generatedAt: now.toISOString(), today: toBusinessCalendarDate(now), settings, totals, rows };
};

/** One customer's aging with every open item — the ledger page's "Due & overdue" card. */
const getCustomerAging = async ({ organizationId, customerId, now = new Date() }) => {
  const settings = await getSettings(organizationId);
  const customer = await Customer.findOne({ _id: customerId, organizationId })
    .select('name nameUrdu phone whatsapp balance paymentTerms')
    .lean();
  if (!customer) return { settings, today: toBusinessCalendarDate(now), aging: null };
  const [aging] = await computeAging({ organizationId, customers: [customer], settings, now, includeItems: true });
  return {
    settings,
    today: toBusinessCalendarDate(now),
    customer: { id: String(customer._id), name: customer.name, paymentTerms: customer.paymentTerms || null },
    aging: aging || null,
  };
};

module.exports = {
  DEFAULT_SETTINGS,
  PAYMENT_TERM_DAYS,
  normalizeSettings,
  getSettings,
  updateSettings,
  resolveDefaultDueCalendar,
  applyDefaultDueDate,
  bandIndexFor,
  classifyItem,
  computeAging,
  loadOwingCustomers,
  getStatusBoard,
  getCustomerAging,
  // exported for tests
  _internal: { addDays, daysBetween, calendarOf, toStoredDueDate },
};
