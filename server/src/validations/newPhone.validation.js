const Joi = require('joi');

const getStats = {
  query: Joi.object().keys({
    dateFrom: Joi.date(),
    dateTo: Joi.date(),
  }),
};

module.exports = { getStats };
