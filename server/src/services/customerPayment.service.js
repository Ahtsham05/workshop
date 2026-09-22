const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { CustomerPayment, Invoice, Customer, CustomerLedger, SalesReturn } = require('../models');
const ApiError = require('../utils/ApiError');
const Money = require('../utils/money');
const { formatMoney } = require('../utils/money');
const {
  SETTLEMENT_EPSILON,
  buildSettlementAddFieldsStage,
  resolveInvoiceSettlement,
} = require('../utils/invoiceSettlement');
const customerLedgerService = require('./customerLedger.service');

const DEFAULT_PAYMENT_SEQ = 1000;
/** Sorts undated invoices behind every dated one under the due-date strategy. */
const NO_DUE_DATE_SORT_KEY = new Date('9999-12-31');

const toObjectId = (id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id);

const toNumber = (value) => Number(value || 0);

/**
 * Invoice.customerId is a Mixed field ('walk-in' or a customer id) that nothing casts to a
 * real ObjectId on save — invoice.service.js's createInvoice stores whatever string the
 * request body sent. Mongoose's own find()/paginate() auto-cast a query value against the
 * schema when the field IS a plain ObjectId type, but Mixed has no type to cast to, and
 * aggregate() pipelines skip that casting layer entirely regardless of field type. So every
 * `Invoice.aggregate()` match against customerId here has to accept BOTH encodings rather
 * than assume one — this returns both so a $match/$in never silently returns zero rows.
 */
const toCustomerIdMatchValues = (id) => {
  const str = String(id).trim();
  return mongoose.Types.ObjectId.isValid(str) ? [str, new mongoose.Types.ObjectId(str)] : [str];
};

/**
 * Next payment number (CP-####). Same highest-trailing-suffix scan as
 * supplierPayment.service.js's generateNextPaymentNumber, computed inside MongoDB so it
 * doesn't pull every payment across the wire.
 */
const generateNextPaymentNumber = async (organizationId) => {
  const [result] = await CustomerPayment.aggregate([
    { $match: { organizationId: toObjectId(organizationId), paymentNumber: { $regex: /(\d+)$/ } } },
    {
      $project: {
        seq: {
          $let: {
            vars: { m: { $regexFind: { input: '$paymentNumber', regex: /(\d+)$/ } } },
            in: { $toInt: { $arrayElemAt: ['$$m.captures', 0] } },
          },
        },
      },
    },
    { $group: { _id: null, maxSeq: { $max: '$seq' } } },
  ]);

  const maxSeq = Math.max(DEFAULT_PAYMENT_SEQ, result?.maxSeq ?? DEFAULT_PAYMENT_SEQ);
  return `CP-${maxSeq + 1}`;
};

/**
 * Every invoice of this customer that still owes something, in the order the chosen strategy
 * wants to clear them. Only real receivables count — quotations were never sold, and pending
 * (goods-handed-over-unbilled) invoices don't post to the Customer Ledger until converted to
 * a bill, so neither should be settled by a payment yet.
 *
 * @param {Object} params
 * @param {'fifo'|'due_date'|'manual'|'reference'} [params.strategy='fifo']
 * @param {string[]} [params.invoiceIds] restrict to these invoices (manual/reference modes)
 * @returns {Promise<Array>} open invoices with their live settlement snapshot
 */
const getOpenInvoicesForCustomer = async ({ organizationId, branchId, customer, strategy = 'fifo', invoiceIds }) => {
  const match = { customerId: { $in: toCustomerIdMatchValues(customer) }, type: { $in: ['cash', 'credit'] } };
  if (organizationId) match.organizationId = toObjectId(organizationId);
  if (branchId) match.branchId = toObjectId(branchId);
  if (Array.isArray(invoiceIds) && invoiceIds.length > 0) {
    match._id = { $in: invoiceIds.map(toObjectId) };
  }

  // Oldest-first is the ERP default ("FIFO"); due-date-first re-orders by when the money is
  // contractually owed, pushing undated invoices to the back rather than dropping them.
  const sort =
    strategy === 'due_date'
      ? { dueSortKey: 1, invoiceDate: 1, createdAt: 1 }
      : { invoiceDate: 1, createdAt: 1 };

  return Invoice.aggregate([
    { $match: match },
    buildSettlementAddFieldsStage(),
    { $match: { remainingAmount: { $gt: SETTLEMENT_EPSILON } } },
    { $addFields: { dueSortKey: { $ifNull: ['$dueDate', NO_DUE_DATE_SORT_KEY] } } },
    { $sort: sort },
    {
      $project: {
        _id: 1,
        invoiceNumber: 1,
        billNumber: 1,
        invoiceDate: 1,
        dueDate: 1,
        total: 1,
        paidAmount: 1,
        allocatedAmount: 1,
        settledAmount: 1,
        remainingAmount: 1,
        settlementStatus: 1,
        dueStatus: 1,
        itemsCount: { $size: { $ifNull: ['$items', []] } },
      },
    },
  ]);
};

/**
 * Decide which invoices a given amount pays off, without touching anything.
 *
 * FIFO/due-date walk the ordered open invoices and pour the money in until it runs out —
 * each invoice takes at most what it still owes, so the last one funded is the only one that
 * can end up partial. Manual mode takes the caller's per-invoice amounts as-is (each still
 * capped at that invoice's outstanding, so a typo can't overpay a single invoice). Whatever
 * is left over after every open invoice is full becomes `unappliedAmount` — the customer's
 * advance/credit balance, which a later invoice can draw on.
 *
 * All arithmetic is in integer minor units (see utils/money.js) so repeated part-payments
 * can never leave a 0.00000001 crumb that keeps an invoice looking unpaid forever.
 *
 * @returns {{allocations: Array, allocatedTotal: number, unappliedAmount: number}}
 */
