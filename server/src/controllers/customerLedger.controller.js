const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { customerLedgerService } = require('../services');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const createLedgerEntry = catchAsync(async (req, res) => {
  const entry = await customerLedgerService.createLedgerEntry(
    { ...req.body, ...getBranchContext(req) },
    { user: req.user }
  );
  // A "Cash Received" row settles the customer's open invoices (see
  // customerPayment.service.js's recordAllocationForLedgerEntry). Hand that result back so
  // the form can say which invoices it just cleared instead of leaving the user to guess.
  // Mirrors supplierLedger.controller.js's identical handling.
  const invoiceAllocation = entry.$locals?.invoiceAllocation;
  res.status(httpStatus.CREATED).send(invoiceAllocation ? { ...entry.toJSON(), invoiceAllocation } : entry);
});

const getLedgerEntries = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['customer', 'transactionType']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'startDate', 'endDate']);
  const result = await customerLedgerService.queryLedgerEntries(filter, options);
  res.send(result);
});

const getLedgerEntry = catchAsync(async (req, res) => {
  const entry = await customerLedgerService.getLedgerEntryById(req.params.entryId);
  if (!entry) {
    return res.status(httpStatus.NOT_FOUND).send({ message: 'Ledger entry not found' });
  }
  res.send(entry);
});

const getCustomerBalance = catchAsync(async (req, res) => {
  const balance = await customerLedgerService.getCustomerBalance(req.params.customerId);
  res.send({ balance });
});

const getBalanceBeforeReference = catchAsync(async (req, res) => {
  const balanceBefore = await customerLedgerService.getBalanceBeforeReference(
    req.params.customerId,
    req.params.referenceId,
  );
  res.send({ balanceBefore });
});

const getCustomerLedgerSummary = catchAsync(async (req, res) => {
  const summary = await customerLedgerService.getCustomerLedgerSummary(req.params.customerId);
  res.send(summary);
});

const updateLedgerEntry = catchAsync(async (req, res) => {
  const entry = await customerLedgerService.updateLedgerEntry(req.params.entryId, req.body);
  res.send(entry);
});

const deleteLedgerEntry = catchAsync(async (req, res) => {
  await customerLedgerService.deleteLedgerEntry(req.params.entryId);
  res.status(httpStatus.NO_CONTENT).send();
});

const getAllCustomersWithBalances = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  const customers = await customerLedgerService.getAllCustomersWithBalances(filter);
  res.send(customers);
});

module.exports = {
  createLedgerEntry,
  getLedgerEntries,
  getLedgerEntry,
  getCustomerBalance,
  getBalanceBeforeReference,
  getCustomerLedgerSummary,
  updateLedgerEntry,
  deleteLedgerEntry,
  getAllCustomersWithBalances,
};
