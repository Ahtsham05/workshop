const Joi = require('joi');

// SMS has no practical upper bound on message length, but every 153 characters is another
// billed segment — 1600 chars (~11 segments) is a generous ceiling that still catches a
// pasted document going out to the whole school by accident.
const messageBody = Joi.string().max(1600);
const feeStatus = Joi.string().valid('pending_overdue', 'pending', 'overdue', 'unpaid', 'partial', 'paid');

const sendMessage = {
  body: Joi.object().keys({
    phone: Joi.string().max(30).required(),
    message: messageBody.required(),
  }),
};

const sendBulk = {
  body: Joi.object().keys({
    studentIds: Joi.array().items(Joi.string()).min(1).required(),
    message: messageBody.required(),
  }),
};

const createTemplate = {
  body: Joi.object().keys({
    title: Joi.string().max(80).required(),
    body: messageBody.required(),
    context: Joi.string().valid('broadcast', 'fee_alert'),
  }),
};

const sendToClass = {
  body: Joi.object().keys({
    classId: Joi.string().required(),
    message: messageBody.required(),
  }),
};

const sendToAll = {
  body: Joi.object().keys({
    message: messageBody.required(),
    classId: Joi.string().allow('', null),
  }),
};

const feeAlerts = {
  body: Joi.object().keys({
    studentIds: Joi.array().items(Joi.string()),
    classId: Joi.string().allow('', null),
    message: messageBody.allow(''),
    feeStatus,
  }),
};

module.exports = {
  sendMessage,
  sendBulk,
  createTemplate,
  sendToClass,
  sendToAll,
  feeAlerts,
};
