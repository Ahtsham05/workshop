const Joi = require('joi');
const { objectId } = require('./custom.validation');

const period = {
  startDate: Joi.string().trim().allow(''),
  endDate: Joi.string().trim().allow(''),
};

const getRanking = {
  query: Joi.object({
    ...period,
    search: Joi.string().trim().allow('').max(100),
    sort: Joi.string().valid(
      'netProfit',
      'netRevenue',
      'margin',
      'invoices',
      'ledgerDiscount',
      'grossProfit',
      'growth',
      'lastSaleAt',
      'avgProfitPerInvoice'
    ),
    order: Joi.string().valid('asc', 'desc'),
    filter: Joi.string().valid('all', 'loss', 'discounted'),
  }),
};

const getCustomerDetail = {
  params: Joi.object({ customerId: Joi.string().custom(objectId).required() }),
  query: Joi.object(period),
};

module.exports = { getRanking, getCustomerDetail };