const planAllocation = ({ openInvoices, amount, mode = 'fifo', manualAllocations = [] }) => {
  const amountMinor = Money.toMinorUnits(amount);
  if (amountMinor <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment amount must be greater than zero');
  }

  const allocations = [];
  let remainingMinor = amountMinor;

  const pushAllocation = (invoice, allocMinor) => {
    if (allocMinor <= 0) return;
    allocations.push({
      invoice: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate || null,
      invoiceTotal: toNumber(invoice.total),
      outstandingBefore: toNumber(invoice.remainingAmount),
      amount: Money.fromMinorUnits(allocMinor),
    });
  };

  if (mode === 'manual' || mode === 'reference') {
    const byId = new Map(openInvoices.map((invoice) => [String(invoice._id), invoice]));
    for (const line of manualAllocations) {
      const invoice = byId.get(String(line.invoiceId || line.invoice));
      if (!invoice) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          'One of the selected invoices is no longer outstanding — reopen the payment to refresh the list'
        );
      }
      const requestedMinor = Money.toMinorUnits(line.amount);
      if (requestedMinor <= 0) continue;
      const outstandingMinor = Money.toMinorUnits(invoice.remainingAmount);
      if (requestedMinor > outstandingMinor) {
        throw new ApiError(
          httpStatus.BAD_REQUEST,
          `Cannot apply more than the ${formatMoney(invoice.remainingAmount)} still outstanding on invoice ${invoice.invoiceNumber}`
        );
      }
      if (requestedMinor > remainingMinor) {
        throw new ApiError(httpStatus.BAD_REQUEST, 'Allocated amounts add up to more than the payment amount');
      }
      remainingMinor -= requestedMinor;
      pushAllocation(invoice, requestedMinor);
    }
  } else if (mode !== 'none') {
    for (const invoice of openInvoices) {
      if (remainingMinor <= 0) break;
      const outstandingMinor = Money.toMinorUnits(invoice.remainingAmount);
      if (outstandingMinor <= 0) continue;
      const allocMinor = Math.min(outstandingMinor, remainingMinor);
      remainingMinor -= allocMinor;
      pushAllocation(invoice, allocMinor);
    }
  }

  return {
    allocations,
    allocatedTotal: Money.fromMinorUnits(amountMinor - remainingMinor),
    unappliedAmount: Money.fromMinorUnits(remainingMinor),
  };
};

/** Push each planned allocation onto its invoice. Reversible via `releaseAllocations`. */
const applyAllocationsToInvoices = async (allocations) => {
  for (const allocation of allocations) {
    await Invoice.updateOne({ _id: allocation.invoice }, { $inc: { allocatedAmount: allocation.amount } });
  }
};

/** Hand every allocated rupee back to its invoice (void / re-allocate). */
const releaseAllocations = async (allocations) => {
  for (const allocation of allocations) {
    await Invoice.updateOne({ _id: allocation.invoice }, { $inc: { allocatedAmount: -allocation.amount } });
  }
  // Floating-point crumbs and manual DB edits can leave a hair below zero; clamp so the
  // settlement math never reports a negative "already paid".
  await Invoice.updateMany(
    { _id: { $in: allocations.map((a) => a.invoice) }, allocatedAmount: { $lt: 0 } },
    { $set: { allocatedAmount: 0 } }
  );
};

const historyEntry = (action, user, details, amount) => ({
  action,
  at: new Date(),
  by: user?.id || user?._id,
  byName: user?.name || user?.email,
  details,
  amount,
});

/** Unapplied credit (advance) this customer is currently holding with us. */
const getCustomerCreditBalance = async ({ organizationId, branchId, customer }) => {
  const match = { customer: toObjectId(customer), status: 'posted', direction: 'payment' };
  if (organizationId) match.organizationId = toObjectId(organizationId);
  if (branchId) match.branchId = toObjectId(branchId);

  const [result] = await CustomerPayment.aggregate([
    { $match: match },
    { $group: { _id: null, credit: { $sum: '$unappliedAmount' } } },
  ]);
  return Money.roundMoney(result?.credit || 0);
};

/** Totals the payment screens lead with: what's owed, what's sitting as credit. */
const getCustomerAccountSummary = async ({ organizationId, branchId, customer }) => {
  const match = { customerId: { $in: toCustomerIdMatchValues(customer) }, type: { $in: ['cash', 'credit'] } };
  if (organizationId) match.organizationId = toObjectId(organizationId);
  if (branchId) match.branchId = toObjectId(branchId);

  const [totals] = await Invoice.aggregate([
    { $match: match },
    buildSettlementAddFieldsStage(),
    {
      $group: {
        _id: null,
        invoiceCount: { $sum: 1 },
        openInvoiceCount: { $sum: { $cond: [{ $gt: ['$remainingAmount', SETTLEMENT_EPSILON] }, 1, 0] } },
        overdueInvoiceCount: { $sum: { $cond: [{ $eq: ['$dueStatus', 'overdue'] }, 1, 0] } },
        totalBilled: { $sum: '$total' },
        totalSettled: { $sum: '$settledAmount' },
        totalOutstanding: {
          $sum: { $cond: [{ $gt: ['$remainingAmount', 0] }, '$remainingAmount', 0] },
        },
        overdueAmount: {
          $sum: { $cond: [{ $eq: ['$dueStatus', 'overdue'] }, '$remainingAmount', 0] },
        },
      },
    },
  ]);

  const availableCredit = await getCustomerCreditBalance({ organizationId, branchId, customer });

  return {
    invoiceCount: totals?.invoiceCount || 0,
    openInvoiceCount: totals?.openInvoiceCount || 0,
    overdueInvoiceCount: totals?.overdueInvoiceCount || 0,
    totalBilled: Money.roundMoney(totals?.totalBilled || 0),
    totalSettled: Money.roundMoney(totals?.totalSettled || 0),
    totalOutstanding: Money.roundMoney(totals?.totalOutstanding || 0),
    overdueAmount: Money.roundMoney(totals?.overdueAmount || 0),
    availableCredit,
  };
};

/**
 * Why the Customer Ledger's balance and the invoice list's outstanding total can differ —
 * a lean tie-out, not the full itemized bridge `getSupplierReconciliation` builds (that one
 * also accounts for debit notes / contra credits from a supplier's shadow-customer account
 * and purchase-return credits, neither of which has a customer-side equivalent here yet).
 * The two numbers measure different things and are both "correct": `invoiceOutstanding` is
 * gross open cash/credit invoices (an AR-aging figure); `ledgerBalance` is the net account
 * position, which also nets off any unapplied advance the customer is holding with us. The
 * gap is normally exactly `availableCredit` — anything beyond that is unexplained and is
 * what `repairCustomerAllocations` can close (ledger payments that never got an allocation).
 */
