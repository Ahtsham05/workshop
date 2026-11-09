const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createExpense = {
  body: Joi.object().keys({
    category: Joi.string().required(),
    description: Joi.string().required(),
    amount: Joi.number().min(0).required(),
    paymentMethod: Joi.string().valid('Cash', 'Bank Transfer', 'Card', 'Cheque', 'Wallet'),
    walletType: Joi.string().allow(''),
    date: Joi.date(),
    vendor: Joi.string(),
    reference: Joi.string(),
    notes: Joi.string().allow(''),
  }),
};

const getExpenses = {
  query: Joi.object().keys({
    category: Joi.string(),
    paymentMethod: Joi.string(),
    referenceId: Joi.string().custom(objectId),
    referenceModel: Joi.string(),
    voucherNumber: Joi.string(),
    isPaid: Joi.boolean(),
    expenseNature: Joi.string().valid('direct', 'indirect'),
    search: Joi.string(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getExpense = {
  params: Joi.object().keys({
    expenseId: Joi.string().custom(objectId),
  }),
};

const updateExpense = {
  params: Joi.object().keys({
    expenseId: Joi.required().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      category: Joi.string(),
      description: Joi.string(),
      amount: Joi.number().min(0),
      paymentMethod: Joi.string().valid('Cash', 'Bank Transfer', 'Card', 'Cheque', 'Wallet'),
      walletType: Joi.string().allow(''),
      date: Joi.date(),
      vendor: Joi.string(),
      reference: Joi.string(),
      notes: Joi.string().allow(''),
    })
    .min(1),
};

const deleteExpense = {
  params: Joi.object().keys({
    expenseId: Joi.string().custom(objectId),
  }),
};

const payExpense = {
  params: Joi.object().keys({
    expenseId: Joi.required().custom(objectId),
  }),
};

const payExpensesBulk = {
  body: Joi.object()
    .keys({
      category: Joi.string(),
      referenceId: Joi.string().custom(objectId),
      referenceModel: Joi.string(),
      all: Joi.boolean(),
    })
    .or('category', 'referenceId', 'all'),
};

// Shape only — row content is checked per row in expense.service.js#bulkImportExpenses,
// so one bad row is reported on its own instead of rejecting the whole file.
const bulkImportExpenses = {
  body: Joi.object().keys({
    duplicateStrategy: Joi.string().valid('skip', 'error', 'allow'),
    createMissingCategories: Joi.boolean(),
    paymentStatus: Joi.string().valid('paid', 'unpaid'),
    expenses: Joi.array().min(1).max(1000).items(Joi.object().unknown(true)).required(),
  }),
};

// Shape only; every line is checked in expense.service.js#createExpenseVoucher, which
// names the line at fault instead of a generic Joi path.
const createExpenseVoucher = {
  body: Joi.object().keys({
    date: Joi.alternatives().try(Joi.date(), Joi.string()),
    paymentMethod: Joi.string().valid('Cash', 'Bank Transfer', 'Card', 'Cheque', 'Wallet'),
    walletType: Joi.string().allow(''),
    reference: Joi.string().allow(''),
    notes: Joi.string().allow(''),
    isPaid: Joi.boolean(),
    lines: Joi.array().min(1).max(200).items(Joi.object().unknown(true)).required(),
  }),
};

const getExpenseSummary = {
  query: Joi.object().keys({
    startDate: Joi.date(),
    endDate: Joi.date(),
  }),
};

module.exports = {
  createExpense,
  getExpenses,
  getExpense,
  updateExpense,
  deleteExpense,
  payExpense,
  payExpensesBulk,
  getExpenseSummary,
  bulkImportExpenses,
  createExpenseVoucher,
};
