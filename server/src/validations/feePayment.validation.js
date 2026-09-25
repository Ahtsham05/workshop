const Joi = require('joi');
const { objectId } = require('./custom.validation');

const getReceipts = {
  query: Joi.object().keys({
    studentId: Joi.string().custom(objectId),
    status: Joi.string().valid('completed', 'cancelled'),
    paymentMethod: Joi.string().valid('cash', 'bank_transfer', 'cheque', 'online', 'other', 'credit_wallet'),
    collectedBy: Joi.string().custom(objectId),
    startDate: Joi.date(),
    endDate: Joi.date(),
    search: Joi.string().allow(''),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getReceipt = {
  params: Joi.object().keys({
    feePaymentId: Joi.string().custom(objectId).required(),
  }),
};

const cancelReceipt = {
  params: Joi.object().keys({
    feePaymentId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    reason: Joi.string().allow('', null),
  }),
};

module.exports = {
  getReceipts,
  getReceipt,
  cancelReceipt,
};
