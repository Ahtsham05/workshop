const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { reminderService } = require('../services');

const getScope = (req) => ({
  organizationId: req.organizationId || req.user.organizationId,
  branchId: req.branchId,
  userId: req.user.id,
});

const createReminder = catchAsync(async (req, res) => {
  const reminder = await reminderService.createReminder(req.body, getScope(req));
  res.status(httpStatus.CREATED).send(reminder);
});

const getReminders = catchAsync(async (req, res) => {
  const result = await reminderService.listReminders(req.query, getScope(req));
  res.send(result);
});

const getReminder = catchAsync(async (req, res) => {
  const reminder = await reminderService.getReminder(req.params.id, getScope(req));
  res.send(reminder);
});

const updateReminder = catchAsync(async (req, res) => {
  const reminder = await reminderService.updateReminder(req.params.id, req.body, getScope(req));
  res.send(reminder);
});

const completeReminder = catchAsync(async (req, res) => {
  const reminder = await reminderService.markComplete(req.params.id, getScope(req));
  res.send(reminder);
});

const snoozeReminder = catchAsync(async (req, res) => {
  const reminder = await reminderService.snooze(req.params.id, req.body.snoozedUntil, getScope(req));
  res.send(reminder);
});

const deleteReminder = catchAsync(async (req, res) => {
  await reminderService.deleteReminder(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createReminder,
  getReminders,
  getReminder,
  updateReminder,
  completeReminder,
  snoozeReminder,
  deleteReminder,
};