const getCustomerReconciliation = async ({ organizationId, branchId, customer }) => {
  const summary = await getCustomerAccountSummary({ organizationId, branchId, customer });
  const customerDoc = await Customer.findById(customer).select('balance').lean();
  const ledgerBalance = Money.roundMoney(customerDoc?.balance || 0);

  // Payments that stand on their own (no source document) — the only ledger payments that
  // are supposed to settle open invoices but might not have yet (legacy data).
  const match = { customer: toObjectId(customer), transactionType: 'payment_received', referenceId: { $in: [null, undefined] } };
  if (organizationId) match.organizationId = toObjectId(organizationId);
  if (branchId) match.branchId = toObjectId(branchId);
  const [standalonePayments] = await CustomerLedger.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$credit' }, count: { $sum: 1 } } },
  ]);

  const [paymentTotals] = await CustomerPayment.aggregate([
    {
      $match: {
        customer: toObjectId(customer),
        status: 'posted',
        direction: 'payment',
        ...(organizationId ? { organizationId: toObjectId(organizationId) } : {}),
        ...(branchId ? { branchId: toObjectId(branchId) } : {}),
      },
    },
    { $group: { _id: null, recorded: { $sum: '$amount' } } },
  ]);

  // Paid on the ledger but never turned into an allocation record at all — the part a
  // one-click repair can actually fix. `paymentTotals.recorded` only counts posted
  // (non-void) CustomerPayments, so voiding a repaired payment correctly makes this gap
  // reappear. `standalonePayments.count` below is a raw ledger-row count, not "still
  // unallocated" — it doesn't shrink after a repair even though the amount does.
  const unallocatedPayments = Money.roundMoney(
    Math.max(0, (standalonePayments?.total || 0) - (paymentTotals?.recorded || 0))
  );

  // Sales returns whose credit never reached their invoice — a return that HAS been applied
  // moves both sides of the bridge at once (the invoice owes less AND the ledger balance is
  // lower), so it is not part of the difference; only the ones still floating on the
  // account are. Same rule the payment side follows above, hence the lookup rather than a
  // plain sum.
  const [returnTotals] = await CustomerLedger.aggregate([
    { $match: { ...match, transactionType: 'sales_return', referenceId: { $ne: null } } },
    {
      $lookup: {
        from: 'customerpayments',
        localField: '_id',
        foreignField: 'customerLedgerEntryId',
        as: '_allocation',
      },
    },
    {
      $addFields: {
        isApplied: {
          $gt: [{ $size: { $filter: { input: '$_allocation', as: 'a', cond: { $eq: ['$$a.status', 'posted'] } } } }, 0],
        },
      },
    },
    {
      $group: {
        _id: null,
        unapplied: { $sum: { $cond: [{ $eq: ['$isApplied', false] }, '$credit', 0] } },
        unappliedCount: { $sum: { $cond: [{ $eq: ['$isApplied', false] }, 1, 0] } },
        applied: { $sum: { $cond: [{ $eq: ['$isApplied', true] }, '$credit', 0] } },
      },
    },
  ]);

  const returnCredits = Money.roundMoney(returnTotals?.unapplied || 0);
  const appliedReturnCredits = Money.roundMoney(returnTotals?.applied || 0);

  const explained = Money.roundMoney(summary.availableCredit + unallocatedPayments + returnCredits);
  const unexplained = Money.roundMoney(summary.totalOutstanding - explained - ledgerBalance);
  const fixableAmount = Money.roundMoney(unallocatedPayments + returnCredits);

  return {
    invoiceCount: summary.invoiceCount,
    openInvoiceCount: summary.openInvoiceCount,
    invoiceOutstanding: summary.totalOutstanding,
    ledgerBalance,
    availableCredit: summary.availableCredit,
    unallocatedPayments,
    unallocatedPaymentCount: standalonePayments?.count || 0,
    returnCredits,
    returnCount: returnTotals?.unappliedCount || 0,
    appliedReturnCredits,
    unexplained,
    fixableAmount,
    isReconciled: Math.abs(fixableAmount) <= SETTLEMENT_EPSILON && Math.abs(unexplained) <= SETTLEMENT_EPSILON,
  };
};

/**
 * One-click repair for accounts carried over from before invoices tracked their own
 * settlement (or where a "Cash Received" row was entered directly on the Customer Ledger
 * page before this feature existed). Safe to replay: a standalone `payment_received` row
 * (no `referenceId` — an invoice's own paid-at-sale leg always has one, see
 * `recordAllocationForLedgerEntry`'s guard) never moved money on its own; it only records
 * that money already came in. Replaying it oldest-first, exactly as if it had allocated the
 * moment it was entered, changes nothing about what actually happened financially — only
 * which invoices show as settled by it. Idempotent — anything that already has an allocation
 * record is skipped, so the button can be pressed twice with no effect. Mirrors
 * supplierPayment.service.js's repairSupplierAllocations, minus the return-credit branch
 * (no sales-return → invoice-credit integration exists yet on this side).
 */
const repairCustomerAllocations = async ({ organizationId, branchId, customer }, user) => {
  const scope = { customer: toObjectId(customer) };
  if (organizationId) scope.organizationId = toObjectId(organizationId);

  const entries = await CustomerLedger.find({
    ...scope,
    $or: [
      { transactionType: 'payment_received', referenceId: { $in: [null, undefined] } },
      { transactionType: 'sales_return' },
    ],
  }).sort({ transactionDate: 1, createdAt: 1 });

  const appliedPayments = [];
  const appliedReturns = [];

  for (const entry of entries) {
    const existing = await CustomerPayment.findOne({ customerLedgerEntryId: entry._id }).select('_id');
    if (existing) continue;
    const payment = await recordAllocationForLedgerEntry(entry, user);
    if (!payment) continue;

    const record = {
      paymentNumber: payment.paymentNumber,
      amount: payment.amount,
      allocatedTotal: payment.allocatedTotal,
      unappliedAmount: payment.unappliedAmount,
      invoices: payment.allocations.map((allocation) => allocation.invoiceNumber),
    };
    if (payment.direction === 'return_credit') appliedReturns.push(record);
    else appliedPayments.push(record);
  }

  const applied = [...appliedPayments, ...appliedReturns];

  return {
    appliedCount: applied.length,
    paymentCount: appliedPayments.length,
    returnCount: appliedReturns.length,
    appliedTotal: Money.roundMoney(applied.reduce((sum, entry) => sum + entry.allocatedTotal, 0)),
    payments: applied,
    reconciliation: await getCustomerReconciliation({ organizationId, branchId, customer }),
  };
};

