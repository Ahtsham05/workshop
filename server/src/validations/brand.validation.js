const Joi = require('joi');

const createBrand = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    description: Joi.string().allow('').optional(),
    logo: Joi.object().keys({
      url: Joi.string(),
      publicId: Joi.string(),
    }).optional(),
    website: Joi.string().allow('').optional(),
    contactPerson: Joi.string().allow('').optional(),
    email: Joi.string().allow('').optional(),
    phone: Joi.string().allow('').optional(),
    country: Joi.string().allow('').optional(),
    status: Joi.string().valid('active', 'inactive').optional(),
  }),
};

const getBrands = {
  query: Joi.object().keys({
    name: Joi.string(),
    status: Joi.string().valid('active', 'inactive'),
    sortBy: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getAllBrands = {
  query: Joi.object().keys({
    search: Joi.string(),
    fieldName: Joi.string(),
    status: Joi.string().valid('active', 'inactive'),
  }),
};

const getBrand = {
  params: Joi.object().keys({
    brandId: Joi.string().required(),
  }),
};

const updateBrand = {
  params: Joi.object().keys({
    brandId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      name: Joi.string(),
      description: Joi.string().allow(''),
      logo: Joi.object().keys({
        url: Joi.string(),
        publicId: Joi.string(),
      }).optional(),
      website: Joi.string().allow(''),
      contactPerson: Joi.string().allow(''),
      email: Joi.string().allow(''),
      phone: Joi.string().allow(''),
      country: Joi.string().allow(''),
      status: Joi.string().valid('active', 'inactive'),
    })
    .min(1),
};

const deleteBrand = {
  params: Joi.object().keys({
    brandId: Joi.string().required(),
  }),
};

const fetchImageFromSearch = {
  body: Joi.object().keys({
    query: Joi.string().trim().min(2).max(200).required(),
  }),
};

module.exports = {
  createBrand,
  getBrands,
  getAllBrands,
  getBrand,
  updateBrand,
  deleteBrand,
  fetchImageFromSearch,
};
