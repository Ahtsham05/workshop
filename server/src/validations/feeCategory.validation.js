const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createCategory = {
  body: Joi.object().keys({
    name: Joi.string().required().trim(),
    type: Joi.string().valid('INCOME', 'EXPENSE').required(),
    description: Joi.string().allow('', null),
    color: Joi.string().allow('', null),
    isActive: Joi.boolean(),
  }),
};

const createCategoriesBulk = {
  body: Joi.object().keys({
    categories: Joi.array()
      .items(
        Joi.object().keys({
          name: Joi.string().required().trim(),
          type: Joi.string().valid('INCOME', 'EXPENSE').required(),
          description: Joi.string().allow('', null),
          color: Joi.string().allow('', null),
        })
      )
      .min(1)
      .required(),
  }),
};

const getCategories = {
  query: Joi.object().keys({
    type: Joi.string().valid('INCOME', 'EXPENSE'),
    isActive: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getCategory = {
  params: Joi.object().keys({
    categoryId: Joi.string().custom(objectId).required(),
  }),
};

const updateCategory = {
  params: Joi.object().keys({
    categoryId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string().trim(),
      type: Joi.string().valid('INCOME', 'EXPENSE'),
      description: Joi.string().allow('', null),
      color: Joi.string().allow('', null),
      isActive: Joi.boolean(),
    })
    .min(1),
};

const deleteCategory = {
  params: Joi.object().keys({
    categoryId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = { createCategory, createCategoriesBulk, getCategories, getCategory, updateCategory, deleteCategory };
