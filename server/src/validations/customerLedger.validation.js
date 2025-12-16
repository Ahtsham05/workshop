const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createLedgerEntry = {
  body: Joi.object().keys({
    customer: Joi.string().custom(objectId).required(),
    transactionType: Joi.string().required().valid(
      'sale',
      'payment_received',
      'payment_made',
      'purchase',
      'refund',
      'credit_note',
      'debit_note',
      'adjustment',
      'opening_balance'
    ),
    transactionDate: Joi.date().required(),
    reference: Joi.string(),
    referenceId: Joi.string().custom(objectId),
    description: Joi.string().required(),
    debit: Joi.number().min(0).default(0),
    credit: Joi.number().min(0).default(0),
    paymentMethod: Joi.string().valid('Cash', 'Bank Transfer', 'Card', 'Cheque', 'Credit'),
    notes: Joi.string().allow(''),
  }),
};

const getLedgerEntries = {
  query: Joi.object().keys({
    customer: Joi.string().custom(objectId),
    transactionType: Joi.string(),
    search: Joi.string(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getLedgerEntry = {
  params: Joi.object().keys({
    entryId: Joi.string().custom(objectId),
  }),
};

const getCustomerBalance = {
  params: Joi.object().keys({
    customerId: Joi.string().custom(objectId),
  }),
};

const updateLedgerEntry = {
  params: Joi.object().keys({
    entryId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      transactionDate: Joi.date(),
      reference: Joi.string(),
      description: Joi.string(),
      paymentMethod: Joi.string().valid('Cash', 'Bank Transfer', 'Card', 'Cheque', 'Credit'),
      notes: Joi.string().allow(''),
    })
    .min(1),
};

const deleteLedgerEntry = {
  params: Joi.object().keys({
    entryId: Joi.string().custom(objectId),
  }),
};

module.exports = {
  createLedgerEntry,
  getLedgerEntries,
  getLedgerEntry,
  getCustomerBalance,
  updateLedgerEntry,
  deleteLedgerEntry,
};
