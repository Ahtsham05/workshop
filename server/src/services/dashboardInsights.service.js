const mongoose = require('mongoose');
const {
  Invoice,
  Purchase,
  Expense,
  SalesReturn,
  ServiceInvoice,
  SimSale,
  CustomerPayment,
  SupplierPayment,
  CustomerLedger,
  Supplier,
  SupplierLedger,
} = require('../models');
const { getBusinessTimeZone, toBusinessCalendarDate, startOfBusinessDay, endOfBusinessDay } = require('../utils/businessTimezone');
const { shiftCalendarDate } = require('../utils/dashboardDateRange');
const ledgerAlertsService = require('./ledgerAlerts.service');

/**
 * Dashboard insight widgets (Profit & Loss trend, Sales trend, Expenses by category,
 * Due invoices / Bills to pay, Accounts receivable / payable aging, Track money).
 *
 * The figures follow the same rules as the rest of the app, so a widget never disagrees
 * with the report its ↗ link opens:
 *   • Profit & Loss = Reports → Profit & Loss (reports.controller#getProfitLossReport), per
 *     month: income = sales − sales returns + services + SIM sales; cost of goods = invoice
 *     cost + SIM cost; expenses = every expense (direct + indirect); ledger discounts
 *     allowed/received are netted into net profit. Quotations and drafts are not sales.
 *   • Receivables are ledger-true (ledgerAlerts.service): a customer's balance is matched
 *     against their newest unpaid amounts, so payments clear the oldest invoices first and a
 *     settled ledger is never "overdue". Payables use the same method on supplier balances.
 *   • Money in/out is real money: amounts paid at the counter on sales/purchases, posted
 *     customer/supplier payments and refunds, and paid expenses. Months after this one are
 *     the open receivables/payables falling due in that month (expected, not yet real).
 *
 * Every key that carries cost or profit is named so (costOfGoods, netProfit…) — the
 * /dashboard router strips those for roles without viewCostPrices (middlewares/costVisibility).
 */

const EPS = 0.005;
const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;
const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));
const NOT_A_SALE = { type: { $ne: 'quotation' }, status: { $nin: ['cancelled', 'draft'] } };

/* ── Ranges ─────────────────────────────────────────────────────────────────── */

const TREND_RANGES = {
  '30d': { days: 30, granularity: 'day' },
  '90d': { days: 90, granularity: 'month' },
  '180d': { days: 180, granularity: 'month' },
  '365d': { days: 365, granularity: 'month' },
  ytd: { granularity: 'month' },
};
const DEFAULT_TREND_RANGE = '180d';

const monthKeyOf = (ymd) => ymd.slice(0, 7);
const addMonths = (monthKey, n) => {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const lastDayOfMonth = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  return `${monthKey}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`;
};

/** Every bucket key between two calendar dates, so empty days/months still get a bar. */
const bucketKeys = (startYmd, endYmd, granularity) => {
  const keys = [];
  if (granularity === 'day') {
    for (let ymd = startYmd; ymd <= endYmd; ymd = shiftCalendarDate(ymd, 1)) keys.push(ymd);
    return keys;
  }
  for (let key = monthKeyOf(startYmd); key <= monthKeyOf(endYmd); key = addMonths(key, 1)) keys.push(key);
  return keys;
};

const resolveTrendRange = (rangeKey, now = new Date()) => {
  const key = TREND_RANGES[rangeKey] ? rangeKey : DEFAULT_TREND_RANGE;
  const { days, granularity } = TREND_RANGES[key];
  const endCalendar = toBusinessCalendarDate(now);
  const startCalendar = key === 'ytd' ? `${endCalendar.slice(0, 4)}-01-01` : shiftCalendarDate(endCalendar, -(days - 1));
  return {
    range: key,
    granularity,
    startCalendar,
    endCalendar,
    startDate: startOfBusinessDay(startCalendar),
    endDate: endOfBusinessDay(endCalendar),
    keys: bucketKeys(startCalendar, endCalendar, granularity),
  };
};

const bucketExpr = (field, granularity) => ({
  $dateToString: { format: granularity === 'day' ? '%Y-%m-%d' : '%Y-%m', date: field, timezone: getBusinessTimeZone() },
});

const byBucket = (rows) => new Map(rows.map((row) => [row._id, row]));

/* ── Profit & Loss, sales and expense trends ────────────────────────────────── */

