const Joi = require('joi');

const { objectId } = require('./custom.validation');

const createCashWithdrawal = {
  body: Joi.object().keys({
    walletId: Joi.string().required(),
    walletType: Joi.string().trim().required(),
    amount: Joi.number().min(0.01).required(),
    customerId: Joi.string().custom(objectId),
    cashAmount: Joi.number().min(0),
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

const updateCashWithdrawal = {
  params: Joi.object().keys({
    withdrawalId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object().keys({
    walletId: Joi.string(),
    walletType: Joi.string().trim(),
    amount: Joi.number().min(0.01),
    customerId: Joi.alternatives().try(Joi.string().custom(objectId), Joi.valid(null), Joi.valid('')),
    cashAmount: Joi.number().min(0),
    transactionType: Joi.string().valid('withdrawal', 'deposit'),
    customerName: Joi.string().trim().allow(''),
    customerNumber: Joi.string().trim().allow(''),
    commissionRate: Joi.number().min(0).max(100),
    extraCharge: Joi.number().min(0),
    notes: Joi.string().allow(''),
    date: Joi.date(),
  }).min(1),
};

const deleteCashWithdrawal = {
  params: Joi.object().keys({
    withdrawalId: Joi.string().custom(objectId).required(),
  }),
};

const createCashWithdrawalsBatch = {
  body: Joi.object().keys({
    walletId: Joi.string().required(),
    walletType: Joi.string().trim().required(),
    transactionType: Joi.string().valid('withdrawal', 'deposit').default('withdrawal'),
    commissionRate: Joi.number().min(0).max(100).default(0),
    date: Joi.date().default(() => new Date()),
    entries: Joi.array()
      .items(
        Joi.object().keys({
          amount: Joi.number().min(0.01).required(),
          customerId: Joi.string().custom(objectId),
          cashAmount: Joi.number().min(0),
          customerName: Joi.string().trim().allow(''),
          customerNumber: Joi.string().trim().allow(''),
          extraCharge: Joi.number().min(0).default(0),
          notes: Joi.string().allow(''),
        })
      )
      .min(1)
      .required(),
  }),
};

const deleteCashWithdrawalsBatch = {
  body: Joi.object().keys({
    ids: Joi.array().items(Joi.string().custom(objectId)).min(1).required(),
  }),
};

module.exports = {
  createCashWithdrawal,
  createCashWithdrawalsBatch,
  getCashWithdrawals,
  updateCashWithdrawal,
  deleteCashWithdrawal,
  deleteCashWithdrawalsBatch,
};
