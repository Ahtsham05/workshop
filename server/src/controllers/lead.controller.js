const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { leadService } = require('../services');
const { userHasAnyPermission } = require('../middlewares/permission');

const getScope = async (req) => ({
  organizationId: req.organizationId || req.user.organizationId,
  branchId: req.branchId,
  userId: req.user.id,
  canViewAll: await userHasAnyPermission(req.user, ['viewAllLeads']),
});

const createLead = catchAsync(async (req, res) => {
  const lead = await leadService.createLead(req.body, await getScope(req));
  res.status(httpStatus.CREATED).send(lead);
});

const getLeads = catchAsync(async (req, res) => {
  const result = await leadService.listLeads(req.query, await getScope(req));
  res.send(result);
});

const getLead = catchAsync(async (req, res) => {
  const lead = await leadService.getLead(req.params.id, await getScope(req));
  res.send(lead);
});

const updateLead = catchAsync(async (req, res) => {
  const lead = await leadService.updateLead(req.params.id, req.body, await getScope(req));
  res.send(lead);
});

const changeStage = catchAsync(async (req, res) => {
  const lead = await leadService.changeStage(req.params.id, req.body, await getScope(req));
  res.send(lead);
});

const checkDuplicates = catchAsync(async (req, res) => {
  const duplicates = await leadService.checkDuplicates(req.query, await getScope(req), req.query.excludeId);
  res.send({ duplicates });
});

const convertLead = catchAsync(async (req, res) => {
  const result = await leadService.convertLead(req.params.id, req.body, await getScope(req));
  res.send(result);
});

const deleteLead = catchAsync(async (req, res) => {
  await leadService.deleteLead(req.params.id, await getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

const getTimeline = catchAsync(async (req, res) => {
  const result = await leadService.getLeadTimeline(req.params.id, await getScope(req));
  res.send(result);
});

const getStats = catchAsync(async (req, res) => {
  const stats = await leadService.getLeadStats(await getScope(req));
  res.send(stats);
});

const getByCustomer = catchAsync(async (req, res) => {
  const lead = await leadService.getLeadByCustomerId(req.params.customerId, await getScope(req));
  res.send(lead);
});

module.exports = {
  createLead,
  getLeads,
  getLead,
  updateLead,
  changeStage,
  checkDuplicates,
  convertLead,
  deleteLead,
  getTimeline,
  getStats,
  getByCustomer,
};
