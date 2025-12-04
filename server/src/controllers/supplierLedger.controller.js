const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { supplierLedgerService } = require('../services');
const pick = require('../utils/pick');

const createLedgerEntry = catchAsync(async (req, res) => {
  const entry = await supplierLedgerService.createLedgerEntry(req.body);
  res.status(httpStatus.CREATED).send(entry);
});

const getLedgerEntries = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['supplier', 'transactionType']);
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
  const balance = await supplierLedgerService.getSupplierBalance(req.params.supplierId);
  res.send({ balance });
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
  const suppliers = await supplierLedgerService.getAllSuppliersWithBalances();
  res.send(suppliers);
});

module.exports = {
  createLedgerEntry,
  getLedgerEntries,
  getLedgerEntry,
  getSupplierBalance,
  getSupplierLedgerSummary,
  updateLedgerEntry,
  deleteLedgerEntry,
  getAllSuppliersWithBalances,
};
