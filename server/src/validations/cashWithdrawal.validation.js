const Joi = require('joi');

const createCashWithdrawal = {
  body: Joi.object().keys({
    walletId: Joi.string().required(),
    walletType: Joi.string().trim().required(),
    amount: Joi.number().min(0.01).required(),
    transactionType: Joi.string().valid('withdrawal', 'deposit').default('withdrawal'),
    customerName: Joi.string().trim().allow(''),
    customerNumber: Joi.string().trim().allow(''),
    commissionRate: Joi.number().min(0).max(100).default(0),
    extraCharge: Joi.number().min(0).default(0),
    notes: Joi.string().allow(''),
    date: Joi.date().default(() => new Date()),
  }),
};

const getCashWithdrawals = {
  query: Joi.object().keys({
    walletType: Joi.string().trim(),
    customerName: Joi.string(),
    startDate: Joi.date(),
    endDate: Joi.date(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

module.exports = {
  createCashWithdrawal,
  getCashWithdrawals,
};
