const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createReminder = {
  body: Joi.object().keys({
    title: Joi.string().required(),
    description: Joi.string().allow(''),
    relatedType: Joi.string().valid('Customer', 'Supplier', 'Lead'),
    relatedId: Joi.string().custom(objectId),
    dueAt: Joi.date().required(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
    assignedTo: Joi.string().custom(objectId),
    notifyChannels: Joi.array().items(Joi.string().valid('push', 'whatsapp')),
    whatsappPhone: Joi.string().allow(''),
    repeat: Joi.string().valid('none', 'daily', 'weekly', 'monthly'),
  }),
};

const getReminders = {
  query: Joi.object().keys({
    status: Joi.string().valid('pending', 'completed', 'snoozed', 'cancelled'),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
    assignedTo: Joi.string().custom(objectId),
    relatedType: Joi.string().valid('Customer', 'Supplier', 'Lead'),
    relatedId: Joi.string().custom(objectId),
    search: Joi.string().allow(''),
    from: Joi.date(),
    to: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getReminder = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

const updateReminder = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    title: Joi.string(),
    description: Joi.string().allow(''),
    relatedType: Joi.string().valid('Customer', 'Supplier', 'Lead').allow(null),
    relatedId: Joi.string().custom(objectId).allow(null),
    dueAt: Joi.date(),
    priority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
    status: Joi.string().valid('pending', 'completed', 'snoozed', 'cancelled'),
    assignedTo: Joi.string().custom(objectId),
    notifyChannels: Joi.array().items(Joi.string().valid('push', 'whatsapp')),
    whatsappPhone: Joi.string().allow(''),
    repeat: Joi.string().valid('none', 'daily', 'weekly', 'monthly'),
  }),
};

const snoozeReminder = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    snoozedUntil: Joi.date().required(),
  }),
};

const deleteReminder = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createReminder,
  getReminders,
  getReminder,
  updateReminder,
  snoozeReminder,
  deleteReminder,
};