/**
 * Dry-run of a payment: what would this amount pay off, and what would be left over?
 * The Record Payment dialog calls this on every keystroke, so it stays read-only.
 */
const previewAllocation = async ({
  organizationId,
  branchId,
  customer,
  amount,
  mode = 'fifo',
  manualAllocations = [],
  invoiceIds,
}) => {
  const openInvoices = await getOpenInvoicesForCustomer({
    organizationId,
    branchId,
    customer,
    strategy: mode,
    invoiceIds: mode === 'manual' || mode === 'reference' ? undefined : invoiceIds,
  });

  const summary = await getCustomerAccountSummary({ organizationId, branchId, customer });
  const plan =
    toNumber(amount) > 0
      ? planAllocation({ openInvoices, amount, mode, manualAllocations })
      : { allocations: [], allocatedTotal: 0, unappliedAmount: 0 };

  const allocationByInvoice = new Map(plan.allocations.map((a) => [String(a.invoice), a.amount]));

  return {
    openInvoices: openInvoices.map((invoice) => {
      const applied = allocationByInvoice.get(String(invoice._id)) || 0;
      const outstandingAfter = Money.subtractMoney(invoice.remainingAmount, applied);
      return {
        ...invoice,
        id: String(invoice._id),
        appliedAmount: applied,
        outstandingAfter,
        statusAfter:
          outstandingAfter <= SETTLEMENT_EPSILON ? 'paid' : applied > 0 ? 'partial' : 'outstanding',
      };
    }),
    allocations: plan.allocations.map((a) => ({ ...a, invoice: String(a.invoice) })),
    allocatedTotal: plan.allocatedTotal,
    unappliedAmount: plan.unappliedAmount,
    summary,
    outstandingAfter: Money.roundMoney(Math.max(0, summary.totalOutstanding - plan.allocatedTotal)),
  };
};

/** Human-readable one-liner used on the Customer Ledger row this payment creates. */
const buildLedgerDescription = (payment) => {
  const invoiceList = payment.allocations
    .slice(0, 3)
    .map((a) => `#${a.invoiceNumber}`)
    .join(', ');
  const more = payment.allocations.length > 3 ? ` +${payment.allocations.length - 3} more` : '';
  if (payment.direction === 'refund') {
    return `Refund paid to customer · ${payment.paymentNumber}`;
  }
  if (payment.allocations.length === 0) {
    return `Advance payment from customer · ${payment.paymentNumber}`;
  }
  return `Customer payment ${payment.paymentNumber} — ${invoiceList}${more}`;
};

/**
 * Record a customer payment (or a refund we send back) and settle invoices with it.
 *
 * Money movement is delegated to ONE Customer Ledger entry, exactly like invoice.service.js's
 * own sale posting: that entry owns the Cash Book/Wallet/double-entry legs. It is deliberately
 * created without a `referenceId` — customer ledger's own cash-book sync skips entries that
 * carry one (assuming the parent module already posted the cash line), and would otherwise
 * merge this payment into a same-reference invoice row.
 */
const createPayment = async (paymentBody, user) => {
  const {
    organizationId,
    branchId,
    customer: customerId,
    amount,
    direction = 'payment',
    paymentMethod = 'cash',
    walletType,
    paymentDate,
    referenceNumber,
    notes,
    allocationMode = 'fifo',
    allocations: manualAllocations = [],
    invoiceIds,
  } = paymentBody;

  const numericAmount = Money.roundMoney(amount);
  if (!numericAmount || numericAmount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment amount must be greater than zero');
  }

  const customer = await Customer.findOne({ _id: customerId, organizationId }).select('name');
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }

  if (paymentMethod === 'wallet' && !String(walletType || '').trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Choose which bank account this payment came from');
  }

  const paymentNumber = await generateNextPaymentNumber(organizationId);
  const effectiveDate = paymentDate ? new Date(paymentDate) : new Date();

  // A refund flows the other way: we hand money back, which can only come out of credit the
  // customer is holding with us, so it allocates to nothing and shrinks that credit.
  if (direction === 'refund') {
    return createRefund({
      organizationId,
      branchId,
      customer,
      amount: numericAmount,
      paymentMethod,
      walletType,
      paymentNumber,
      effectiveDate,
      referenceNumber,
      notes,
      user,
    });
  }

  const openInvoices = await getOpenInvoicesForCustomer({
    organizationId,
    branchId,
    customer: customerId,
    strategy: allocationMode,
    invoiceIds: allocationMode === 'manual' || allocationMode === 'reference' ? undefined : invoiceIds,
  });

  const plan = planAllocation({
    openInvoices,
    amount: numericAmount,
    mode: allocationMode,
    manualAllocations,
  });

  const payment = await CustomerPayment.create({
    organizationId,
    branchId,
    createdBy: user?.id || user?._id,
    paymentNumber,
    customer: customerId,
    customerName: customer.name,
    direction: 'payment',
    paymentDate: effectiveDate,
    amount: numericAmount,
    paymentMethod,
    walletType: paymentMethod === 'wallet' ? String(walletType).trim() : undefined,
    referenceNumber,
    notes,
    allocationMode,
    allocations: plan.allocations,
    allocatedTotal: plan.allocatedTotal,
    unappliedAmount: plan.unappliedAmount,
    status: 'posted',
    history: [
      historyEntry(
        'created',
        user,
        `${formatMoney(numericAmount)} received from ${customer.name} (${allocationMode.toUpperCase()} allocation across ${plan.allocations.length} invoice(s))`,
        numericAmount
      ),
    ],
  });

  await applyAllocationsToInvoices(plan.allocations);

  const ledgerEntry = await customerLedgerService.createLedgerEntry(
    {
      organizationId,
      branchId,
      customer: customerId,
      transactionType: 'payment_received',
      transactionDate: effectiveDate,
      reference: paymentNumber,
      description: buildLedgerDescription(payment),
      debit: 0,
      credit: numericAmount,
      paymentMethod: paymentMethod === 'wallet' ? `Wallet (${String(walletType).trim()})` : 'Cash',
      notes: notes || '',
      createdBy: user?.id || user?._id,
    },
    // This payment has already allocated itself above — without this the ledger would
    // allocate the same money a second time (see recordAllocationForLedgerEntry).
    { skipInvoiceAllocation: true }
  );

  payment.customerLedgerEntryId = ledgerEntry._id;
  await payment.save();

  return getPaymentById(payment._id);
};

