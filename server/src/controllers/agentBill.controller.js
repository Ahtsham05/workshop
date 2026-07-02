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
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await agentBillService.getAgentBills(filter, options);
  res.send(result);
});

const deleteAgentBill = catchAsync(async (req, res) => {
  await agentBillService.deleteAgentBillById(req.params.id);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = { createAgentBillsBatch, getAgentBills, deleteAgentBill };
