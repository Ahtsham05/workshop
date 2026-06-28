const Joi = require('joi');
const { UNITS } = require('../config/units');

const createProductVariant = {
  params: Joi.object().keys({
    productId: Joi.string().required(),
  }),
  body: Joi.object().keys({
    sku: Joi.string().trim().allow(''),
    barcode: Joi.string().trim().allow(''),
    attributes: Joi.object().pattern(Joi.string(), Joi.string()).default({}),
    price: Joi.number().required(),
    cost: Joi.number().required(),
    quantity: Joi.number().min(0).default(0),
    unit: Joi.string().valid(...Object.values(UNITS)),
    trackBatch: Joi.boolean(),
    trackExpiry: Joi.boolean(),
    trackSerial: Joi.boolean(),
    batchNumber: Joi.string().trim().allow(''),
    expiryDate: Joi.date(),
    image: Joi.object().keys({
      url: Joi.string(),
      publicId: Joi.string(),
    }).optional(),
  }),
};

const getProductVariants = {
  params: Joi.object().keys({
    productId: Joi.string().required(),
  }),
};

const getProductVariant = {
  params: Joi.object().keys({
    variantId: Joi.string().required(),
  }),
};

const updateProductVariant = {
  params: Joi.object().keys({
    variantId: Joi.string().required(),
  }),
  body: Joi.object()
    .keys({
      sku: Joi.string().trim().allow(''),
      barcode: Joi.string().trim().allow(''),
      attributes: Joi.object().pattern(Joi.string(), Joi.string()),
      price: Joi.number(),
      cost: Joi.number(),
      unit: Joi.string().valid(...Object.values(UNITS)),
      trackBatch: Joi.boolean(),
      trackExpiry: Joi.boolean(),
      trackSerial: Joi.boolean(),
      isActive: Joi.boolean(),
      image: Joi.object().keys({
        url: Joi.string(),
        publicId: Joi.string(),
      }),
    })
    .min(1),
};

const deleteProductVariant = {
  params: Joi.object().keys({
    variantId: Joi.string().required(),
  }),
};

module.exports = {
  createProductVariant,
  getProductVariants,
  getProductVariant,
  updateProductVariant,
  deleteProductVariant,
};
