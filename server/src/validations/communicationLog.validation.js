const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createLog = {
  body: Joi.object().keys({
    relatedType: Joi.string().valid('Customer', 'Supplier', 'Lead').required(),
    relatedId: Joi.string().custom(objectId).required(),
    type: Joi.string().valid('call', 'whatsapp', 'sms', 'email', 'meeting', 'note', 'visit', 'other').required(),
    direction: Joi.string().valid('outgoing', 'incoming'),
    subject: Joi.string().allow('').max(200),
    notes: Joi.string().required(),
    outcome: Joi.string().valid('positive', 'neutral', 'negative', 'no_answer', 'follow_up_needed'),
    followUpAt: Joi.date(),
    followUpPriority: Joi.string().valid('low', 'medium', 'high', 'urgent'),
  }),
};

const getLogs = {
  query: Joi.object().keys({
    relatedType: Joi.string().valid('Customer', 'Supplier', 'Lead'),
    relatedId: Joi.string().custom(objectId),
    type: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getLog = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

const updateLog = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    subject: Joi.string().allow('').max(200),
    notes: Joi.string(),
    outcome: Joi.string().valid('positive', 'neutral', 'negative', 'no_answer', 'follow_up_needed'),
    direction: Joi.string().valid('outgoing', 'incoming'),
  }),
};

const deleteLog = {
  params: Joi.object().keys({
    id: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createLog,
  getLogs,
  getLog,
  updateLog,
  deleteLog,
};