/**
 * @param {{ scope: {organizationId: ObjectId, branchId?: ObjectId}, range?: string, now?: Date }} params
 */
const getTrends = async ({ scope, range, now = new Date() }) => {
  const r = resolveTrendRange(range, now);
  const inRange = (field) => ({ [field]: { $gte: r.startDate, $lte: r.endDate } });
  const group = (field, fields) => ({ $group: { _id: bucketExpr(field, r.granularity), ...fields } });

  const [invoices, returns, services, sims, expenses, expenseCategories, discountsAllowed, discountsReceived] = await Promise.all([
    Invoice.aggregate([
      { $match: { ...scope, ...inRange('invoiceDate'), ...NOT_A_SALE } },
      group('$invoiceDate', {
        sales: { $sum: { $ifNull: ['$total', 0] } },
        cost: { $sum: { $ifNull: ['$totalCost', 0] } },
        profit: { $sum: { $ifNull: ['$totalProfit', 0] } },
        count: { $sum: 1 },
      }),
    ]),
    SalesReturn.aggregate([
      { $match: { ...scope, ...inRange('date'), status: { $ne: 'rejected' } } },
      group('$date', { amount: { $sum: { $ifNull: ['$totalAmount', 0] } }, count: { $sum: 1 } }),
    ]),
    ServiceInvoice.aggregate([
      { $match: { ...scope, ...inRange('date') } },
      group('$date', { amount: { $sum: { $ifNull: ['$totalAmount', 0] } } }),
    ]),
    SimSale.aggregate([
      { $match: { ...scope, ...inRange('date') } },
      group('$date', {
        amount: { $sum: { $ifNull: ['$saleAmount', 0] } },
        cost: { $sum: { $ifNull: ['$purchaseAmount', 0] } },
      }),
    ]),
    Expense.aggregate([
      { $match: { ...scope, ...inRange('date') } },
      group('$date', { amount: { $sum: { $ifNull: ['$amount', 0] } } }),
    ]),
    Expense.aggregate([
      { $match: { ...scope, ...inRange('date') } },
      {
        $group: {
          _id: { $ifNull: ['$category', 'Uncategorised'] },
          amount: { $sum: { $ifNull: ['$amount', 0] } },
          count: { $sum: 1 },
        },
      },
      { $sort: { amount: -1 } },
    ]),
    CustomerLedger.aggregate([
      { $match: { ...scope, ...inRange('transactionDate'), transactionType: 'discount_allowed' } },
      group('$transactionDate', { amount: { $sum: { $ifNull: ['$credit', 0] } } }),
    ]),
    SupplierLedger.aggregate([
      { $match: { ...scope, ...inRange('transactionDate'), transactionType: 'discount_received' } },
      group('$transactionDate', { amount: { $sum: { $ifNull: ['$debit', 0] } } }),
    ]),
  ]);

  const maps = {
    invoices: byBucket(invoices),
    returns: byBucket(returns),
    services: byBucket(services),
    sims: byBucket(sims),
    expenses: byBucket(expenses),
    allowed: byBucket(discountsAllowed),
    received: byBucket(discountsReceived),
  };
  const val = (map, key, field = 'amount') => Number(maps[map].get(key)?.[field]) || 0;

  const buckets = r.keys.map((key) => {
    const sales = val('invoices', key, 'sales');
    const invoiceCost = val('invoices', key, 'cost');
    // Same fallback as the P&L report: older invoices may carry only one of cost/profit.
    const invoiceProfit = val('invoices', key, 'profit') || sales - invoiceCost;
    const salesReturns = val('returns', key);
    const serviceIncome = val('services', key);
    const simSales = val('sims', key);
    const simCost = val('sims', key, 'cost');
    const expensesAmount = val('expenses', key);
    const ledgerDiscounts = val('received', key) - val('allowed', key);

    const income = sales - salesReturns + serviceIncome + simSales;
    // P&L report: sales profit = invoice profit − returns + services + SIM profit, so the
    // cost of goods is whatever separates income from that profit.
    const salesProfit = invoiceProfit - salesReturns + serviceIncome + (simSales - simCost);
    const netProfit = salesProfit - expensesAmount + ledgerDiscounts;
    return {
      key,
      income: round2(income),
      sales: round2(sales),
      salesReturns: round2(salesReturns),
      invoiceCount: val('invoices', key, 'count'),
      returnCount: val('returns', key, 'count'),
      costOfGoods: round2(income - salesProfit),
      expenses: round2(expensesAmount),
      ledgerDiscountNet: round2(ledgerDiscounts),
      netProfit: round2(netProfit),
    };
  });

  const sum = (field) => round2(buckets.reduce((acc, b) => acc + (b[field] || 0), 0));
  const totalExpenses = round2(expenseCategories.reduce((acc, row) => acc + (row.amount || 0), 0));

  return {
    range: r.range,
    granularity: r.granularity,
    startDate: r.startCalendar,
    endDate: r.endCalendar,
    buckets,
    totals: {
      income: sum('income'),
      sales: sum('sales'),
      salesReturns: sum('salesReturns'),
      invoiceCount: buckets.reduce((acc, b) => acc + b.invoiceCount, 0),
      costOfGoods: sum('costOfGoods'),
      expenses: totalExpenses,
      ledgerDiscountNet: sum('ledgerDiscountNet'),
      netProfit: sum('netProfit'),
    },
    expensesByCategory: expenseCategories.map((row) => ({
      category: String(row._id || 'Uncategorised'),
      amount: round2(row.amount),
      count: row.count,
    })),
  };
};

