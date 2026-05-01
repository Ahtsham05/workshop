const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { employeeLedgerService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const createAdvancePayment = catchAsync(async (req, res) => {
  const entry = await employeeLedgerService.createAdvancePayment({
    ...req.body,
    ...getBranchContext(req),
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  res.status(httpStatus.CREATED).send(entry);
});

const payEmployee = catchAsync(async (req, res) => {
  const result = await employeeLedgerService.payEmployee({
    ...req.body,
    ...getBranchContext(req),
    createdBy: req.user.id,
    updatedBy: req.user.id,
  });
  res.status(httpStatus.CREATED).send(result);
});

const getLedgerEntries = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['employee', 'transactionType']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'startDate', 'endDate']);
  const result = await employeeLedgerService.queryLedgerEntries(filter, options);
  res.send(result);
});

const getEmployeeLedgerSummary = catchAsync(async (req, res) => {
  const summary = await employeeLedgerService.getEmployeeLedgerSummary(req.params.employeeId, getBranchContext(req));
  res.send(summary);
});

const getEmployeesWithBalances = catchAsync(async (req, res) => {
  const data = await employeeLedgerService.getAllEmployeesWithBalances(getBranchContext(req));
  res.send(data);
});

module.exports = {
  createAdvancePayment,
  payEmployee,
  getLedgerEntries,
  getEmployeeLedgerSummary,
  getEmployeesWithBalances,
};