/**
 * We return money the customer had over-paid. Consumes their held credit oldest-first and
 * posts a money-OUT ledger entry (`payment_made`), which is what restores their balance
 * back toward zero.
 */
const createRefund = async ({
  organizationId,
  branchId,
  customer,
  amount,
  paymentMethod,
  walletType,
  paymentNumber,
  effectiveDate,
  referenceNumber,
  notes,
  user,
}) => {
  const availableCredit = await getCustomerCreditBalance({ organizationId, branchId, customer: customer._id });
  if (amount > availableCredit + SETTLEMENT_EPSILON) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `${customer.name} only has ${formatMoney(availableCredit)} of unapplied credit — a larger refund would not match the ledger`
    );
  }

  const creditSources = await CustomerPayment.find({
    organizationId,
    branchId,
    customer: customer._id,
    status: 'posted',
    direction: 'payment',
    unappliedAmount: { $gt: 0 },
  }).sort({ paymentDate: 1, createdAt: 1 });

  let remainingMinor = Money.toMinorUnits(amount);
  for (const source of creditSources) {
    if (remainingMinor <= 0) break;
    const takeMinor = Math.min(Money.toMinorUnits(source.unappliedAmount), remainingMinor);
    source.unappliedAmount = Money.fromMinorUnits(Money.toMinorUnits(source.unappliedAmount) - takeMinor);
    source.history.push(
      historyEntry('refunded', user, `${formatMoney(Money.fromMinorUnits(takeMinor))} refunded via ${paymentNumber}`, Money.fromMinorUnits(takeMinor))
    );
    await source.save();
    remainingMinor -= takeMinor;
  }

  const refund = await CustomerPayment.create({
    organizationId,
    branchId,
    createdBy: user?.id || user?._id,
    paymentNumber,
    customer: customer._id,
    customerName: customer.name,
    direction: 'refund',
    paymentDate: effectiveDate,
    amount,
    paymentMethod,
    walletType: paymentMethod === 'wallet' ? String(walletType).trim() : undefined,
    referenceNumber,
    notes,
    allocationMode: 'none',
    allocations: [],
    allocatedTotal: 0,
    unappliedAmount: 0,
    status: 'posted',
    history: [historyEntry('created', user, `${formatMoney(amount)} refunded to ${customer.name}`, amount)],
  });

  const ledgerEntry = await customerLedgerService.createLedgerEntry(
    {
      organizationId,
      branchId,
      customer: customer._id,
      transactionType: 'payment_made',
      transactionDate: effectiveDate,
      reference: paymentNumber,
      description: buildLedgerDescription(refund),
      debit: amount,
      credit: 0,
      paymentMethod: paymentMethod === 'wallet' ? `Wallet (${String(walletType).trim()})` : 'Cash',
      notes: notes || '',
      createdBy: user?.id || user?._id,
    },
    { skipInvoiceAllocation: true }
  );

  refund.customerLedgerEntryId = ledgerEntry._id;
  await refund.save();

  return getPaymentById(refund._id);
};

/**
 * Put a customer's existing credit (money already paid, never applied) against open invoices.
 * No cash moves — the original payment's ledger entry already recorded that — so this only
 * re-labels where that money sits.
 */
