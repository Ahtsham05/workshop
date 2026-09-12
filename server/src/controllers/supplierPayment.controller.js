const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const pick = require('../utils/pick');
const { supplierPaymentService, auditLogService } = require('../services');
const { applyBranchFilter, getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');

const scopeOf = (req) => {
  const scope = {};
  applyBranchFilter(scope, req);
  return scope;
};

/** Open (still-owed) invoices for a supplier, in the order the chosen strategy pays them. */
const getOpenInvoices = catchAsync(async (req, res) => {
  const invoices = await supplierPaymentService.getOpenInvoicesForSupplier({
    ...scopeOf(req),
    supplier: req.params.supplierId,
    strategy: req.query.strategy,
  });
  res.send({ results: invoices.map((invoice) => ({ ...invoice, id: String(invoice._id) })) });
});

/** Outstanding / overdue / held-credit totals for one supplier. */
const getSupplierAccountSummary = catchAsync(async (req, res) => {
  const summary = await supplierPaymentService.getSupplierAccountSummary({
    ...scopeOf(req),
    supplier: req.params.supplierId,
  });
  res.send(summary);
});

/**
 * The tie-out between the Supplier Ledger's balance and the purchase list's outstanding
 * total — see supplierPayment.service.js's getSupplierReconciliation for what the gap is
 * made of and which part of it is fixable.
 */
const getSupplierReconciliation = catchAsync(async (req, res) => {
  const reconciliation = await supplierPaymentService.getSupplierReconciliation({
    ...scopeOf(req),
    supplier: req.params.supplierId,
  });
  res.send(reconciliation);
});

/**
 * One-click repair for a legacy account: applies ledger payments and purchase-return credits
 * that never reached an invoice. Idempotent, and moves no money.
 */
const repairAllocations = catchAsync(async (req, res) => {
  const result = await supplierPaymentService.repairSupplierAllocations(
    { ...scopeOf(req), supplier: req.params.supplierId },
    req.user
  );

  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'SupplierPayment',
    entityName: 'Legacy allocations repaired',
    metadata: {
      supplier: req.params.supplierId,
      appliedCount: result.appliedCount,
      paymentCount: result.paymentCount,
      returnCount: result.returnCount,
      appliedTotal: result.appliedTotal,
    },
  });

  res.send(result);
});

/** Dry-run: what would this amount settle? Drives the live allocation preview. */
const previewAllocation = catchAsync(async (req, res) => {
  const preview = await supplierPaymentService.previewAllocation({
    ...scopeOf(req),
    supplier: req.body.supplier,
    amount: req.body.amount,
    mode: req.body.allocationMode,
    manualAllocations: req.body.allocations,
    purchaseIds: req.body.purchaseIds,
  });
  res.send(preview);
});

const createPayment = catchAsync(async (req, res) => {
  await resolveWriteBranchId(req);
  const payment = await supplierPaymentService.createPayment({ ...req.body, ...getBranchContext(req) }, req.user);

  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'SupplierPayment',
    entityId: payment._id,
    entityName: payment.paymentNumber,
    metadata: {
      supplier: payment.supplierName,
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
  const filter = pick(req.query, ['supplier', 'status', 'direction', 'paymentMethod']);
  applyBranchFilter(filter, req);

  const { startDate, endDate, search } = req.query;
  if (startDate || endDate) {
    filter.paymentDate = {};
    if (startDate) filter.paymentDate.$gte = new Date(new Date(startDate).setHours(0, 0, 0, 0));
    if (endDate) filter.paymentDate.$lte = new Date(new Date(endDate).setHours(23, 59, 59, 999));
  }
  if (search) {
    const escaped = String(search)
      .trim()
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { paymentNumber: { $regex: escaped, $options: 'i' } },
      { referenceNumber: { $regex: escaped, $options: 'i' } },
      { supplierName: { $regex: escaped, $options: 'i' } },
      { 'allocations.invoiceNumber': { $regex: escaped, $options: 'i' } },
    ];
  }

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  res.send(await supplierPaymentService.queryPayments(filter, options));
});

const getPayment = catchAsync(async (req, res) => {
  const payment = await supplierPaymentService.getPaymentById(req.params.paymentId);
  if (!payment) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  }
  res.send(payment);
});

/** Payment history for one purchase invoice — the view drawer's Payment History section. */
const getPaymentsForPurchase = catchAsync(async (req, res) => {
  res.send(await supplierPaymentService.getPurchaseSettlementDetail(req.params.purchaseId));
});

const applyCredit = catchAsync(async (req, res) => {
  const result = await supplierPaymentService.applyCredit(
    {
      ...scopeOf(req),
      supplier: req.body.supplier,
      amount: req.body.amount,
      mode: req.body.allocationMode,
      allocations: req.body.allocations,
    },
    req.user
  );

  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'SupplierPayment',
    entityName: 'Credit applied',
    metadata: { supplier: req.body.supplier, applied: result.appliedAmount },
  });

  res.send(result);
});

const voidPayment = catchAsync(async (req, res) => {
  const payment = await supplierPaymentService.voidPayment(req.params.paymentId, req.body, req.user);

  await auditLogService.recordAuditLog({
    req,
    action: 'status_change',
    module: 'SupplierPayment',
    entityId: payment._id,
    entityName: payment.paymentNumber,
    metadata: { status: 'void', reason: payment.voidReason, amount: payment.amount },
  });

  res.send(payment);
});

const reallocatePayment = catchAsync(async (req, res) => {
  const payment = await supplierPaymentService.reallocatePayment(req.params.paymentId, req.body, req.user);

  await auditLogService.recordAuditLog({
    req,
    action: 'update',
    module: 'SupplierPayment',
    entityId: payment._id,
    entityName: payment.paymentNumber,
    metadata: { allocations: payment.allocations.map((allocation) => `${allocation.invoiceNumber}:${allocation.amount}`) },
  });

  res.send(payment);
});

module.exports = {
  getOpenInvoices,
  getSupplierAccountSummary,
  getSupplierReconciliation,
  repairAllocations,
  previewAllocation,
  createPayment,
  getPayments,
  getPayment,
  getPaymentsForPurchase,
  applyCredit,
  voidPayment,
  reallocatePayment,
};
