const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { employeeLedgerService } = require('../services');
const { Employee } = require('../models');
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

const updateLedgerEntry = catchAsync(async (req, res) => {
  const entry = await employeeLedgerService.updateLedgerEntryById(req.params.ledgerId, req.body);
  res.send(entry);
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
  const tenantFilter = {};
  if (filter.organizationId) tenantFilter.organizationId = filter.organizationId;
  if (filter.branchId) tenantFilter.branchId = filter.branchId;

  if (!filter.employee) {
    const employees = await Employee.find(tenantFilter).select('_id');
    filter.employee = { $in: employees.map((emp) => emp._id) };
  }

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

const deleteLedgerEntry = catchAsync(async (req, res) => {
  await employeeLedgerService.deleteLedgerEntryById(req.params.ledgerId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createAdvancePayment,
  updateLedgerEntry,
  payEmployee,
  getLedgerEntries,
  getEmployeeLedgerSummary,
  getEmployeesWithBalances,
  deleteLedgerEntry,
};
