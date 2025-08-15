const Joi = require('joi');

const createMobileRepair = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    phone: Joi.string(),
    mobileModel: Joi.string(),
    mobileFault: Joi.string(),
    totalAmount: Joi.number(),
    advance: Joi.number(),
  }),
};

const getMobileRepairs = {
  query: Joi.object().keys({
    name: Joi.string(),
    phone: Joi.string(),
    mobileModel: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    search: Joi.string(),
    sortBy: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getMobileRepair = {
  params: Joi.object().keys({
    repairId: Joi.string().required(),
  }),
};

const updateMobileRepair = {
  params: Joi.object().keys({
    repairId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    _id: Joi.string(),
    name: Joi.string(),
    phone: Joi.string(),
    mobileModel: Joi.string(),
    mobileFault: Joi.string(),
    totalAmount: Joi.number(),
    advance: Joi.number(),
  }),
};

const deleteMobileRepair = {
  params: Joi.object().keys({
    repairId: Joi.string().required(),
  }),
};

module.exports = {
  createMobileRepair,
  getMobileRepairs,
  getMobileRepair,
  updateMobileRepair,
  deleteMobileRepair,
};