const applyCredit = async ({ organizationId, branchId, customer: customerId, amount, mode = 'fifo', allocations: manualAllocations = [] }, user) => {
  const availableCredit = await getCustomerCreditBalance({ organizationId, branchId, customer: customerId });
  const requested = amount ? Money.roundMoney(amount) : availableCredit;

  if (availableCredit <= SETTLEMENT_EPSILON) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This customer is not holding any unapplied credit');
  }
  if (requested > availableCredit + SETTLEMENT_EPSILON) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Only ${formatMoney(availableCredit)} of credit is available`);
  }

  const openInvoices = await getOpenInvoicesForCustomer({
    organizationId,
    branchId,
    customer: customerId,
    strategy: mode,
  });
  if (openInvoices.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'There are no outstanding invoices to apply this credit to');
  }

  const plan = planAllocation({ openInvoices, amount: requested, mode, manualAllocations });
  if (plan.allocations.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Nothing to apply — choose at least one invoice');
  }

  // Spread the applied credit across the payments actually holding it, oldest first, so each
  // payment's own allocation list stays a truthful record of where its money went.
  const creditSources = await CustomerPayment.find({
    organizationId,
    branchId,
    customer: customerId,
    status: 'posted',
    direction: 'payment',
    unappliedAmount: { $gt: 0 },
  }).sort({ paymentDate: 1, createdAt: 1 });

  const pending = plan.allocations.map((allocation) => ({ ...allocation, remainingMinor: Money.toMinorUnits(allocation.amount) }));
  let pendingIndex = 0;

  for (const source of creditSources) {
    let sourceCreditMinor = Money.toMinorUnits(source.unappliedAmount);
    let touched = false;

    while (sourceCreditMinor > 0 && pendingIndex < pending.length) {
      const target = pending[pendingIndex];
      const takeMinor = Math.min(sourceCreditMinor, target.remainingMinor);
      if (takeMinor <= 0) {
        pendingIndex += 1;
        continue;
      }

      source.allocations.push({
        invoice: target.invoice,
        invoiceNumber: target.invoiceNumber,
        invoiceDate: target.invoiceDate,
        dueDate: target.dueDate,
        invoiceTotal: target.invoiceTotal,
        outstandingBefore: target.outstandingBefore,
        amount: Money.fromMinorUnits(takeMinor),
        appliedAt: new Date(),
      });
      source.allocatedTotal = Money.addMoney(source.allocatedTotal, Money.fromMinorUnits(takeMinor));
      sourceCreditMinor -= takeMinor;
      target.remainingMinor -= takeMinor;
      touched = true;
      if (target.remainingMinor <= 0) pendingIndex += 1;
    }

    if (touched) {
      source.unappliedAmount = Money.fromMinorUnits(sourceCreditMinor);
      source.history.push(
        historyEntry('credit_applied', user, `Credit applied to ${plan.allocations.length} invoice(s)`, plan.allocatedTotal)
      );
      await source.save();
    }
    if (pendingIndex >= pending.length) break;
  }

  await applyAllocationsToInvoices(plan.allocations);

  return {
    appliedAmount: plan.allocatedTotal,
    allocations: plan.allocations.map((a) => ({ ...a, invoice: String(a.invoice) })),
    remainingCredit: await getCustomerCreditBalance({ organizationId, branchId, customer: customerId }),
  };
};

/**
 * Reverse a payment completely: the Customer Ledger entry (and with it the Cash Book/Wallet/
 * double-entry legs) is deleted, every allocated rupee is handed back to its invoice, and the
 * document survives as a voided record with its history intact — an ERP never silently
 * deletes a posted payment.
 */
const voidPayment = async (paymentId, { reason } = {}, user) => {
  const payment = await CustomerPayment.findById(paymentId);
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }
  if (payment.status === 'void') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This payment has already been voided');
  }

  if (payment.direction === 'refund') {
    // Voiding a refund hands the credit back to the customer's balance. Give it to the
    // oldest payment that can hold it so the credit total lines back up.
    const holder = await CustomerPayment.findOne({
      organizationId: payment.organizationId,
      branchId: payment.branchId,
      customer: payment.customer,
      status: 'posted',
      direction: 'payment',
    }).sort({ paymentDate: 1, createdAt: 1 });
    if (holder) {
      holder.unappliedAmount = Money.addMoney(holder.unappliedAmount, payment.amount);
      holder.history.push(historyEntry('voided', user, `Credit restored — refund ${payment.paymentNumber} voided`, payment.amount));
      await holder.save();
    }
  } else {
    await releaseAllocations(payment.allocations);
  }

  if (payment.customerLedgerEntryId) {
    await customerLedgerService.deleteLedgerEntry(payment.customerLedgerEntryId).catch(() => {});
  }

  payment.status = 'void';
  payment.voidedAt = new Date();
  payment.voidedBy = user?.id || user?._id;
  payment.voidReason = reason || '';
  payment.allocatedTotal = 0;
  payment.unappliedAmount = 0;
  payment.history.push(historyEntry('voided', user, reason || 'Payment voided', payment.amount));
  await payment.save();

  return getPaymentById(payment._id);
};

/**
 * Re-spread a posted payment across different invoices without touching the money itself —
 * the classic "we applied it to the wrong bill" correction. The ledger entry is left exactly
 * as it is (same cash, same date, same account); only the allocation changes.
 */
const reallocatePayment = async (paymentId, { allocations: manualAllocations = [], mode = 'manual' }, user) => {
  const payment = await CustomerPayment.findById(paymentId);
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }
  if (payment.status === 'void') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A voided payment cannot be re-allocated');
  }
  if (payment.direction === 'refund') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Refunds are not allocated to invoices');
  }

  // Release first, so the invoices this payment currently covers show their true
  // outstanding while the new plan is being built (otherwise re-applying to the same
  // invoice would be rejected as an overpay).
  await releaseAllocations(payment.allocations);

  try {
    const openInvoices = await getOpenInvoicesForCustomer({
      organizationId: payment.organizationId,
      branchId: payment.branchId,
      customer: payment.customer,
      strategy: mode,
    });
    const plan = planAllocation({ openInvoices, amount: payment.amount, mode, manualAllocations });
    await applyAllocationsToInvoices(plan.allocations);

    payment.allocations = plan.allocations;
    payment.allocatedTotal = plan.allocatedTotal;
    payment.unappliedAmount = plan.unappliedAmount;
    payment.allocationMode = mode;
    payment.history.push(
      historyEntry('reallocated', user, `Re-applied across ${plan.allocations.length} invoice(s)`, plan.allocatedTotal)
    );
    await payment.save();
  } catch (error) {
    // Put the original allocation back so a rejected re-allocation leaves no dent.
    await applyAllocationsToInvoices(payment.allocations);
    throw error;
  }

  return getPaymentById(payment._id);
};

/** Sum of `amount` across every payment matching `filter`, not just the current page — powers
 *  a payments list's Total row the same way paymentVoucher.service's sumFilteredAmount does. */
const sumFilteredAmount = async (filter) => {
  const docs = await CustomerPayment.find(filter).select('amount').lean();
  return docs.reduce((sum, doc) => sum + (doc.amount || 0), 0);
};

const queryPayments = async (filter, options) => {
  const opts = { ...options };
  opts.populate = [
    { path: 'customer', select: 'name nameUrdu phone picture' },
    { path: 'createdBy', select: 'name email' },
  ];
  opts.sortBy = opts.sortBy || 'paymentDate:desc,createdAt:desc';
  const [result, totalAmountSum] = await Promise.all([CustomerPayment.paginate(filter, opts), sumFilteredAmount(filter)]);
  return { ...result, totalAmountSum };
};

const getPaymentById = async (id) =>
  CustomerPayment.findById(id)
    .populate('customer', 'name nameUrdu phone picture')
    .populate('createdBy', 'name email')
    .populate('voidedBy', 'name email');

/** Every payment that has touched one invoice — the drawer's Payment History section. */
const getPaymentsForInvoice = async (invoiceId) => {
  const payments = await CustomerPayment.find({ 'allocations.invoice': toObjectId(invoiceId) })
    .populate('createdBy', 'name email')
    .sort({ paymentDate: -1, createdAt: -1 })
    .lean();

  return payments.map((payment) => {
    const applied = (payment.allocations || [])
      .filter((allocation) => String(allocation.invoice) === String(invoiceId))
      .reduce((sum, allocation) => Money.addMoney(sum, allocation.amount), 0);
    return {
      id: String(payment._id),
      paymentNumber: payment.paymentNumber,
      paymentDate: payment.paymentDate,
      amount: payment.amount,
      appliedToThisInvoice: applied,
      paymentMethod: payment.paymentMethod,
      walletType: payment.walletType,
      referenceNumber: payment.referenceNumber,
      notes: payment.notes,
      status: payment.status,
      direction: payment.direction,
      createdBy: payment.createdBy,
    };
  });
};

/** Settlement snapshot for one invoice, including where each settled rupee came from. */
const getInvoiceSettlementDetail = async (invoiceId) => {
  const invoice = await Invoice.findById(invoiceId).select('total paidAmount allocatedAmount dueDate').lean();
  if (!invoice) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Invoice not found');
  }
  const settlement = resolveInvoiceSettlement(invoice);
  const payments = await getPaymentsForInvoice(invoiceId);
  return { ...settlement, paidAtSale: toNumber(invoice.paidAmount), payments };
};

/** `"Wallet (HBL Main)"` → `{ paymentMethod: 'wallet', walletType: 'HBL Main' }`; anything else is cash. */
const parseLedgerPaymentMethod = (rawPaymentMethod) => {
  const raw = String(rawPaymentMethod || '').trim();
  const walletMatch = raw.match(/wallet\s*\((.+)\)/i);
  if (walletMatch && walletMatch[1]) {
    return { paymentMethod: 'wallet', walletType: walletMatch[1].trim() };
  }
  if (/jazzcash/i.test(raw)) return { paymentMethod: 'wallet', walletType: 'JazzCash' };
  if (/easypaisa/i.test(raw)) return { paymentMethod: 'wallet', walletType: 'EasyPaisa' };
  return { paymentMethod: 'cash', walletType: undefined };
};

/**
 * Settle open invoices from a customer-ledger payment that was recorded somewhere else — the
 * Customer Ledger screen's "Cash Received" row.
 *
 * Before this, that flow moved real money and moved the customer's balance, but no invoice
 * knew about it: the ledger said paid, the invoice list still said outstanding. This closes
 * that gap by building the SAME CustomerPayment allocation record the Record Payment dialog
 * builds — except the Customer Ledger entry already exists, so this one attaches to it
 * (`customerLedgerEntryId`) instead of creating a second one.
 *
 * Idempotent: called again for a ledger entry that already has a payment, it does nothing.
 * @returns {Promise<CustomerPayment|null>} null when the entry isn't an allocatable payment
 */
const recordAllocationForLedgerEntry = async (entry, user, { allocationMode = 'fifo' } = {}) => {
  if (!entry) return null;
  const isPayment = entry.transactionType === 'payment_received';
  const isReturn = entry.transactionType === 'sales_return';
  if (!isPayment && !isReturn) return null;
  // A payment tied to a source document (an invoice's own paid-at-sale leg) is already
  // reflected on that invoice — allocating it again would settle the same invoice twice.
  // Returns are the opposite: they are ALWAYS tied to their SalesReturn document, which is
  // exactly what tells us which invoice the credit belongs to.
  if (isPayment && entry.referenceId) return null;

  const amount = Money.roundMoney(entry.credit);
  if (!amount || amount <= 0) return null;

  const existing = await CustomerPayment.findOne({ customerLedgerEntryId: entry._id });
  if (existing) return existing;

  const customer = await Customer.findById(entry.customer).select('name');

  let plan;
  let mode = allocationMode;
  let direction = 'payment';

  if (isReturn) {
    // Goods came back against one specific invoice — this credit belongs there, not on
    // the oldest open bill.
    const salesReturn = await SalesReturn.findById(entry.referenceId).select('invoiceId status returnNumber');
    if (!salesReturn?.invoiceId || salesReturn.status === 'rejected') return null;

    const [invoice] = await getOpenInvoicesForCustomer({
      organizationId: entry.organizationId,
      branchId: entry.branchId,
      customer: entry.customer,
      invoiceIds: [salesReturn.invoiceId],
    });
    // Nothing left owing on it (already paid in full) — the return is a credit on the
    // account or a cash refund, and forcing it onto a settled invoice would overpay it.
    if (!invoice) return null;

    mode = 'reference';
    direction = 'return_credit';
    plan = planAllocation({
      openInvoices: [invoice],
      amount,
      mode: 'reference',
      manualAllocations: [{ invoiceId: String(invoice._id), amount: Math.min(amount, invoice.remainingAmount) }],
    });
  } else {
    const openInvoices = await getOpenInvoicesForCustomer({
      organizationId: entry.organizationId,
      branchId: entry.branchId,
      customer: entry.customer,
      strategy: allocationMode,
    });
    plan = planAllocation({ openInvoices, amount, mode: allocationMode });
  }

  const { paymentMethod, walletType } = parseLedgerPaymentMethod(entry.paymentMethod);
  const paymentNumber = await generateNextPaymentNumber(entry.organizationId);

  const payment = await CustomerPayment.create({
    organizationId: entry.organizationId,
    branchId: entry.branchId,
    createdBy: entry.createdBy || user?.id || user?._id,
    paymentNumber,
    customer: entry.customer,
    customerName: customer?.name,
    direction,
    paymentDate: entry.transactionDate || entry.createdAt || new Date(),
    amount,
    paymentMethod,
    walletType,
    referenceNumber: entry.reference || undefined,
    notes: entry.notes || undefined,
    allocationMode: mode,
    allocations: plan.allocations,
    allocatedTotal: plan.allocatedTotal,
    // A return credit is never an "advance": whatever it couldn't put on the invoice stays
    // on the account as the ledger already records it, not as spendable payment credit.
    unappliedAmount: isReturn ? 0 : plan.unappliedAmount,
    status: 'posted',
    customerLedgerEntryId: entry._id,
    history: [
      historyEntry(
        'created',
        user,
        isReturn
          ? `Sales return ${entry.reference || ''} credited ${formatMoney(plan.allocatedTotal)} to invoice ${plan.allocations[0]?.invoiceNumber || ''}`.trim()
          : `Recorded from the customer ledger — ${formatMoney(amount)} applied across ${plan.allocations.length} invoice(s)`,
        amount
      ),
    ],
  });

  await applyAllocationsToInvoices(plan.allocations);
  return payment;
};

/**
 * Undo the invoice credit a sales return created — used when that return is deleted or
 * rejected, so the invoice goes back to owing what it owed. Never touches the ledger: the
 * return's own delete/reject path owns that side. Mirrors
 * supplierPayment.service.js's releaseReturnCredit.
 */
const releaseReturnCredit = async (salesReturnId, user) => {
  const entry = await CustomerLedger.findOne({
    referenceId: toObjectId(salesReturnId),
    transactionType: 'sales_return',
  }).select('_id');
  if (!entry) return null;
  return releaseAllocationsForLedgerEntry(entry._id, user);
};

/**
 * The ledger entry behind a payment was edited (usually its amount): re-spread it. The
 * ledger owns the money, this only re-decides which invoices that money covers.
 */
const syncAllocationForLedgerEntry = async (entry, user) => {
  if (!entry) return null;
  const payment = await CustomerPayment.findOne({ customerLedgerEntryId: entry._id });
  // No allocation to keep in step (an entry from before this feature, or one already
  // voided): leave it alone. Editing an old row's description must never silently mark
  // invoices paid — that would need an explicit, opt-in backfill.
  if (!payment || payment.status === 'void') return null;

  const amount = Money.roundMoney(entry.credit);
  const { paymentMethod, walletType } = parseLedgerPaymentMethod(entry.paymentMethod);
  const unchanged =
    Money.toMinorUnits(payment.amount) === Money.toMinorUnits(amount) &&
    payment.paymentMethod === paymentMethod &&
    (payment.walletType || undefined) === walletType;
  if (unchanged) return payment;

  await releaseAllocations(payment.allocations);

  if (!amount || amount <= 0) {
    // The entry is no longer a payment (amount zeroed) — keep the record, own nothing.
    payment.allocations = [];
    payment.allocatedTotal = 0;
    payment.unappliedAmount = 0;
    payment.amount = 0.01;
    payment.status = 'void';
    payment.voidReason = 'Source ledger entry no longer carries a payment amount';
    payment.history.push(historyEntry('voided', user, 'Ledger entry amount cleared', 0));
    await payment.save();
    return payment;
  }

  const openInvoices = await getOpenInvoicesForCustomer({
    organizationId: entry.organizationId,
    branchId: entry.branchId,
    customer: entry.customer,
    strategy: payment.allocationMode === 'manual' ? 'fifo' : payment.allocationMode,
  });
  const plan = planAllocation({ openInvoices, amount, mode: payment.allocationMode === 'manual' ? 'fifo' : payment.allocationMode });
  await applyAllocationsToInvoices(plan.allocations);

  payment.amount = amount;
  payment.paymentMethod = paymentMethod;
  payment.walletType = walletType;
  payment.paymentDate = entry.transactionDate || payment.paymentDate;
  payment.referenceNumber = entry.reference || payment.referenceNumber;
  payment.allocations = plan.allocations;
  payment.allocatedTotal = plan.allocatedTotal;
  payment.unappliedAmount = plan.unappliedAmount;
  payment.history.push(
    historyEntry('reallocated', user, `Ledger entry edited — re-applied across ${plan.allocations.length} invoice(s)`, amount)
  );
  await payment.save();
  return payment;
};

/**
 * The ledger entry behind a payment is being deleted: hand every allocated rupee back to
 * its invoice and void the payment record. Deliberately does NOT touch the ledger itself —
 * customerLedger.service.js's deleteLedgerEntry is the caller, and voidPayment() deletes the
 * ledger entry, so the two must never call each other.
 */
const releaseAllocationsForLedgerEntry = async (ledgerEntryId, user) => {
  const payment = await CustomerPayment.findOne({ customerLedgerEntryId: ledgerEntryId });
  if (!payment || payment.status === 'void') return null;

  await releaseAllocations(payment.allocations);
  payment.status = 'void';
  payment.voidedAt = new Date();
  payment.voidedBy = user?.id || user?._id;
  payment.voidReason = 'Source customer ledger entry deleted';
  payment.allocatedTotal = 0;
  payment.unappliedAmount = 0;
  payment.history.push(historyEntry('voided', user, 'Source customer ledger entry deleted', payment.amount));
  await payment.save();
  return payment;
};

/**
 * An invoice is being deleted: strip it out of every payment that had money sitting on it
 * and hand that money back as unapplied credit. Without this, deleting an invoice would leave
 * allocations pointing at a document that no longer exists and quietly shrink the customer's
 * credit balance by that amount.
 */
const detachInvoiceAllocations = async (invoiceId) => {
  const payments = await CustomerPayment.find({ 'allocations.invoice': toObjectId(invoiceId) });

  for (const payment of payments) {
    const released = payment.allocations
      .filter((allocation) => String(allocation.invoice) === String(invoiceId))
      .reduce((sum, allocation) => Money.addMoney(sum, allocation.amount), 0);
    if (released <= 0) continue;

    payment.allocations = payment.allocations.filter(
      (allocation) => String(allocation.invoice) !== String(invoiceId)
    );
    payment.allocatedTotal = Money.roundMoney(Math.max(0, Money.subtractMoney(payment.allocatedTotal, released)));
    if (payment.status === 'posted') {
      payment.unappliedAmount = Money.addMoney(payment.unappliedAmount, released);
    }
    payment.history.push(
      historyEntry('reallocated', null, `Invoice deleted — ${formatMoney(released)} returned to credit`, released)
    );
    await payment.save();
  }

  return payments.length;
};

module.exports = {
  generateNextPaymentNumber,
  detachInvoiceAllocations,
  recordAllocationForLedgerEntry,
  syncAllocationForLedgerEntry,
  releaseAllocationsForLedgerEntry,
  releaseReturnCredit,
  getOpenInvoicesForCustomer,
  planAllocation,
  previewAllocation,
  getCustomerCreditBalance,
  getCustomerAccountSummary,
  getCustomerReconciliation,
  repairCustomerAllocations,
  createPayment,
  applyCredit,
  voidPayment,
  reallocatePayment,
  queryPayments,
  getPaymentById,
  getPaymentsForInvoice,
  getInvoiceSettlementDetail,
};
