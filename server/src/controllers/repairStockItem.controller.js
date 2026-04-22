const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { repairStockItemService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

// POST /repair-stock  — buy parts (debit)
const createPurchase = catchAsync(async (req, res) => {
  const entry = await repairStockItemService.createPurchaseEntry({
    ...req.body,
    ...getBranchContext(req),
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  res.status(httpStatus.CREATED).send(entry);
});

// POST /repair-stock/use  — parts used in a repair (credit)
const createUsage = catchAsync(async (req, res) => {
  const entry = await repairStockItemService.createUsageEntry({
    ...req.body,
    ...getBranchContext(req),
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  res.status(httpStatus.CREATED).send(entry);
});

// GET /repair-stock  — paginated ledger
const getLedger = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'startDate', 'endDate']);
  const result = await repairStockItemService.getLedger(filter, options);
  res.send(result);
});

// GET /repair-stock/summary  — debit / credit / balance totals
const getLedgerSummary = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  const summary = await repairStockItemService.getLedgerSummary(filter);
  res.send(summary);
});

// DELETE /repair-stock/:itemId
const deleteEntry = catchAsync(async (req, res) => {
  await repairStockItemService.deleteEntry(req.params.itemId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createPurchase,
  createUsage,
  getLedger,
  getLedgerSummary,
  deleteEntry,
};
