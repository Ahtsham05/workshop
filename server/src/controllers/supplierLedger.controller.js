const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { supplierLedgerService } = require('../services');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const ApiError = require('../utils/ApiError');
const { userHasAnyPermission } = require('../middlewares/permission');

/** Giving a ledger discount is its own permission; going over the limit is another. */
const resolveDiscountRights = async (req) => {
  const wantsDiscount =
    req.body.transactionType === 'discount_received' || Number(req.body.settlementDiscount?.amount) > 0;
  if (!wantsDiscount) return {};
  if (!(await userHasAnyPermission(req.user, ['giveLedgerDiscount']))) {
    throw new ApiError(httpStatus.FORBIDDEN, 'You do not have permission to give ledger discounts');
  }
  return { canApproveDiscount: await userHasAnyPermission(req.user, ['approveLedgerDiscount']) };
};

const createLedgerEntry = catchAsync(async (req, res) => {
  const discountRights = await resolveDiscountRights(req);
  const entry = await supplierLedgerService.createLedgerEntry(
    { ...req.body, ...getBranchContext(req) },
    { user: req.user, ...discountRights }
  );
  // A "Cash Paid" row settles the supplier's open invoices (see
  // supplierPayment.service.js's recordAllocationForLedgerEntry). Hand that result back so
  // the form can say which invoices it just cleared instead of leaving the user to guess.
  const invoiceAllocation = entry.$locals?.invoiceAllocation;
  // The discount posted together with a payment (its own ledger row) rides back too, so the
  // receipt can show "received + discount = settled".
  const { discountEntry, discountAllocation } = entry.$locals || {};
  const extras = {
    ...(invoiceAllocation ? { invoiceAllocation } : {}),
    ...(discountEntry ? { discountEntry } : {}),
    ...(discountAllocation ? { discountAllocation } : {}),
  };
  res.status(httpStatus.CREATED).send(Object.keys(extras).length ? { ...entry.toJSON(), ...extras } : entry);
});

const getLedgerEntries = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['supplier', 'transactionType']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'startDate', 'endDate']);
  const result = await supplierLedgerService.queryLedgerEntries(filter, options);
  res.send(result);
});

const getLedgerEntry = catchAsync(async (req, res) => {
  const entry = await supplierLedgerService.getLedgerEntryById(req.params.entryId);
  if (!entry) {
    return res.status(httpStatus.NOT_FOUND).send({ message: 'Ledger entry not found' });
  }
  res.send(entry);
});

const getSupplierBalance = catchAsync(async (req, res) => {
  // Tenant check: the id comes from the URL, so make sure it is this organization's supplier.
  // eslint-disable-next-line global-require
  const { Supplier } = require('../models');
  const owned = await Supplier.exists({ _id: req.params.supplierId, organizationId: req.organizationId });
  if (!owned) throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
  const balance = await supplierLedgerService.getSupplierBalance(req.params.supplierId);
  res.send({ balance });
});

const getBalanceBeforeReference = catchAsync(async (req, res) => {
  const balanceBefore = await supplierLedgerService.getBalanceBeforeReference(
    req.params.supplierId,
    req.params.referenceId,
  );
  res.send({ balanceBefore });
});

const getSupplierLedgerSummary = catchAsync(async (req, res) => {
  const summary = await supplierLedgerService.getSupplierLedgerSummary(req.params.supplierId);
  res.send(summary);
});

const updateLedgerEntry = catchAsync(async (req, res) => {
  const entry = await supplierLedgerService.updateLedgerEntry(req.params.entryId, req.body);
  res.send(entry);
});

const deleteLedgerEntry = catchAsync(async (req, res) => {
  await supplierLedgerService.deleteLedgerEntry(req.params.entryId);
  res.status(httpStatus.NO_CONTENT).send();
});

const getAllSuppliersWithBalances = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  const suppliers = await supplierLedgerService.getAllSuppliersWithBalances(filter);
  res.send(suppliers);
});

/** { id: balance } for many suppliers at once — tenant-scoped, one query. */
const getSupplierBalances = catchAsync(async (req, res) => {
  // eslint-disable-next-line global-require
  const { Supplier } = require('../models');
  const ids = [...new Set(String(req.query.ids).split(','))];
  const docs = await Supplier.find({ _id: { $in: ids }, organizationId: req.organizationId }).select('balance').lean();
  res.send({ balances: Object.fromEntries(docs.map((d) => [String(d._id), Number(d.balance) || 0])) });
});

module.exports = {
  getSupplierBalances,
  createLedgerEntry,
  getLedgerEntries,
  getLedgerEntry,
  getSupplierBalance,
  getBalanceBeforeReference,
  getSupplierLedgerSummary,
  updateLedgerEntry,
  deleteLedgerEntry,
  getAllSuppliersWithBalances,
};
