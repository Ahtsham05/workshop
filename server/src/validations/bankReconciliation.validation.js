const Joi = require('joi');
const { objectId } = require('./custom.validation');

const getSummary = {
  params: Joi.object().keys({
    walletId: Joi.string().custom(objectId).required(),
  }),
};

const getUnreconciled = {
  params: Joi.object().keys({
    walletId: Joi.string().custom(objectId).required(),
  }),
  query: Joi.object().keys({
    startDate: Joi.date(),
    endDate: Joi.date(),
  }),
};

const statementLine = Joi.object().keys({
  date: Joi.date().required(),
  description: Joi.string().trim().allow('').optional(),
  amount: Joi.number().required(),
  direction: Joi.string().valid('in', 'out').required(),
});

const matchStatement = {
  params: Joi.object().keys({
    walletId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    statementLines: Joi.array().items(statementLine).min(1).required(),
    dateToleranceDays: Joi.number().integer().min(0).max(31).optional(),
  }),
};

const confirmReconciliation = {
  params: Joi.object().keys({
    walletId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    walletEntryIds: Joi.array().items(Joi.string().custom(objectId)).min(1).required(),
    statementStartDate: Joi.date().optional(),
    statementEndDate: Joi.date().required(),
    statementClosingBalance: Joi.number().required(),
  }),
};

const unreconcileEntry = {
  params: Joi.object().keys({
    walletEntryId: Joi.string().custom(objectId).required(),
  }),
};

const getHistory = {
  params: Joi.object().keys({
    walletId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  getSummary,
  getUnreconciled,
  matchStatement,
  confirmReconciliation,
  unreconcileEntry,
  getHistory,
};
