const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { personalLedgerService } = require('../services');
const pick = require('../utils/pick');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const createEntry = catchAsync(async (req, res) => {
  const entry = await personalLedgerService.createEntry({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(entry);
});

const getEntries = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['transactionType', 'category']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'startDate', 'endDate']);
  const result = await personalLedgerService.queryEntries(filter, options);
  res.send(result);
});

const getEntry = catchAsync(async (req, res) => {
  const entry = await personalLedgerService.getEntryById(req.params.entryId);
  if (!entry) {
    return res.status(httpStatus.NOT_FOUND).send({ message: 'Entry not found' });
  }
  res.send(entry);
});

const getBalance = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const balance = await personalLedgerService.getCurrentBalance(organizationId, branchId);
  res.send({ balance });
});

const getSummary = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const summary = await personalLedgerService.getSummary(organizationId, branchId);
  res.send(summary);
});

const updateEntry = catchAsync(async (req, res) => {
  const entry = await personalLedgerService.updateEntry(req.params.entryId, req.body);
  res.send(entry);
});

const deleteEntry = catchAsync(async (req, res) => {
  await personalLedgerService.deleteEntry(req.params.entryId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createEntry,
  getEntries,
  getEntry,
  getBalance,
  getSummary,
  updateEntry,
  deleteEntry,
};
