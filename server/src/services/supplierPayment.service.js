const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { SupplierPayment, Purchase, Supplier, SupplierLedger, PurchaseReturn } = require('../models');
const ApiError = require('../utils/ApiError');
const Money = require('../utils/money');
const { formatMoney } = require('../utils/money');
const {
  SETTLEMENT_EPSILON,
  buildSettlementAddFieldsStage,
  resolvePurchaseSettlement,
} = require('../utils/purchaseSettlement');
const supplierLedgerService = require('./supplierLedger.service');

const DEFAULT_PAYMENT_SEQ = 1000;
/** Sorts undated invoices behind every dated one under the due-date strategy. */
const NO_DUE_DATE_SORT_KEY = new Date('9999-12-31');

const toObjectId = (id) => (mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(String(id)) : id);

const toNumber = (value) => Number(value || 0);

/**
 * Next payment number (SP-####). Same highest-trailing-suffix scan as
 * purchase.service.js's generateNextPurchaseInvoiceNumber, computed inside MongoDB so it
 * doesn't pull every payment across the wire.
 */
const generateNextPaymentNumber = async (organizationId) => {
  const [result] = await SupplierPayment.aggregate([
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
  return `SP-${maxSeq + 1}`;
};

/**
 * Every invoice of this supplier that still owes something, in the order the chosen
 * strategy wants to clear them.
 *
 * @param {Object} params
 * @param {'fifo'|'due_date'|'manual'|'reference'} [params.strategy='fifo']
 * @param {string[]} [params.purchaseIds] restrict to these invoices (manual/reference modes)
 * @returns {Promise<Array>} open invoices with their live settlement snapshot
 */
const getOpenInvoicesForSupplier = async ({ organizationId, branchId, supplier, strategy = 'fifo', purchaseIds }) => {
  const match = { supplier: toObjectId(supplier) };
  if (organizationId) match.organizationId = toObjectId(organizationId);
  if (branchId) match.branchId = toObjectId(branchId);
  if (Array.isArray(purchaseIds) && purchaseIds.length > 0) {
    match._id = { $in: purchaseIds.map(toObjectId) };
  }

  // Oldest-first is the ERP default ("FIFO"); due-date-first re-orders by when the money is
  // contractually owed, pushing undated invoices to the back rather than dropping them.
  const sort =
    strategy === 'due_date'
      ? { dueSortKey: 1, purchaseDate: 1, createdAt: 1 }
      : { purchaseDate: 1, createdAt: 1 };

  return Purchase.aggregate([
    { $match: match },
    buildSettlementAddFieldsStage(),
    { $match: { remainingAmount: { $gt: SETTLEMENT_EPSILON } } },
    { $addFields: { dueSortKey: { $ifNull: ['$dueDate', NO_DUE_DATE_SORT_KEY] } } },
    { $sort: sort },
    {
      $project: {
        _id: 1,
        invoiceNumber: 1,
        vendorBillNumber: 1,
        purchaseDate: 1,
        dueDate: 1,
        totalAmount: 1,
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
 * is left over after every open invoice is full becomes `unappliedAmount` — the supplier's
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
      purchase: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      purchaseDate: invoice.purchaseDate,
      dueDate: invoice.dueDate || null,
      invoiceTotal: toNumber(invoice.totalAmount),
      outstandingBefore: toNumber(invoice.remainingAmount),
      amount: Money.fromMinorUnits(allocMinor),
    });
  };

  if (mode === 'manual' || mode === 'reference') {
    const byId = new Map(openInvoices.map((invoice) => [String(invoice._id), invoice]));
    for (const line of manualAllocations) {
      const invoice = byId.get(String(line.purchaseId || line.purchase));
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

/**
 * Why the Supplier Ledger's balance and the purchase list's outstanding total differ — as a
 * signed, tie-out bridge rather than two numbers the user is left to reconcile by hand.
 *
 * They measure different things, and both are correct:
 *   • invoice outstanding = gross open purchase invoices (an AP aging figure)
 *   • ledger balance      = the net account position, which also nets off money and value
 *                           that hasn't been applied to any specific invoice
 *
 * The gap is always made of the same four things:
 *   unallocatedPayments — money genuinely paid that no invoice has been credited with
 *                         (payments recorded before allocation existed).
 *   returnCredits       — purchase returns whose credit never reached their invoice.
 *                         Both of the above ARE gaps worth closing, and
 *                         repairSupplierAllocations() below is the one-click fix.
 *   availableCredit     — deliberate advances/over-payments held for future invoices.
 *   contraCredits       — debit notes: value this supplier owes US (they were sold goods
 *                         through their shadow customer account), netted off the balance but
 *                         never a payment of a particular bill.
 *   invoiceOverpayment  — an invoice with MORE recorded against it than it was ever worth
 *                         (e.g. one bill's payment field used to pay several). The balance
 *                         nets that excess off; gross open items can't. Needs a human
 *                         decision about which bill the money was really for, so it is
 *                         reported with the invoice number rather than auto-moved.
 *   ledgerDrift         — purchase ledger rows that disagree with the purchase documents
 *                         they mirror. Legacy data; no allocation can fix it.
 *
 * `unexplained` catches anything else (manual adjustments, opening balances, entries edited
 * by hand) so the identity below always holds exactly instead of quietly drifting:
 *   invoiceOutstanding - unallocatedPayments - availableCredit - contraCredits
 *                      - returnCredits - invoiceOverpayment - ledgerDrift - residual
 *                      = ledgerBalance
 *
 * Scoped by supplier + organization, not branch: a Supplier document lives in one branch, so
 * this matches how `Supplier.balance` itself is maintained (across all of that supplier's
 * entries) and can't disagree with the number the ledger screen prints.
 */
const getSupplierReconciliation = async ({ organizationId, supplier }) => {
  const match = { supplier: toObjectId(supplier) };
  if (organizationId) match.organizationId = toObjectId(organizationId);

  // The ledger screen prints the STORED Supplier.balance while this walks the entries live.
  // Recalculating first (the same call queryLedgerEntries already makes on every ledger page
  // load) guarantees the two figures on that page can never disagree by a stale amount.
  // eslint-disable-next-line global-require
  await require('./supplierLedger.service').recalculateBalances(supplier);

  const [invoiceTotals] = await Purchase.aggregate([
    { $match: match },
    buildSettlementAddFieldsStage(),
    {
      $group: {
        _id: null,
        invoiceCount: { $sum: 1 },
        openInvoiceCount: { $sum: { $cond: [{ $gt: ['$remainingAmount', SETTLEMENT_EPSILON] }, 1, 0] } },
        totalPurchased: { $sum: '$totalAmount' },
        // Gross open items, the AP-aging convention: an invoice that was paid too much
        // contributes zero here rather than a negative that quietly cancels out someone
        // else's genuine debt.
        invoiceOutstanding: { $sum: { $cond: [{ $gt: ['$remainingAmount', 0] }, '$remainingAmount', 0] } },
        // ...which is exactly why the excess has to be reported on its own: the account
        // balance DOES net it off, so it is a real part of the difference between the two.
        invoiceOverpayment: {
          $sum: { $cond: [{ $lt: ['$remainingAmount', 0] }, { $abs: '$remainingAmount' }, 0] },
        },
        overpaidInvoiceCount: { $sum: { $cond: [{ $lt: ['$remainingAmount', -SETTLEMENT_EPSILON] }, 1, 0] } },
        overpaidInvoices: {
          $push: {
            $cond: [{ $lt: ['$remainingAmount', -SETTLEMENT_EPSILON] }, '$invoiceNumber', '$$REMOVE'],
          },
        },
      },
    },
  ]);

  const [ledgerTotals] = await SupplierLedger.aggregate([
    { $match: match },
    { $group: { _id: null, debit: { $sum: '$debit' }, credit: { $sum: '$credit' } } },
  ]);

  // Payments that stand on their own (no source document) — the only ledger payments that
  // are supposed to settle open invoices.
  const [standalonePayments] = await SupplierLedger.aggregate([
    { $match: { ...match, transactionType: 'payment_made', referenceId: { $in: [null, undefined] } } },
    { $group: { _id: null, total: { $sum: '$debit' }, count: { $sum: 1 } } },
  ]);

  // A return whose credit HAS been applied to its invoice moves both sides of the bridge at
  // once (the invoice owes less AND the ledger balance is lower), so it is not part of the
  // difference — only the ones still floating on the account are. Same rule the payment side
  // already follows, hence the lookup rather than a plain sum.
  const [creditsFromLedger] = await SupplierLedger.aggregate([
    { $match: { ...match, transactionType: { $in: ['debit_note', 'purchase_return'] } } },
    {
      $lookup: {
        from: 'supplierpayments',
        localField: '_id',
        foreignField: 'supplierLedgerEntryId',
        as: '_allocation',
      },
    },
    {
      $addFields: {
        isApplied: {
          $gt: [
            {
              $size: {
                $filter: { input: '$_allocation', as: 'a', cond: { $eq: ['$$a.status', 'posted'] } },
              },
            },
            0,
          ],
        },
      },
    },
    {
      $group: {
        _id: null,
        contraCredits: { $sum: { $cond: [{ $eq: ['$transactionType', 'debit_note'] }, '$debit', 0] } },
        contraCount: { $sum: { $cond: [{ $eq: ['$transactionType', 'debit_note'] }, 1, 0] } },
        returnCredits: {
          $sum: {
            $cond: [{ $and: [{ $eq: ['$transactionType', 'purchase_return'] }, { $eq: ['$isApplied', false] }] }, '$debit', 0],
          },
        },
        returnCount: {
          $sum: {
            $cond: [{ $and: [{ $eq: ['$transactionType', 'purchase_return'] }, { $eq: ['$isApplied', false] }] }, 1, 0],
          },
        },
        // Returns that DO have an invoice credit — reported for transparency, never as a gap.
        appliedReturnCredits: {
          $sum: {
            $cond: [{ $and: [{ $eq: ['$transactionType', 'purchase_return'] }, { $eq: ['$isApplied', true] }] }, '$debit', 0],
          },
        },
      },
    },
  ]);

  // How far the supplier's PURCHASE ledger rows have drifted from the purchase documents
  // themselves. Legacy data (invoices edited before ledger sync was reliable, rows touched by
  // hand) lands here — naming it beats dumping it into a nameless "other adjustments" bucket,
  // because it is the one part of the difference that no allocation can fix.
  const [ledgerPurchaseTotals] = await SupplierLedger.aggregate([
    { $match: { ...match, transactionType: { $in: ['purchase', 'payment_made'] } } },
    {
      $group: {
        _id: null,
        purchaseCredits: { $sum: { $cond: [{ $eq: ['$transactionType', 'purchase'] }, '$credit', 0] } },
        purchaseDebits: { $sum: { $cond: [{ $eq: ['$transactionType', 'purchase'] }, '$debit', 0] } },
        linkedPaymentDebits: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$transactionType', 'payment_made'] },
                  { $ne: [{ $ifNull: ['$referenceId', null] }, null] },
                ],
              },
              '$debit',
              0,
            ],
          },
        },
      },
    },
  ]);

  const [purchaseDocTotals] = await Purchase.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$totalAmount' }, paidAtPurchase: { $sum: { $ifNull: ['$paidAmount', 0] } } } },
  ]);

  const [paymentTotals] = await SupplierPayment.aggregate([
    { $match: { ...match, status: 'posted', direction: 'payment' } },
    { $group: { _id: null, recorded: { $sum: '$amount' }, allocated: { $sum: '$allocatedTotal' }, unapplied: { $sum: '$unappliedAmount' } } },
  ]);

  const invoiceOutstanding = Money.roundMoney(invoiceTotals?.invoiceOutstanding || 0);
  const ledgerBalance = Money.roundMoney((ledgerTotals?.credit || 0) - (ledgerTotals?.debit || 0));
  const supplierDoc = await Supplier.findById(supplier).select('balance').lean();
  const availableCredit = Money.roundMoney(paymentTotals?.unapplied || 0);
  const contraCredits = Money.roundMoney(creditsFromLedger?.contraCredits || 0);
  const returnCredits = Money.roundMoney(creditsFromLedger?.returnCredits || 0);
  // Paid on the ledger but never turned into an allocation record at all — the part a
  // one-click re-apply can actually fix.
  const unallocatedPayments = Money.roundMoney(
    Math.max(0, (standalonePayments?.total || 0) - (paymentTotals?.recorded || 0))
  );

  // Signed drift: invoice value the ledger never recorded, less settlement the ledger shows
  // but the invoices don't.
  const ledgerDrift = Money.roundMoney(
    (purchaseDocTotals?.total || 0) -
      (ledgerPurchaseTotals?.purchaseCredits || 0) -
      ((purchaseDocTotals?.paidAtPurchase || 0) -
        (ledgerPurchaseTotals?.purchaseDebits || 0) -
        (ledgerPurchaseTotals?.linkedPaymentDebits || 0))
  );

  const invoiceOverpayment = Money.roundMoney(invoiceTotals?.invoiceOverpayment || 0);

  const explained = Money.roundMoney(
    unallocatedPayments + availableCredit + contraCredits + returnCredits + ledgerDrift + invoiceOverpayment
  );
  // Whatever is still unaccounted for after every named component — kept so the identity
  // below holds exactly rather than drifting silently.
  const residual = Money.roundMoney(invoiceOutstanding - explained - ledgerBalance);
  const unexplained = Money.roundMoney(ledgerDrift + invoiceOverpayment + residual);

  return {
    invoiceOutstanding,
    ledgerBalance,
    invoiceCount: invoiceTotals?.invoiceCount || 0,
    openInvoiceCount: invoiceTotals?.openInvoiceCount || 0,
    totalPurchased: Money.roundMoney(invoiceTotals?.totalPurchased || 0),
    storedBalance: Money.roundMoney(supplierDoc?.balance || 0),
    unallocatedPayments,
    unallocatedPaymentCount: standalonePayments?.count || 0,
    availableCredit,
    contraCredits,
    contraCount: creditsFromLedger?.contraCount || 0,
    returnCredits,
    returnCount: creditsFromLedger?.returnCount || 0,
    appliedReturnCredits: Money.roundMoney(creditsFromLedger?.appliedReturnCredits || 0),
    invoiceOverpayment,
    overpaidInvoiceCount: invoiceTotals?.overpaidInvoiceCount || 0,
    // Named so the user can go straight to the invoice that needs a human decision.
    overpaidInvoices: (invoiceTotals?.overpaidInvoices || []).slice(0, 5),
    ledgerDrift,
    residual,
    unexplained,
    // Everything a button can still fix. Drift can't be — it needs the ledger rebuilt from
    // the purchase documents, which is a deliberate, separate operation.
    fixableAmount: Money.roundMoney(unallocatedPayments + returnCredits),
    // True once nothing fixable is left sitting between the two figures.
    isReconciled:
      Math.abs(unallocatedPayments) <= SETTLEMENT_EPSILON &&
      Math.abs(returnCredits) <= SETTLEMENT_EPSILON &&
      Math.abs(unexplained) <= SETTLEMENT_EPSILON,
  };
};