/* ── Receivables & payables aging ───────────────────────────────────────────── */

const AGE_BUCKETS = [
  { key: 'd0_30', from: 0, to: 30 },
  { key: 'd31_60', from: 31, to: 60 },
  { key: 'd61_90', from: 61, to: 90 },
  { key: 'd90_plus', from: 91, to: Infinity },
];

const daysSince = (ymd, todayYmd) =>
  Math.round((Date.parse(`${todayYmd}T00:00:00Z`) - Date.parse(`${ymd}T00:00:00Z`)) / DAY_MS);

const DUE_STATE_FIELD = { overdue: 'overdue', due_today: 'dueToday', due_soon: 'dueSoon', not_due: 'notDue' };

/**
 * Totals of open items (already classified by due date) for one side — receivable or payable:
 * by due status (the org's Due Dates & Ledger Colours rules) and by age (days since the
 * invoice/bill date; `undated` = balance no document explains: very old data, imports).
 */
const createOpenSummary = (todayYmd) => {
  const due = { overdue: 0, dueToday: 0, dueSoon: 0, notDue: 0, noDueDate: 0 };
  const age = { d0_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0, undated: 0 };
  let total = 0;
  let parties = 0;
  let overdueParties = 0;

  const addItem = (item) => {
    const amount = Number(item.openAmount) || 0;
    if (amount <= EPS) return;
    total += amount;
    due[DUE_STATE_FIELD[item.state] || 'noDueDate'] += amount;
    if (!item.date) {
      age.undated += amount;
      return;
    }
    const days = Math.max(0, daysSince(item.date, todayYmd));
    age[AGE_BUCKETS.find((b) => days >= b.from && days <= b.to).key] += amount;
  };
  const addParty = (isOverdue) => {
    parties += 1;
    if (isOverdue) overdueParties += 1;
  };
  const toJSON = () => ({
    total: round2(total),
    parties,
    overdueParties,
    ...Object.fromEntries(Object.entries(due).map(([k, v]) => [k, round2(v)])),
    age: Object.fromEntries(Object.entries(age).map(([k, v]) => [k, round2(v)])),
  });
  return { addItem, addParty, toJSON };
};

/** Adds an item's open amount to the expected-money bucket of the month it falls due in. */
const addExpected = (expectedByMonth, item, firstFutureMonth, lastMonth) => {
  if (!item.dueDate || item.state === 'overdue') return;
  const month = monthKeyOf(item.dueDate);
  if (month < firstFutureMonth || month > lastMonth) return;
  expectedByMonth.set(month, (expectedByMonth.get(month) || 0) + (Number(item.openAmount) || 0));
};

/**
 * Open items per supplier, ledger-true — the supplier-side mirror of
 * ledgerAlerts.loadLedgerOpenItems: Supplier.balance is matched against the newest unpaid
 * purchase amounts (+ ledger credits that are not purchases: opening balances, adjustments…),
 * so payments clear the oldest bills first. Whatever no document explains is undated.
 */
