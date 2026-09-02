const Joi = require('joi');
const { CURRENCY_CODES } = require('../config/currencies');

const calculateTax = {
  body: Joi.object().keys({
    customerId: Joi.string().optional(),
    asOfDate: Joi.date().optional(),
    taxInclusive: Joi.boolean().optional(),
    currency: Joi.string().valid(...CURRENCY_CODES).required(),
    lines: Joi.array()
      .items(
        Joi.object().keys({
          lineId: Joi.string().required(),
          amount: Joi.number().min(0).required(),
          taxCategoryId: Joi.string().optional(),
        })
      )
      .min(1)
      .required(),
    jurisdictionIds: Joi.array().items(Joi.string()).optional(),
  }),
};

module.exports = {
  calculateTax,
};