/**
 * One-click repair for accounts carried over from before invoices tracked their own
 * settlement. Two kinds of ledger row can be sitting there unapplied, and both are safe to
 * replay because neither moves money — the ledger entry already banked whatever it banked:
 *
 *   • standalone `payment_made` — money paid to the supplier that no invoice was credited
 *     with. Replayed oldest-first, exactly as if it had allocated when it was entered.
 *   • `purchase_return` — goods sent back against a specific invoice, where the credit only
 *     ever reached the account balance and never the invoice itself.
 *
 * Deliberately does NOT touch `ledgerDrift` (purchase rows that disagree with their invoice):
 * fixing that means rewriting accounting history, which is a separate, explicit operation.
 *
 * Idempotent — anything that already has an allocation record is skipped, so the button can
 * be pressed twice with no effect. Same work as
 * src/scripts/backfill-supplier-payment-allocations.js, scoped to one supplier.
 */
const repairSupplierAllocations = async ({ organizationId, branchId, supplier }, user) => {
  const scope = { supplier: toObjectId(supplier) };
  if (organizationId) scope.organizationId = toObjectId(organizationId);

  const entries = await SupplierLedger.find({
    ...scope,
    $or: [
      { transactionType: 'payment_made', referenceId: { $in: [null, undefined] } },
      { transactionType: 'purchase_return' },
    ],
  }).sort({ transactionDate: 1, createdAt: 1 });

  const appliedPayments = [];
  const appliedReturns = [];

  for (const entry of entries) {
    const existing = await SupplierPayment.findOne({ supplierLedgerEntryId: entry._id }).select('_id');
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
    reconciliation: await getSupplierReconciliation({ organizationId, branchId, supplier }),
  };
};

