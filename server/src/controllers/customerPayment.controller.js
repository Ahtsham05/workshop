const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const pick = require('../utils/pick');
const { customerPaymentService, auditLogService } = require('../services');
const { applyBranchFilter, getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');
const { applyBusinessDateRange } = require('../utils/businessTimezone');

const scopeOf = (req) => {
  const scope = {};
  applyBranchFilter(scope, req);
  return scope;
};

/** Open (still-owed) invoices for a customer, in the order the chosen strategy settles them. */
const getOpenInvoices = catchAsync(async (req, res) => {
  const invoices = await customerPaymentService.getOpenInvoicesForCustomer({
    ...scopeOf(req),
    customer: req.params.customerId,
    strategy: req.query.strategy,
  });
  res.send({ results: invoices.map((invoice) => ({ ...invoice, id: String(invoice._id) })) });
});

/** Outstanding / overdue / held-credit totals for one customer. */
const getCustomerAccountSummary = catchAsync(async (req, res) => {
  const summary = await customerPaymentService.getCustomerAccountSummary({
    ...scopeOf(req),
    customer: req.params.customerId,
  });
  res.send(summary);
});

/**
 * The tie-out between the Customer Ledger's balance and the invoice list's outstanding
 * total — see customerPayment.service.js's getCustomerReconciliation for what the gap is
 * made of and which part of it is fixable.
 */
const getCustomerReconciliation = catchAsync(async (req, res) => {
  const reconciliation = await customerPaymentService.getCustomerReconciliation({
    ...scopeOf(req),
    customer: req.params.customerId,
  });
  res.send(reconciliation);
});

/**
 * One-click repair for a legacy account: applies ledger "Cash Received" rows that never
 * reached an invoice. Idempotent, and moves no money.
 */
const repairAllocations = catchAsync(async (req, res) => {
  const result = await customerPaymentService.repairCustomerAllocations(
    { ...scopeOf(req), customer: req.params.customerId },
    req.user
  );

  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'CustomerPayment',
    entityName: 'Legacy allocations repaired',
    metadata: {
      customer: req.params.customerId,
      appliedCount: result.appliedCount,
      appliedTotal: result.appliedTotal,
    },
  });

  res.send(result);
});

/** Dry-run: what would this amount settle? Drives the live allocation preview. */
const previewAllocation = catchAsync(async (req, res) => {
  const preview = await customerPaymentService.previewAllocation({
    ...scopeOf(req),
    customer: req.body.customer,
    amount: req.body.amount,
    mode: req.body.allocationMode,
    manualAllocations: req.body.allocations,
    invoiceIds: req.body.invoiceIds,
  });
  res.send(preview);
});

const createPayment = catchAsync(async (req, res) => {
  await resolveWriteBranchId(req);
  const payment = await customerPaymentService.createPayment({ ...req.body, ...getBranchContext(req) }, req.user);

  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'CustomerPayment',
    entityId: payment._id,
    entityName: payment.paymentNumber,
    metadata: {
      customer: payment.customerName,
      amount: payment.amount,
      allocated: payment.allocatedTotal,
      unapplied: payment.unappliedAmount,
      direction: payment.direction,
      invoices: payment.allocations.map((allocation) => allocation.invoiceNumber),
    },
  });

  res.status(httpStatus.CREATED).send(payment);
});

const getPayments = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['customer', 'status', 'direction', 'paymentMethod']);
  applyBranchFilter(filter, req);

  const { search, minAmount, maxAmount } = req.query;
  // Calendar dates ("2026-09-22") are boundaries in Pakistan time, not server-local/UTC
  // midnight — otherwise this list's total can drift from the dashboard card's, which resolves
  // the same date range in business time.
  const dateRange = pick(req.query, ['startDate', 'endDate']);
  applyBusinessDateRange(dateRange, 'paymentDate');
  if (dateRange.paymentDate) {
    filter.paymentDate = dateRange.paymentDate;
  }
  if (minAmount || maxAmount) {
    filter.amount = {};
    if (minAmount) filter.amount.$gte = Number(minAmount);
    if (maxAmount) filter.amount.$lte = Number(maxAmount);
  }
  if (search) {
    const escaped = String(search)
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { paymentNumber: { $regex: escaped, $options: 'i' } },
      { referenceNumber: { $regex: escaped, $options: 'i' } },
      { customerName: { $regex: escaped, $options: 'i' } },
      { 'allocations.invoiceNumber': { $regex: escaped, $options: 'i' } },
    ];
  }

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  res.send(await customerPaymentService.queryPayments(filter, options));
});

const getPayment = catchAsync(async (req, res) => {
  const payment = await customerPaymentService.getPaymentById(req.params.paymentId);
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }
  res.send(payment);
});

/** Payment history for one invoice — the view drawer's Payment History section. */
const getPaymentsForInvoice = catchAsync(async (req, res) => {
  res.send(await customerPaymentService.getInvoiceSettlementDetail(req.params.invoiceId));
});

const applyCredit = catchAsync(async (req, res) => {
  const result = await customerPaymentService.applyCredit(
    {
      ...scopeOf(req),
      customer: req.body.customer,
      amount: req.body.amount,
      mode: req.body.allocationMode,
      allocations: req.body.allocations,
    },
    req.user
  );

  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'CustomerPayment',
    entityName: 'Credit applied',
    metadata: { customer: req.body.customer, applied: result.appliedAmount },
  });

  res.send(result);
});

const voidPayment = catchAsync(async (req, res) => {
  const payment = await customerPaymentService.voidPayment(req.params.paymentId, req.body, req.user);

  await auditLogService.recordAuditLog({
    req,
    action: 'status_change',
    module: 'CustomerPayment',
    entityId: payment._id,
    entityName: payment.paymentNumber,
    metadata: { status: 'void', reason: payment.voidReason, amount: payment.amount },
  });

  res.send(payment);
});

const reallocatePayment = catchAsync(async (req, res) => {
  const payment = await customerPaymentService.reallocatePayment(req.params.paymentId, req.body, req.user);

  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'CustomerPayment',
    entityId: payment._id,
    entityName: payment.paymentNumber,
    metadata: { allocations: payment.allocations.map((allocation) => `${allocation.invoiceNumber}:${allocation.amount}`) },
  });

  res.send(payment);
});

module.exports = {
  getOpenInvoices,
  getCustomerAccountSummary,
  getCustomerReconciliation,
  repairAllocations,
  previewAllocation,
  createPayment,
  getPayments,
  getPayment,
  getPaymentsForInvoice,
  applyCredit,
  voidPayment,
  reallocatePayment,
};
