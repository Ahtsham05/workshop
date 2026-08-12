const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { Reminder } = require('../models');

const addInterval = (date, repeat) => {
  const next = new Date(date);
  if (repeat === 'daily') next.setDate(next.getDate() + 1);
  else if (repeat === 'weekly') next.setDate(next.getDate() + 7);
  else if (repeat === 'monthly') next.setMonth(next.getMonth() + 1);
  return next;
};

const createReminder = async (data, { organizationId, branchId, userId }) => {
  if (!data.title || !String(data.title).trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Reminder title is required');
  }
  if (!data.dueAt) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Due date/time is required');
  }

  return Reminder.create({
    organizationId,
    branchId,
    title: String(data.title).trim(),
    description: data.description,
    relatedType: data.relatedType,
    relatedId: data.relatedId,
    dueAt: data.dueAt,
    priority: data.priority || 'medium',
    assignedTo: data.assignedTo || userId,
    createdBy: userId,
    notifyChannels: data.notifyChannels && data.notifyChannels.length ? data.notifyChannels : ['push'],
    whatsappPhone: data.whatsappPhone,
    repeat: data.repeat || 'none',
    sourceCommunicationLogId: data.sourceCommunicationLogId,
  });
};

const listReminders = async (query, { organizationId, branchId }) => {
  const filter = { organizationId, branchId };
  if (query.status) filter.status = query.status;
  if (query.priority) filter.priority = query.priority;
  if (query.assignedTo) filter.assignedTo = query.assignedTo;
  if (query.relatedType) filter.relatedType = query.relatedType;
  if (query.relatedId) filter.relatedId = query.relatedId;
  if (query.search) filter.title = { $regex: query.search, $options: 'i' };
  if (query.from || query.to) {
    filter.dueAt = {};
    if (query.from) filter.dueAt.$gte = new Date(query.from);
    if (query.to) filter.dueAt.$lte = new Date(query.to);
  }

  const options = {
    sortBy: 'dueAt:asc',
    limit: query.limit ? Number(query.limit) : 200,
    page: query.page ? Number(query.page) : 1,
  };

  return Reminder.paginate(filter, options);
};

const getReminder = async (id, { organizationId }) => {
  const reminder = await Reminder.findOne({ _id: id, organizationId });
  if (!reminder) throw new ApiError(httpStatus.NOT_FOUND, 'Reminder not found');
  return reminder;
};

const updateReminder = async (id, data, { organizationId }) => {
  const reminder = await getReminder(id, { organizationId });

  const patch = { ...data };
  delete patch.organizationId;
  delete patch.branchId;
  delete patch.createdBy;

  // Editing the due date on a fired reminder re-arms the alarm.
  if (patch.dueAt) reminder.remindedAt = null;

  Object.assign(reminder, patch);
  await reminder.save();
  return reminder;
};

const markComplete = async (id, { organizationId }) => {
  const reminder = await getReminder(id, { organizationId });
  reminder.status = 'completed';
  reminder.completedAt = new Date();
  await reminder.save();
  return reminder;
};

const snooze = async (id, snoozedUntil, { organizationId }) => {
  if (!snoozedUntil) throw new ApiError(httpStatus.BAD_REQUEST, 'snoozedUntil is required');
  const reminder = await getReminder(id, { organizationId });
  reminder.status = 'snoozed';
  reminder.snoozedUntil = new Date(snoozedUntil);
  reminder.dueAt = new Date(snoozedUntil);
  reminder.remindedAt = null;
  await reminder.save();
  return reminder;
};

const deleteReminder = async (id, { organizationId }) => {
  const reminder = await getReminder(id, { organizationId });
  await reminder.deleteOne();
};

/** Reminders due for the alarm scheduler: pending, past due, not yet reminded (or snoozed and its snooze time passed). */
const getDueReminders = async () => {
  const now = new Date();
  return Reminder.find({
    status: { $in: ['pending', 'snoozed'] },
    dueAt: { $lte: now },
    remindedAt: null,
  });
};

const markReminded = async (id, { advanceRepeat }) => {
  const reminder = await Reminder.findById(id);
  if (!reminder) return null;

  reminder.remindedAt = new Date();

  if (advanceRepeat && reminder.repeat !== 'none') {
    reminder.dueAt = addInterval(reminder.dueAt, reminder.repeat);
    reminder.remindedAt = null;
    reminder.status = 'pending';
  } else {
    reminder.status = 'pending';
  }

  await reminder.save();
  return reminder;
};

module.exports = {
  createReminder,
  listReminders,
  getReminder,
  updateReminder,
  markComplete,
  snooze,
  deleteReminder,
  getDueReminders,
  markReminded,
};
