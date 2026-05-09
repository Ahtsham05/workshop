const Joi = require('joi');

const createCategory = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    nameUrdu: Joi.string().allow('').optional(),
    image: Joi.object().keys({
      url: Joi.string(),
      publicId: Joi.string(),
    }).optional(),
  }),
};

const getCategories = {
  query: Joi.object().keys({
    name: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getAllCategories = {
  query: Joi.object().keys({
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getCategory = {
  params: Joi.object().keys({
    categoryId: Joi.string(),
  }),
};

const updateCategory = {
  params: Joi.object().keys({
    categoryId: Joi.string(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      nameUrdu: Joi.string().allow('').optional(),
      image: Joi.object().keys({
        url: Joi.string(),
        publicId: Joi.string(),
      }).optional(),
    })
    .min(1),
};

const deleteCategory = {
  params: Joi.object().keys({
    categoryId: Joi.string(),
  }),
};

const fetchImageFromSearch = {
  body: Joi.object().keys({
    query: Joi.string().trim().min(2).max(200).required(),
  }),
};

module.exports = {
  createCategory,
  getCategories,
  getAllCategories,
  getCategory,
  updateCategory,
  deleteCategory,
  fetchImageFromSearch,
};
