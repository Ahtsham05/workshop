const Joi = require('joi');
const { objectId } = require('./custom.validation');

const denominationCount = Joi.object({
  value: Joi.number().positive().required(),
  kind: Joi.string().valid('note', 'coin').required(),
  quantity: Joi.number().integer().min(0).required(),
});

const saveRegister = {
  body: Joi.object({
    counts: Joi.array().items(denominationCount).required(),
    notes: Joi.string().allow('', null).trim(),
  }),
};

const getHistory = {
  query: Joi.object({
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(100),
    sortBy: Joi.string(),
  }),
};

const deleteHistoryEntry = {
  params: Joi.object({
    id: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  saveRegister,
  getHistory,
  deleteHistoryEntry,
};
