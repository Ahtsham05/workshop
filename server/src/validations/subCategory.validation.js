const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createSubCategory = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    nameUrdu: Joi.string().allow('').optional(),
    category: Joi.string().custom(objectId).required(),
    image: Joi.object().keys({
      url: Joi.string(),
      publicId: Joi.string(),
    }).optional(),
  }),
};

const bulkCreateSubCategories = {
  body: Joi.object().keys({
    category: Joi.string().custom(objectId).required(),
    items: Joi.array()
      .items(
        Joi.object().keys({
          name: Joi.string().trim().min(1).required(),
          nameUrdu: Joi.string().allow('').optional(),
        })
      )
      .min(1)
      .required(),
  }),
};

const getSubCategories = {
  query: Joi.object().keys({
    name: Joi.string(),
    category: Joi.string().custom(objectId),
    sortBy: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getAllSubCategories = {
  query: Joi.object().keys({
    search: Joi.string(),
    fieldName: Joi.string(),
    category: Joi.string().custom(objectId),
  }),
};

const getSubCategory = {
  params: Joi.object().keys({
    subCategoryId: Joi.string().custom(objectId),
  }),
};

const updateSubCategory = {
  params: Joi.object().keys({
    subCategoryId: Joi.string().custom(objectId),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      nameUrdu: Joi.string().allow('').optional(),
      category: Joi.string().custom(objectId),
      image: Joi.object().keys({
        url: Joi.string(),
        publicId: Joi.string(),
      }).optional(),
    })
    .min(1),
};

const deleteSubCategory = {
  params: Joi.object().keys({
    subCategoryId: Joi.string().custom(objectId),
  }),
};

const fetchImageFromSearch = {
  body: Joi.object().keys({
    query: Joi.string().trim().min(2).max(200).required(),
  }),
};

module.exports = {
  createSubCategory,
  bulkCreateSubCategories,
  getSubCategories,
  getAllSubCategories,
  getSubCategory,
  updateSubCategory,
  deleteSubCategory,
  fetchImageFromSearch,
};
