const Joi = require('joi');

const LEVELS = ['COUNTRY', 'STATE', 'COUNTY', 'CITY', 'DISTRICT', 'CUSTOM'];

const createTaxJurisdiction = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    level: Joi.string().valid(...LEVELS).required(),
    countryCode: Joi.string().allow('').optional(),
    code: Joi.string().allow('').optional(),
    parentJurisdictionId: Joi.string().allow(null).optional(),
    status: Joi.string().valid('active', 'inactive').optional(),
  }),
};

const getTaxJurisdictions = {
  query: Joi.object().keys({
    name: Joi.string(),
    level: Joi.string().valid(...LEVELS),
    countryCode: Joi.string(),
    parentJurisdictionId: Joi.string(),
    status: Joi.string().valid('active', 'inactive'),
    sortBy: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getTaxJurisdiction = {
  params: Joi.object().keys({
    taxJurisdictionId: Joi.string().required(),
  }),
};

const updateTaxJurisdiction = {
  params: Joi.object().keys({
    taxJurisdictionId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      level: Joi.string().valid(...LEVELS),
      countryCode: Joi.string().allow(''),
      code: Joi.string().allow(''),
      parentJurisdictionId: Joi.string().allow(null),
      status: Joi.string().valid('active', 'inactive'),
    })
    .min(1),
};

const deleteTaxJurisdiction = {
  params: Joi.object().keys({
    taxJurisdictionId: Joi.string().required(),
  }),
};

module.exports = {
  createTaxJurisdiction,
  getTaxJurisdictions,
  getTaxJurisdiction,
  updateTaxJurisdiction,
  deleteTaxJurisdiction,
};
