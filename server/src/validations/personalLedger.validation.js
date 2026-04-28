const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createEntry = {
  body: Joi.object().keys({
    transactionType: Joi.string().required().valid(
      'income',
      'expense',
      'transfer',
      'opening_balance',
      'adjustment'
    ),
    transactionDate: Joi.date().required(),
    description: Joi.string().required(),
    category: Joi.string().allow('', null),
    reference: Joi.string().allow('', null),
    debit: Joi.number().min(0).default(0),
    credit: Joi.number().min(0).default(0),
    paymentMethod: Joi.string().valid('Cash', 'Bank Transfer', 'Card', 'Cheque', 'Other').allow('', null),
    notes: Joi.string().allow('', null),
  }),
};

const getEntries = {
  query: Joi.object().keys({
    transactionType: Joi.string(),
    category: Joi.string(),
    search: Joi.string(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getEntry = {
  params: Joi.object().keys({
    entryId: Joi.string().custom(objectId),
  }),
};

const updateEntry = {
  params: Joi.object().keys({
    entryId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      transactionDate: Joi.date(),
      description: Joi.string(),
      category: Joi.string().allow('', null),
      reference: Joi.string().allow('', null),
      paymentMethod: Joi.string().valid('Cash', 'Bank Transfer', 'Card', 'Cheque', 'Other').allow('', null),
      notes: Joi.string().allow('', null),
    })
    .min(1),
};

const deleteEntry = {
  params: Joi.object().keys({
    entryId: Joi.string().custom(objectId),
  }),
};

module.exports = {
  createEntry,
  getEntries,
  getEntry,
  updateEntry,
  deleteEntry,
};