/**
 * Undo the invoice credit a purchase return created — used when that return is deleted or
 * rejected, so the invoice goes back to owing what it owed. Never touches the ledger: the
 * return's own delete/reject path owns that side.
 */
const releaseReturnCredit = async (purchaseReturnId, user) => {
  const entry = await SupplierLedger.findOne({
    referenceId: toObjectId(purchaseReturnId),
    referenceModel: 'PurchaseReturn',
    transactionType: 'purchase_return',
  }).select('_id');
  if (!entry) return null;
  return releaseAllocationsForLedgerEntry(entry._id, user);
};

/** Unapplied credit (advance) this supplier is currently holding for us. */
const getSupplierCreditBalance = async ({ organizationId, branchId, supplier }) => {
  const match = { supplier: toObjectId(supplier), status: 'posted', direction: 'payment' };
  if (organizationId) match.organizationId = toObjectId(organizationId);
  if (branchId) match.branchId = toObjectId(branchId);

  const [result] = await SupplierPayment.aggregate([
    { $match: match },
    { $group: { _id: null, credit: { $sum: '$unappliedAmount' } } },
  ]);
  return Money.roundMoney(result?.credit || 0);
};

/** Totals the payment screens lead with: what's owed, what's sitting as credit. */
const getSupplierAccountSummary = async ({ organizationId, branchId, supplier }) => {
  const match = { supplier: toObjectId(supplier) };
  if (organizationId) match.organizationId = toObjectId(organizationId);
  if (branchId) match.branchId = toObjectId(branchId);

  const [totals] = await Purchase.aggregate([
    { $match: match },
    buildSettlementAddFieldsStage(),
    {
      $group: {
        _id: null,
        invoiceCount: { $sum: 1 },
        openInvoiceCount: { $sum: { $cond: [{ $gt: ['$remainingAmount', SETTLEMENT_EPSILON] }, 1, 0] } },
        overdueInvoiceCount: { $sum: { $cond: [{ $eq: ['$dueStatus', 'overdue'] }, 1, 0] } },
        totalPurchased: { $sum: '$totalAmount' },
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

  const availableCredit = await getSupplierCreditBalance({ organizationId, branchId, supplier });

  return {
    invoiceCount: totals?.invoiceCount || 0,
    openInvoiceCount: totals?.openInvoiceCount || 0,
    overdueInvoiceCount: totals?.overdueInvoiceCount || 0,
    totalPurchased: Money.roundMoney(totals?.totalPurchased || 0),
    totalSettled: Money.roundMoney(totals?.totalSettled || 0),
    totalOutstanding: Money.roundMoney(totals?.totalOutstanding || 0),
    overdueAmount: Money.roundMoney(totals?.overdueAmount || 0),
    availableCredit,
  };
};

/**
 * Dry-run of a payment: what would this amount pay off, and what would be left over?
 * The Record Payment dialog calls this on every keystroke, so it stays read-only.
 */
const previewAllocation = async ({
  organizationId,
  branchId,
  supplier,
  amount,
  mode = 'fifo',
  manualAllocations = [],
  purchaseIds,
}) => {
  const openInvoices = await getOpenInvoicesForSupplier({
    organizationId,
    branchId,
    supplier,
    strategy: mode,
    purchaseIds: mode === 'manual' || mode === 'reference' ? undefined : purchaseIds,
  });

  const summary = await getSupplierAccountSummary({ organizationId, branchId, supplier });
  const plan =
    toNumber(amount) > 0
      ? planAllocation({ openInvoices, amount, mode, manualAllocations })
      : { allocations: [], allocatedTotal: 0, unappliedAmount: 0 };

  const allocationByPurchase = new Map(plan.allocations.map((a) => [String(a.purchase), a.amount]));

  return {
    openInvoices: openInvoices.map((invoice) => {
      const applied = allocationByPurchase.get(String(invoice._id)) || 0;
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
    allocations: plan.allocations.map((a) => ({ ...a, purchase: String(a.purchase) })),
    allocatedTotal: plan.allocatedTotal,
    unappliedAmount: plan.unappliedAmount,
    summary,
    outstandingAfter: Money.roundMoney(Math.max(0, summary.totalOutstanding - plan.allocatedTotal)),
  };
};

/** Push each planned allocation onto its invoice. Reversible via `releaseAllocations`. */
const applyAllocationsToPurchases = async (allocations) => {
  for (const allocation of allocations) {
    await Purchase.updateOne({ _id: allocation.purchase }, { $inc: { allocatedAmount: allocation.amount } });
  }
};

/** Hand every allocated rupee back to its invoice (void / re-allocate). */
const releaseAllocations = async (allocations) => {
  for (const allocation of allocations) {
    await Purchase.updateOne({ _id: allocation.purchase }, { $inc: { allocatedAmount: -allocation.amount } });
  }
  // Floating-point crumbs and manual DB edits can leave a hair below zero; clamp so the
  // settlement math never reports a negative "already paid".
  await Purchase.updateMany(
    { _id: { $in: allocations.map((a) => a.purchase) }, allocatedAmount: { $lt: 0 } },
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

/**
 * Record a supplier payment (or a refund the supplier sent back) and settle invoices with it.
 *
 * Money movement is delegated to ONE Supplier Ledger entry, exactly like
 * paymentVoucher.service.js's supplier lines: that entry owns the Cash Book / Wallet /
 * double-entry legs. It is deliberately created without a `referenceId` — supplier ledger's
 * own cash-book sync skips entries that carry one (assuming the parent module already posted
 * the cash line), and `consolidateSupplierCashEntries` would otherwise merge this payment
 * into a same-reference purchase row and delete it.
 */
const createPayment = async (paymentBody, user) => {
  const {
    organizationId,
    branchId,
    supplier: supplierId,
    amount,
    direction = 'payment',
    paymentMethod = 'cash',
    walletType,
    paymentDate,
    referenceNumber,
    notes,
    allocationMode = 'fifo',
    allocations: manualAllocations = [],
    purchaseIds,
  } = paymentBody;

  const numericAmount = Money.roundMoney(amount);
  if (!numericAmount || numericAmount <= 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment amount must be greater than zero');
  }

  const supplier = await Supplier.findOne({ _id: supplierId, organizationId }).select('name');
  if (!supplier) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
  }

  if (paymentMethod === 'wallet' && !String(walletType || '').trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Choose which bank account this payment came from');
  }

  const paymentNumber = await generateNextPaymentNumber(organizationId);
  const effectiveDate = paymentDate ? new Date(paymentDate) : new Date();

  // A refund flows the other way: the supplier hands money back, which can only come out of
  // credit they are holding for us, so it allocates to nothing and shrinks that credit.
  if (direction === 'refund') {
    return createRefund({
      organizationId,
      branchId,
      supplier,
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

  const openInvoices = await getOpenInvoicesForSupplier({
    organizationId,
    branchId,
    supplier: supplierId,
    strategy: allocationMode,
    purchaseIds: allocationMode === 'manual' || allocationMode === 'reference' ? undefined : purchaseIds,
  });

  const plan = planAllocation({
    openInvoices,
    amount: numericAmount,
    mode: allocationMode,
    manualAllocations,
  });

  const payment = await SupplierPayment.create({
    organizationId,
    branchId,
    createdBy: user?.id || user?._id,
    paymentNumber,
    supplier: supplierId,
    supplierName: supplier.name,
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
        `${formatMoney(numericAmount)} paid to ${supplier.name} (${allocationMode.toUpperCase()} allocation across ${plan.allocations.length} invoice(s))`,
        numericAmount
      ),
    ],
  });

  await applyAllocationsToPurchases(plan.allocations);

  const ledgerEntry = await supplierLedgerService.createLedgerEntry(
    {
      organizationId,
      branchId,
      supplier: supplierId,
      transactionType: 'payment_made',
      transactionDate: effectiveDate,
      reference: paymentNumber,
      description: buildLedgerDescription(payment),
      debit: numericAmount,
      credit: 0,
      paymentMethod: paymentMethod === 'wallet' ? `Wallet (${String(walletType).trim()})` : 'Cash',
      notes: notes || '',
      createdBy: user?.id || user?._id,
    },
    // This payment has already allocated itself above — without this the ledger would
    // allocate the same money a second time (see recordAllocationForLedgerEntry).
    { skipInvoiceAllocation: true }
  );

  payment.supplierLedgerEntryId = ledgerEntry._id;
  await payment.save();

  return getPaymentById(payment._id);
};

/** Human-readable one-liner used on the Supplier Ledger row this payment creates. */
const buildLedgerDescription = (payment) => {
  const invoiceList = payment.allocations
    .slice(0, 3)
    .map((a) => `#${a.invoiceNumber}`)
    .join(', ');
  const more = payment.allocations.length > 3 ? ` +${payment.allocations.length - 3} more` : '';
  if (payment.direction === 'refund') {
    return `Refund received from supplier · ${payment.paymentNumber}`;
  }
  if (payment.allocations.length === 0) {
    return `Advance payment to supplier · ${payment.paymentNumber}`;
  }
  return `Supplier payment ${payment.paymentNumber} — ${invoiceList}${more}`;
};

/**
 * The supplier returns money we had over-paid. Consumes their held credit oldest-first and
 * posts a money-IN ledger entry (`payment_received`), which is what shrinks our receivable
 * back toward zero.
 */
const createRefund = async ({
  organizationId,
  branchId,
  supplier,
  amount,
  paymentMethod,
  walletType,
  paymentNumber,
  effectiveDate,
  referenceNumber,
  notes,
  user,
}) => {
  const availableCredit = await getSupplierCreditBalance({ organizationId, branchId, supplier: supplier._id });
  if (amount > availableCredit + SETTLEMENT_EPSILON) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      `${supplier.name} is only holding ${formatMoney(availableCredit)} of unapplied credit — a larger refund would not match the ledger`
    );
  }

  const creditSources = await SupplierPayment.find({
    organizationId,
    branchId,
    supplier: supplier._id,
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

  const refund = await SupplierPayment.create({
    organizationId,
    branchId,
    createdBy: user?.id || user?._id,
    paymentNumber,
    supplier: supplier._id,
    supplierName: supplier.name,
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
    history: [historyEntry('created', user, `${formatMoney(amount)} refunded by ${supplier.name}`, amount)],
  });

  const ledgerEntry = await supplierLedgerService.createLedgerEntry({
    organizationId,
    branchId,
    supplier: supplier._id,
    transactionType: 'payment_received',
    transactionDate: effectiveDate,
    reference: paymentNumber,
    description: buildLedgerDescription(refund),
    debit: 0,
    credit: amount,
    paymentMethod: paymentMethod === 'wallet' ? `Wallet (${String(walletType).trim()})` : 'Cash',
    notes: notes || '',
    createdBy: user?.id || user?._id,
  });

  refund.supplierLedgerEntryId = ledgerEntry._id;
  await refund.save();

  return getPaymentById(refund._id);
};

/**
 * Put a supplier's existing credit (money already paid, never applied) against open
 * invoices. No cash moves — the original payment's ledger entry already recorded that — so
 * this only re-labels where that money sits.
 */
const applyCredit = async ({ organizationId, branchId, supplier: supplierId, amount, mode = 'fifo', allocations: manualAllocations = [] }, user) => {
  const availableCredit = await getSupplierCreditBalance({ organizationId, branchId, supplier: supplierId });
  const requested = amount ? Money.roundMoney(amount) : availableCredit;

  if (availableCredit <= SETTLEMENT_EPSILON) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This supplier is not holding any unapplied credit');
  }
  if (requested > availableCredit + SETTLEMENT_EPSILON) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Only ${formatMoney(availableCredit)} of credit is available`);
  }

  const openInvoices = await getOpenInvoicesForSupplier({
    organizationId,
    branchId,
    supplier: supplierId,
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
  const creditSources = await SupplierPayment.find({
    organizationId,
    branchId,
    supplier: supplierId,
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
        purchase: target.purchase,
        invoiceNumber: target.invoiceNumber,
        purchaseDate: target.purchaseDate,
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

  await applyAllocationsToPurchases(plan.allocations);

  return {
    appliedAmount: plan.allocatedTotal,
    allocations: plan.allocations.map((a) => ({ ...a, purchase: String(a.purchase) })),
    remainingCredit: await getSupplierCreditBalance({ organizationId, branchId, supplier: supplierId }),
  };
};

/**
 * Reverse a payment completely: the Supplier Ledger entry (and with it the Cash Book /
 * Wallet / double-entry legs) is deleted, every allocated rupee is handed back to its
 * invoice, and the document survives as a voided record with its history intact — an ERP
 * never silently deletes a posted payment.
 */
const voidPayment = async (paymentId, { reason } = {}, user) => {
  const payment = await SupplierPayment.findById(paymentId);
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }
  if (payment.status === 'void') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'This payment has already been voided');
  }

  if (payment.direction === 'refund') {
    // Voiding a refund hands the credit back to the supplier's balance. Give it to the
    // oldest payment that can hold it so the credit total lines back up.
    const holder = await SupplierPayment.findOne({
      organizationId: payment.organizationId,
      branchId: payment.branchId,
      supplier: payment.supplier,
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

  if (payment.supplierLedgerEntryId) {
    await supplierLedgerService.deleteLedgerEntry(payment.supplierLedgerEntryId).catch(() => {});
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
  const payment = await SupplierPayment.findById(paymentId);
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
    const openInvoices = await getOpenInvoicesForSupplier({
      organizationId: payment.organizationId,
      branchId: payment.branchId,
      supplier: payment.supplier,
      strategy: mode,
    });
    const plan = planAllocation({ openInvoices, amount: payment.amount, mode, manualAllocations });
    await applyAllocationsToPurchases(plan.allocations);

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
    await applyAllocationsToPurchases(payment.allocations);
    throw error;
  }

  return getPaymentById(payment._id);
};

const queryPayments = async (filter, options) => {
  const opts = { ...options };
  opts.populate = [
    { path: 'supplier', select: 'name nameUrdu phone picture' },
    { path: 'createdBy', select: 'name email' },
  ];
  opts.sortBy = opts.sortBy || 'paymentDate:desc,createdAt:desc';
  return SupplierPayment.paginate(filter, opts);
};

const getPaymentById = async (id) =>
  SupplierPayment.findById(id)
    .populate('supplier', 'name nameUrdu phone picture')
    .populate('createdBy', 'name email')
    .populate('voidedBy', 'name email');

/** Every payment that has touched one invoice — the drawer's Payment History section. */
const getPaymentsForPurchase = async (purchaseId) => {
  const payments = await SupplierPayment.find({ 'allocations.purchase': toObjectId(purchaseId) })
    .populate('createdBy', 'name email')
    .sort({ paymentDate: -1, createdAt: -1 })
    .lean();

  return payments.map((payment) => {
    const applied = (payment.allocations || [])
      .filter((allocation) => String(allocation.purchase) === String(purchaseId))
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
const getPurchaseSettlementDetail = async (purchaseId) => {
  const purchase = await Purchase.findById(purchaseId).select('totalAmount paidAmount allocatedAmount dueDate').lean();
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }
  const settlement = resolvePurchaseSettlement(purchase);
  const payments = await getPaymentsForPurchase(purchaseId);
  return { ...settlement, paidAtPurchase: toNumber(purchase.paidAmount), payments };
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
 * Settle open invoices from a supplier-ledger payment that was recorded somewhere else —
 * the Supplier Ledger screen's "Cash Paid" row, or a Payment Voucher's supplier line.
 *
 * Before this, those two flows moved real money and moved the supplier's balance, but no
 * invoice knew about it: the ledger said paid, the purchase list still said outstanding.
 * This closes that gap by building the SAME SupplierPayment allocation record the Record
 * Payment dialog builds — except the Supplier Ledger entry already exists, so this one
 * attaches to it (`supplierLedgerEntryId`) instead of creating a second one.
 *
 * Idempotent: called again for a ledger entry that already has a payment, it does nothing.
 * @returns {Promise<SupplierPayment|null>} null when the entry isn't an allocatable payment
 */
const recordAllocationForLedgerEntry = async (entry, user, { allocationMode = 'fifo' } = {}) => {
  if (!entry) return null;
  const isPayment = entry.transactionType === 'payment_made';
  const isReturn = entry.transactionType === 'purchase_return';
  if (!isPayment && !isReturn) return null;
  // A payment tied to a source document (a purchase's own paid-at-entry leg) is already
  // reflected on that purchase — allocating it again would pay the same invoice twice.
  // Returns are the opposite: they are ALWAYS tied to their PurchaseReturn document, which
  // is exactly what tells us which invoice the credit belongs to.
  if (isPayment && entry.referenceId) return null;

  const amount = Money.roundMoney(entry.debit);
  if (!amount || amount <= 0) return null;

  const existing = await SupplierPayment.findOne({ supplierLedgerEntryId: entry._id });
  if (existing) return existing;

  const supplier = await Supplier.findById(entry.supplier).select('name');

  let plan;
  let mode = allocationMode;
  let direction = 'payment';

  if (isReturn) {
    // Goods went back against one specific invoice — this credit belongs there, not on the
    // oldest open bill. A return with no linked purchase (e.g. forwarded from a customer
    // sales return) legitimately has no invoice to credit, so it stays on the account.
    const purchaseReturn = await PurchaseReturn.findById(entry.referenceId).select('purchaseId status returnNumber');
    if (!purchaseReturn?.purchaseId || purchaseReturn.status === 'rejected') return null;

    const [invoice] = await getOpenInvoicesForSupplier({
      organizationId: entry.organizationId,
      branchId: entry.branchId,
      supplier: entry.supplier,
      purchaseIds: [purchaseReturn.purchaseId],
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
      manualAllocations: [{ purchaseId: String(invoice._id), amount: Math.min(amount, invoice.remainingAmount) }],
    });
  } else {
    const openInvoices = await getOpenInvoicesForSupplier({
      organizationId: entry.organizationId,
      branchId: entry.branchId,
      supplier: entry.supplier,
      strategy: allocationMode,
    });
    plan = planAllocation({ openInvoices, amount, mode: allocationMode });
  }

  const { paymentMethod, walletType } = parseLedgerPaymentMethod(entry.paymentMethod);
  const paymentNumber = await generateNextPaymentNumber(entry.organizationId);

  const payment = await SupplierPayment.create({
    organizationId: entry.organizationId,
    branchId: entry.branchId,
    createdBy: entry.createdBy || user?.id || user?._id,
    paymentNumber,
    supplier: entry.supplier,
    supplierName: supplier?.name,
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
    supplierLedgerEntryId: entry._id,
    history: [
      historyEntry(
        'created',
        user,
        isReturn
          ? `Purchase return ${entry.reference || ''} credited ${formatMoney(plan.allocatedTotal)} to invoice ${plan.allocations[0]?.invoiceNumber || ''}`.trim()
          : `Recorded from the supplier ledger — ${formatMoney(amount)} applied across ${plan.allocations.length} invoice(s)`,
        amount
      ),
    ],
  });

  await applyAllocationsToPurchases(plan.allocations);
  return payment;
};

/**
 * The ledger entry behind a payment was edited (usually its amount): re-spread it. The
 * ledger owns the money, this only re-decides which invoices that money covers.
 */
const syncAllocationForLedgerEntry = async (entry, user) => {
  if (!entry) return null;
  const payment = await SupplierPayment.findOne({ supplierLedgerEntryId: entry._id });
  // No allocation to keep in step (an entry from before this feature, or one already
  // voided): leave it alone. Editing an old row's description must never silently mark
  // invoices paid — backfilling history is an explicit, opt-in script.
  if (!payment || payment.status === 'void') return null;

  const amount = Money.roundMoney(entry.debit);
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

  const openInvoices = await getOpenInvoicesForSupplier({
    organizationId: entry.organizationId,
    branchId: entry.branchId,
    supplier: entry.supplier,
    strategy: payment.allocationMode === 'manual' ? 'fifo' : payment.allocationMode,
  });
  const plan = planAllocation({ openInvoices, amount, mode: payment.allocationMode === 'manual' ? 'fifo' : payment.allocationMode });
  await applyAllocationsToPurchases(plan.allocations);

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
 * supplierLedger.service.js's deleteLedgerEntry is the caller, and voidPayment() deletes
 * the ledger entry, so the two must never call each other.
 */
const releaseAllocationsForLedgerEntry = async (ledgerEntryId, user) => {
  const payment = await SupplierPayment.findOne({ supplierLedgerEntryId: ledgerEntryId });
  if (!payment || payment.status === 'void') return null;

  await releaseAllocations(payment.allocations);
  payment.status = 'void';
  payment.voidedAt = new Date();
  payment.voidedBy = user?.id || user?._id;
  payment.voidReason = 'Source supplier ledger entry deleted';
  payment.allocatedTotal = 0;
  payment.unappliedAmount = 0;
  payment.history.push(historyEntry('voided', user, 'Source supplier ledger entry deleted', payment.amount));
  await payment.save();
  return payment;
};

/**
 * An invoice is being deleted: strip it out of every payment that had money sitting on it
 * and hand that money back as unapplied credit. Without this, deleting a purchase would
 * leave allocations pointing at a document that no longer exists and quietly shrink the
 * supplier's credit balance by that amount.
 */
const detachPurchaseAllocations = async (purchaseId) => {
  const payments = await SupplierPayment.find({ 'allocations.purchase': toObjectId(purchaseId) });

  for (const payment of payments) {
    const released = payment.allocations
      .filter((allocation) => String(allocation.purchase) === String(purchaseId))
      .reduce((sum, allocation) => Money.addMoney(sum, allocation.amount), 0);
    if (released <= 0) continue;

    payment.allocations = payment.allocations.filter(
      (allocation) => String(allocation.purchase) !== String(purchaseId)
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
  detachPurchaseAllocations,
  recordAllocationForLedgerEntry,
  syncAllocationForLedgerEntry,
  releaseAllocationsForLedgerEntry,
  getOpenInvoicesForSupplier,
  planAllocation,
  previewAllocation,
  getSupplierCreditBalance,
  getSupplierAccountSummary,
  getSupplierReconciliation,
  repairSupplierAllocations,
  releaseReturnCredit,
  createPayment,
  applyCredit,
  voidPayment,
  reallocatePayment,
  queryPayments,
  getPaymentById,
  getPaymentsForPurchase,
  getPurchaseSettlementDetail,
};
