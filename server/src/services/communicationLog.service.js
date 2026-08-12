const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const { CommunicationLog, Customer, Supplier, Lead } = require('../models');

const TYPE_LABELS = {
  call: 'call',
  whatsapp: 'WhatsApp message',
  sms: 'SMS',
  email: 'email',
  meeting: 'meeting',
  note: 'note',
  visit: 'visit',
  other: 'interaction',
};

const RELATED_MODELS = { Customer, Supplier, Lead };

const resolveRelatedRecord = async (relatedType, relatedId) => {
  if (!relatedType || !relatedId) return null;
  const Model = RELATED_MODELS[relatedType] || Customer;
  return Model.findById(relatedId).select('name phone whatsapp').lean();
};

const createLog = async (data, { organizationId, branchId, userId }) => {
  if (!data.relatedType || !data.relatedId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'relatedType and relatedId are required');
  }
  if (!data.type) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Interaction type is required');
  }
  if (!data.notes || !String(data.notes).trim()) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Notes are required');
  }

  const log = await CommunicationLog.create({
    organizationId,
    branchId,
    relatedType: data.relatedType,
    relatedId: data.relatedId,
    type: data.type,
    direction: data.direction || 'outgoing',
    subject: data.subject,
    notes: String(data.notes).trim(),
    outcome: data.outcome,
    createdBy: userId,
  });

  if (data.followUpAt) {
    const related = await resolveRelatedRecord(data.relatedType, data.relatedId);
    const relatedName = related?.name || 'this account';

    // Lazy require: reminder.service.js has no reverse dependency on this file,
    // matches the inline-require style notification.service.js uses for cross-service calls.
    const reminderService = require('./reminder.service');
    const reminder = await reminderService.createReminder(
      {
        title: `Follow up: ${TYPE_LABELS[data.type] || 'interaction'} — ${relatedName}`,
        description: data.subject || log.notes,
        relatedType: data.relatedType,
        relatedId: data.relatedId,
        dueAt: data.followUpAt,
        priority: data.followUpPriority || 'medium',
        notifyChannels: ['push'],
        whatsappPhone: related?.whatsapp || related?.phone,
        sourceCommunicationLogId: log._id,
      },
      { organizationId, branchId, userId },
    );

    log.reminderId = reminder._id;
    await log.save();
  }

  return log;
};

const listLogs = async (query, { organizationId, branchId }) => {
  const filter = { organizationId, branchId };
  if (query.relatedType) filter.relatedType = query.relatedType;
  if (query.relatedId) filter.relatedId = query.relatedId;
  if (query.type) filter.type = query.type;

  const options = {
    sortBy: 'createdAt:desc',
    limit: query.limit ? Number(query.limit) : 100,
    page: query.page ? Number(query.page) : 1,
    populate: 'createdBy',
  };

  return CommunicationLog.paginate(filter, options);
};

const getLog = async (id, { organizationId }) => {
  const log = await CommunicationLog.findOne({ _id: id, organizationId });
  if (!log) throw new ApiError(httpStatus.NOT_FOUND, 'Communication log entry not found');
  return log;
};

const updateLog = async (id, data, { organizationId, userId }) => {
  const log = await getLog(id, { organizationId });

  const patch = { ...data };
  delete patch.organizationId;
  delete patch.branchId;
  delete patch.relatedType;
  delete patch.relatedId;
  delete patch.createdBy;

  Object.assign(log, patch, { updatedBy: userId });
  await log.save();
  return log;
};

const deleteLog = async (id, { organizationId }) => {
  const log = await getLog(id, { organizationId });
  await log.deleteOne();
};

module.exports = {
  createLog,
  listLogs,
  getLog,
  updateLog,
  deleteLog,
};