const loadSupplierOpenItems = async ({ organizationId, branchId }) => {
  const supplierFilter = { organizationId: toObjectId(organizationId), balance: { $gt: EPS } };
  if (branchId) supplierFilter.branchId = toObjectId(branchId);
  const suppliers = await Supplier.find(supplierFilter).select('_id balance').lean();
  const result = new Map();
  if (!suppliers.length) return { suppliers, items: result };

  const objectIds = suppliers.map((s) => toObjectId(s._id));
  const remaining = new Map(suppliers.map((s) => [String(s._id), round2(s.balance)]));

  const cursor = Purchase.aggregate([
    { $match: { organizationId: toObjectId(organizationId), supplier: { $in: objectIds } } },
    {
      $project: {
        _id: 0,
        party: { $toString: '$supplier' },
        date: { $ifNull: ['$purchaseDate', '$createdAt'] },
        sortId: '$_id',
        dueDate: '$dueDate',
        amount: { $subtract: [{ $ifNull: ['$totalAmount', 0] }, { $ifNull: ['$paidAmount', 0] }] },
      },
    },
    { $match: { amount: { $gt: EPS } } },
    {
      $unionWith: {
        coll: SupplierLedger.collection.name,
        pipeline: [
          {
            $match: {
              supplier: { $in: objectIds },
              credit: { $gt: 0 },
              $or: [{ transactionType: { $ne: 'purchase' } }, { referenceId: { $exists: false } }, { referenceId: null }],
            },
          },
          { $project: { _id: 0, party: { $toString: '$supplier' }, date: '$transactionDate', sortId: '$_id', amount: '$credit' } },
        ],
      },
    },
    { $sort: { party: 1, date: -1, sortId: -1 } },
  ])
    .allowDiskUse(true)
    .cursor({ batchSize: 1000 });

  const take = (row) => {
    const left = remaining.get(row.party) || 0;
    if (left <= EPS) return; // older than what the balance still covers = paid off
    const openAmount = round2(Math.min(left, Number(row.amount) || 0));
    remaining.set(row.party, round2(left - openAmount));
    if (!result.has(row.party)) result.set(row.party, []);
    result.get(row.party).push({ date: row.date, dueDate: row.dueDate || null, openAmount });
  };
  // Streamed: a supplier with years of bills never loads them all at once.
  // eslint-disable-next-line no-restricted-syntax
  for await (const row of cursor) take(row);
  remaining.forEach((left, party) => {
    if (left > EPS) take({ party, date: null, dueDate: null, amount: left });
  });
  return { suppliers, items: result };
};

const calendarOf = (value) => (value ? toBusinessCalendarDate(new Date(value)) : null);

/** A bill's due day: its own due date, else (when the org says so) its date + default days. */
const resolveBillDue = (item, settings) => {
  if (item.dueDate) return toBusinessCalendarDate(new Date(item.dueDate));
  const date = calendarOf(item.date);
  if (date && settings.undatedRule === 'default_days') return shiftCalendarDate(date, settings.defaultDueDays);
  return null;
};

/* ── Money in / out by month ────────────────────────────────────────────────── */

const PAST_MONTHS = 4; // including this month
const FUTURE_MONTHS = 2;

/**
 * Receivable + payable summaries and the Track Money months, in one pass (the expected
 * months come from the same open items the aging is built from).
 * @param {{ organizationId, branchId?, now?: Date }} params
 */
