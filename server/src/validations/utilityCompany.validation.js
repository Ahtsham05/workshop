const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createUtilityCompany = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    billType: Joi.string().valid('electricity', 'gas', 'water', 'internet', 'other').required(),
    defaultServiceCharge: Joi.number().min(0).required(),
    isActive: Joi.boolean(),
  }),
};

const getUtilityCompanies = {
  query: Joi.object().keys({
    billType: Joi.string().valid('electricity', 'gas', 'water', 'internet', 'other'),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const updateUtilityCompany = {
  params: Joi.object().keys({
    companyId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      billType: Joi.string().valid('electricity', 'gas', 'water', 'internet', 'other'),
      defaultServiceCharge: Joi.number().min(0),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteUtilityCompany = {
  params: Joi.object().keys({
    companyId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createUtilityCompany,
  getUtilityCompanies,
  updateUtilityCompany,
  deleteUtilityCompany,
};
