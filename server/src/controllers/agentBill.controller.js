const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { agentBillService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const createAgentBillsBatch = catchAsync(async (req, res) => {
  const bills = await agentBillService.createAgentBillsBatch({
    ...req.body,
    ...getBranchContext(req),
    createdBy: req.user.id,
  });
  res.status(httpStatus.CREATED).send(bills);
});

const getAgentBills = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'startDate', 'endDate']);
  const result = await agentBillService.getAgentBills(filter, options);
  res.send(result);
});

const updateAgentBill = catchAsync(async (req, res) => {
  const bill = await agentBillService.updateAgentBillById(req.params.id, req.body);
  res.send(bill);
});

const deleteAgentBill = catchAsync(async (req, res) => {
  await agentBillService.deleteAgentBillById(req.params.id);
  res.status(httpStatus.NO_CONTENT).send();
});

const getAgentBillReport = catchAsync(async (req, res) => {
  const { startDate, endDate, companyId } = req.query;
  const report = await agentBillService.getAgentBillReport({
    organizationId: req.organizationId,
    branchId: req.branchId,
    startDate,
    endDate,
    companyId,
  });
  res.send(report);
});

module.exports = { createAgentBillsBatch, getAgentBills, updateAgentBill, deleteAgentBill, getAgentBillReport };