const getMoneyOverview = async ({ organizationId, branchId, now = new Date() }) => {
  const todayYmd = toBusinessCalendarDate(now);
  const thisMonth = monthKeyOf(todayYmd);
  const firstMonth = addMonths(thisMonth, -(PAST_MONTHS - 1));
  const firstFutureMonth = addMonths(thisMonth, 1);
  const lastMonth = addMonths(thisMonth, FUTURE_MONTHS);
  const actualStart = startOfBusinessDay(`${firstMonth}-01`);
  const actualEnd = endOfBusinessDay(lastDayOfMonth(thisMonth));

  const scope = { organizationId: toObjectId(organizationId) };
  if (branchId) scope.branchId = toObjectId(branchId);
  const inRange = (field) => ({ [field]: { $gte: actualStart, $lte: actualEnd } });
  const monthly = (field, amountExpr) => ({
    $group: { _id: bucketExpr(field, 'month'), amount: { $sum: amountExpr } },
  });
  const paymentsByDirection = (Model) =>
    Model.aggregate([
      { $match: { ...scope, ...inRange('paymentDate'), status: 'posted', direction: { $in: ['payment', 'refund'] } } },
      {
        $group: {
          _id: { month: bucketExpr('$paymentDate', 'month'), direction: '$direction' },
          amount: { $sum: { $ifNull: ['$amount', 0] } },
        },
      },
    ]);

  const settings = await ledgerAlertsService.getSettings(organizationId);
  const [customers, supplierOpen, salesPaid, purchasesPaid, customerPayments, supplierPayments, expensesPaid] =
    await Promise.all([
      ledgerAlertsService.loadOwingCustomers({ organizationId, branchId, settings }),
      loadSupplierOpenItems({ organizationId, branchId }),
      Invoice.aggregate([
        { $match: { ...scope, ...inRange('invoiceDate'), ...NOT_A_SALE, paidAmount: { $gt: 0 } } },
        monthly('$invoiceDate', '$paidAmount'),
      ]),
      Purchase.aggregate([
        { $match: { ...scope, ...inRange('purchaseDate'), paidAmount: { $gt: 0 } } },
        monthly('$purchaseDate', '$paidAmount'),
      ]),
      paymentsByDirection(CustomerPayment),
      paymentsByDirection(SupplierPayment),
      Expense.aggregate([
        { $match: { ...scope, ...inRange('date'), isPaid: { $ne: false } } },
        monthly('$date', { $ifNull: ['$amount', 0] }),
      ]),
    ]);

  // Receivables: the ledger-alerts items, classified by the org's due-date rules.
  const customerRows = await ledgerAlertsService.computeAging({ organizationId, customers, settings, now, includeItems: true });
  const receivable = createOpenSummary(todayYmd);
  const expectedIn = new Map();
  customerRows.forEach((row) => {
    if (row.openAmount <= EPS) return;
    receivable.addParty(row.overdueAmount > EPS);
    (row.items || []).forEach((item) => {
      receivable.addItem(item);
      addExpected(expectedIn, item, firstFutureMonth, lastMonth);
    });
  });

  // Payables: classified with the same rules (classifyItem) so both cards read alike.
  const payable = createOpenSummary(todayYmd);
  const expectedOut = new Map();
  supplierOpen.items.forEach((items) => {
    let partyOpen = 0;
    let partyOverdue = false;
    items.forEach((raw) => {
      const due = resolveBillDue(raw, settings);
      const cls = ledgerAlertsService.classifyItem(due, todayYmd, settings);
      const item = { ...raw, date: calendarOf(raw.date), dueDate: due, state: cls.state };
      partyOpen += raw.openAmount;
      if (cls.state === 'overdue') partyOverdue = true;
      payable.addItem(item);
      addExpected(expectedOut, item, firstFutureMonth, lastMonth);
    });
    if (partyOpen > EPS) payable.addParty(partyOverdue);
  });

  const sumMap = (rows) => byBucket(rows);
  const sales = sumMap(salesPaid);
  const purchases = sumMap(purchasesPaid);
  const expenses = sumMap(expensesPaid);
  const paymentAmount = (rows, month, direction) =>
    Number(rows.find((row) => row._id.month === month && row._id.direction === direction)?.amount) || 0;

  const months = [];
  for (let month = firstMonth; month <= lastMonth; month = addMonths(month, 1)) {
    if (month <= thisMonth) {
      // Customer refunds are money out; supplier refunds are money back in.
      const moneyIn =
        (Number(sales.get(month)?.amount) || 0) +
        paymentAmount(customerPayments, month, 'payment') +
        paymentAmount(supplierPayments, month, 'refund');
      const moneyOut =
        (Number(purchases.get(month)?.amount) || 0) +
        paymentAmount(supplierPayments, month, 'payment') +
        paymentAmount(customerPayments, month, 'refund') +
        (Number(expenses.get(month)?.amount) || 0);
      months.push({ key: month, moneyIn: round2(moneyIn), moneyOut: round2(moneyOut), expected: false });
    } else {
      months.push({
        key: month,
        moneyIn: round2(expectedIn.get(month) || 0),
        moneyOut: round2(expectedOut.get(month) || 0),
        expected: true,
      });
    }
  }

  return {
    today: todayYmd,
    dueDatesEnabled: Boolean(settings.dueDatesEnabled),
    receivable: receivable.toJSON(),
    payable: payable.toJSON(),
    cashFlow: { months, pastMonths: PAST_MONTHS, futureMonths: FUTURE_MONTHS },
  };
};

module.exports = {
  TREND_RANGES,
  resolveTrendRange,
  getTrends,
  getMoneyOverview,
  // exported for tests
  _internal: { bucketKeys, addMonths, lastDayOfMonth, loadSupplierOpenItems, resolveBillDue },
};
