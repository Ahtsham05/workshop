const catchAsync = require('../utils/catchAsync');
const signupLeadService = require('../services/signupLead.service');

const listOrganizations = catchAsync(async (req, res) => {
  res.send(await signupLeadService.listOrganizations(req.query));
});

const getPipeline = catchAsync(async (req, res) => {
  res.send(await signupLeadService.getPipeline(req.query));
});

const getAlerts = catchAsync(async (req, res) => {
  res.send(await signupLeadService.getAlerts());
});

const acknowledge = catchAsync(async (req, res) => {
  res.send(await signupLeadService.acknowledge(req.body.organizationIds));
});

const getLead = catchAsync(async (req, res) => {
  res.send(await signupLeadService.getLeadDetail(req.params.orgId));
});

const updateLead = catchAsync(async (req, res) => {
  res.send(await signupLeadService.updateLead(req.params.orgId, req.body, req.user));
});

const addActivity = catchAsync(async (req, res) => {
  res.send(await signupLeadService.addActivity(req.params.orgId, req.body, req.user));
});

const setTouchpoint = catchAsync(async (req, res) => {
  res.send(await signupLeadService.setTouchpoint(req.params.orgId, req.params.key, req.body.action, req.user));
});

const snooze = catchAsync(async (req, res) => {
  res.send(await signupLeadService.snoozeFollowUp(req.params.orgId, req.body.minutes, req.user));
});

module.exports = {
  listOrganizations,
  getPipeline,
  getAlerts,
  acknowledge,
  getLead,
  updateLead,
  addActivity,
  setTouchpoint,
  snooze,
};
