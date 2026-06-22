const Joi = require('joi');

const unitConversionSchema = Joi.object().keys({
  fromUnit: Joi.string().required(),
  toUnit: Joi.string().required(),
  factor: Joi.number().positive().required(),
  businessTypes: Joi.array().items(Joi.string()).optional(),
  isActive: Joi.boolean().optional(),
});

const createProduct = {
  body: Joi.object().keys({
    name: Joi.string().required(),
    nameUrdu: Joi.string().allow('').optional(),
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
    trackImei: Joi.boolean().optional(),
    warrantyMonths: Joi.number().integer().min(0).optional(),
    imeis: Joi.array().items(Joi.string().trim()).optional(),
    image: Joi.object().keys({
      url: Joi.string(),
      publicId: Joi.string(),
    }).optional(),
    unit: Joi.string().allow('').optional(),
    unitConversions: Joi.array().items(unitConversionSchema).optional(),
  }),
};

const fetchImageFromSearch = {
  body: Joi.object().keys({
    query: Joi.string().trim().min(2).max(200).required(),
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
    nameUrdu: Joi.string().allow('').optional(),
    price: Joi.number(),
    description: Joi.string().allow(''),
    barcode: Joi.string().allow(''),
    trackImei: Joi.boolean().optional(),
    warrantyMonths: Joi.number().integer().min(0).optional(),
    imeis: Joi.array().items(Joi.string().trim()).optional(),
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
    unitConversions: Joi.array().items(unitConversionSchema),
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

const bulkAddProducts = {
  body: Joi.object().keys({
    products: Joi.array().items(
      Joi.object().keys({
        name: Joi.string().required(),
        nameUrdu: Joi.string().allow('').optional(),
        price: Joi.number().required(),
        cost: Joi.number().required(),
        stockQuantity: Joi.number().required(),
        barcode: Joi.string().allow('', null).optional(),
        description: Joi.string().allow('').optional(),
        category: Joi.string().allow('').optional(),
        categories: Joi.array().items(
          Joi.object().keys({
            _id: Joi.string().required(),
            name: Joi.string().required(),
            image: Joi.object().keys({
              url: Joi.string(),
              publicId: Joi.string(),
            }).optional(),
          })
        ).optional(),
        supplier: Joi.string().allow('', null).optional(),
        unit: Joi.string().allow('').optional(),
        sku: Joi.string().allow('').optional(),
        lowStockThreshold: Joi.number().optional(),
        unitConversions: Joi.array().items(unitConversionSchema).optional(),
      })
    ).required().min(1)
  }),
};

module.exports = {
  createProduct,
  fetchImageFromSearch,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  getAllProducts,
  bulkUpdateProducts,
  bulkAddProducts,
};
