const Joi = require('joi');

const createProduct = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    price: Joi.number().required(),
    cost: Joi.number().required(),
    stockQuantity: Joi.number().required(),
    sku: Joi.string().allow('').default(null),
    category: Joi.string().allow('').default(null),
    categories: Joi.array().items(
      Joi.object().keys({
        _id: Joi.string().required(),
        name: Joi.string().required(),
        image: Joi.object().keys({
          url: Joi.string(),
          publicId: Joi.string(),
        }).optional(),
      })
    ).default([]),
    supplier: Joi.string().allow('').default(null),
    description: Joi.string().allow('').optional(),
    barcode: Joi.string().allow('').optional(),
    image: Joi.object().keys({
      url: Joi.string(),
      publicId: Joi.string(),
    }).optional(),
    unit: Joi.string().allow('').optional(),
  }),
};

const getProducts = {
  query: Joi.object().keys({
    name: Joi.string(),
    category: Joi.string(),
    sortBy: Joi.string(),
    limit: Joi.number(),
    page: Joi.number(),
    search: Joi.string(),
    fieldName: Joi.string(),
  }),
};

const getAllProducts = {}

const getProduct = {
  params: Joi.object().keys({
    productId: Joi.string().required(),
  }),
};

const updateProduct = {
  params: Joi.object().keys({
    productId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    _id: Joi.string(),
    name: Joi.string(),
    price: Joi.number(),
    description: Joi.string().allow(''),
    barcode: Joi.string().allow(''),
    cost: Joi.number(),
    stockQuantity: Joi.number(),
    sku: Joi.string().allow(''),
    category: Joi.string().allow(''),
    categories: Joi.array().items(
      Joi.object().keys({
        _id: Joi.string().required(),
        name: Joi.string().required(),
        image: Joi.object().keys({
          url: Joi.string(),
          publicId: Joi.string(),
        }).optional(),
      })
    ),
    supplier: Joi.string().allow(''),
    image: Joi.object().keys({
      url: Joi.string(),
      publicId: Joi.string(),
    }).optional(),
    unit: Joi.string().allow(''),
  }),
};

const deleteProduct = {
  params: Joi.object().keys({
    productId: Joi.string().required(),
  }),
};

const bulkUpdateProducts = {
  body: Joi.object().keys({
    products: Joi.array().items(
      Joi.object().keys({
        id: Joi.string().required(),
        price: Joi.number().optional(),
        cost: Joi.number().optional(),
        stockQuantity: Joi.number().optional(),
      })
    ).required().min(1)
  }),
};

module.exports = {
  createProduct,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  getAllProducts,
  bulkUpdateProducts
};
