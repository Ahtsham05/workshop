const Joi = require('joi');
const { objectId } = require('./custom.validation');

const feeItemSchema = Joi.object().keys({
  name: Joi.string().required().trim(),
  amount: Joi.number().min(0).required(),
  categoryId: Joi.string().custom(objectId).allow(null, ''),
});

const createFeeStructure = {
  body: Joi.object().keys({
    classId: Joi.string().custom(objectId).required(),
    name: Joi.string().trim(),
    academicYear: Joi.string().allow('', null),
    feeItems: Joi.array().items(feeItemSchema).min(1).required(),
    frequency: Joi.string().valid('monthly', 'quarterly', 'annually', 'one-time'),
    dueDay: Joi.number().integer().min(1).max(31),
    isActive: Joi.boolean(),
  }),
};

const getFeeStructures = {
  query: Joi.object().keys({
    classId: Joi.string().custom(objectId),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getFeeStructure = {
  params: Joi.object().keys({
    structureId: Joi.string().custom(objectId).required(),
  }),
};

const updateFeeStructure = {
  params: Joi.object().keys({
    structureId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      classId: Joi.string().custom(objectId),
      name: Joi.string().trim(),
      academicYear: Joi.string().allow('', null),
      feeItems: Joi.array().items(feeItemSchema).min(1),
      frequency: Joi.string().valid('monthly', 'quarterly', 'annually', 'one-time'),
      dueDay: Joi.number().integer().min(1).max(31),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteFeeStructure = {
  params: Joi.object().keys({
    structureId: Joi.string().custom(objectId).required(),
  }),
};

const getFeeStructureByClass = {
  params: Joi.object().keys({
    classId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createFeeStructure,
  getFeeStructures,
  getFeeStructure,
  updateFeeStructure,
  deleteFeeStructure,
  getFeeStructureByClass,
};
