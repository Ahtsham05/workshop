const Joi = require('joi');

const createTaxCategory = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    code: Joi.string().allow('').optional(),
    description: Joi.string().allow('').optional(),
    isDefault: Joi.boolean().optional(),
    status: Joi.string().valid('active', 'inactive').optional(),
  }),
};

const getTaxCategories = {
  query: Joi.object().keys({
    name: Joi.string(),
    code: Joi.string(),
    isDefault: Joi.boolean(),
    status: Joi.string().valid('active', 'inactive'),
    sortBy: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getTaxCategory = {
  params: Joi.object().keys({
    taxCategoryId: Joi.string().required(),
  }),
};

const updateTaxCategory = {
  params: Joi.object().keys({
    taxCategoryId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      code: Joi.string().allow(''),
      description: Joi.string().allow(''),
      isDefault: Joi.boolean(),
      status: Joi.string().valid('active', 'inactive'),
    })
    .min(1),
};

const deleteTaxCategory = {
  params: Joi.object().keys({
    taxCategoryId: Joi.string().required(),
  }),
};

module.exports = {
  createTaxCategory,
  getTaxCategories,
  getTaxCategory,
  updateTaxCategory,
  deleteTaxCategory,
};
