const Joi = require('joi');
const { objectId } = require('./custom.validation');

const conditionSchema = Joi.object().keys({
  grade: Joi.string().valid('A', 'B', 'C', 'D'),
  screenCondition: Joi.string().valid('excellent', 'good', 'fair', 'poor', 'cracked'),
  bodyCondition: Joi.string().valid('excellent', 'good', 'fair', 'poor'),
  batteryHealthPct: Joi.number().min(0).max(100),
  checklist: Joi.object().keys({
    touchScreen: Joi.boolean(),
    camera: Joi.boolean(),
    speaker: Joi.boolean(),
    microphone: Joi.boolean(),
    buttons: Joi.boolean(),
    biometrics: Joi.boolean(),
    charging: Joi.boolean(),
    waterDamage: Joi.boolean(),
  }),
  accessoriesIncluded: Joi.array().items(
    Joi.string().valid('box', 'charger', 'original_bill', 'earphones', 'back_cover'),
  ),
  ptaStatus: Joi.string().valid('approved', 'non_pta', 'blocked', 'unknown'),
  photos: Joi.array().items(
    Joi.object().keys({
      url: Joi.string().allow(''),
      publicId: Joi.string().allow(''),
    }),
  ),
});

const idCardSchema = Joi.object().keys({
  url: Joi.string().allow(''),
  publicId: Joi.string().allow(''),
});

const createBuyback = {
  body: Joi.object().keys({
    sellerType: Joi.string().valid('customer', 'walkin').default('walkin'),
    sellerCustomerId: Joi.string().custom(objectId).when('sellerType', {
      is: 'customer',
      then: Joi.required(),
      otherwise: Joi.forbidden(),
    }),
    sellerName: Joi.string().trim().required(),
    sellerPhone: Joi.string().trim().allow(''),
    sellerCNIC: Joi.string().trim().allow(''),
    sellerIdCardFront: idCardSchema,
    sellerIdCardBack: idCardSchema,
    imei: Joi.string().trim().required(),
    imei2: Joi.string().trim().allow(''),
    brand: Joi.string().trim().allow(''),
    model: Joi.string().trim().allow(''),
    color: Joi.string().trim().allow(''),
    storage: Joi.string().trim().allow(''),
    condition: conditionSchema,
    agreedPrice: Joi.number().min(0).required(),
    askingPrice: Joi.number().min(0),
    paymentMethod: Joi.string().valid('cash', 'wallet', 'bank').default('cash'),
    walletType: Joi.string().trim().when('paymentMethod', {
      is: 'wallet',
      then: Joi.required(),
      otherwise: Joi.optional().allow(''),
    }),
    buybackDate: Joi.date(),
    isTradeIn: Joi.boolean(),
    tradeInInvoiceId: Joi.string().custom(objectId),
    notes: Joi.string().trim().allow(''),
  }),
};

const getBuybacks = {
  query: Joi.object().keys({
    search: Joi.string().trim().allow(''),
    sellerType: Joi.string().valid('customer', 'walkin'),
    isTradeIn: Joi.boolean(),
    sortBy: Joi.string(),
    limit: Joi.number().integer(),
    page: Joi.number().integer(),
  }),
};

const getBuyback = {
  params: Joi.object().keys({
    buybackId: Joi.string().custom(objectId).required(),
  }),
};

const updateBuyback = {
  params: Joi.object().keys({
    buybackId: Joi.string().custom(objectId).required(),
  }),
  body: Joi.object()
    .keys({
      askingPrice: Joi.number().min(0),
      condition: conditionSchema,
      notes: Joi.string().trim().allow(''),
    })
    .min(1),
};

const deleteBuyback = {
  params: Joi.object().keys({
    buybackId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createBuyback,
  getBuybacks,
  getBuyback,
  updateBuyback,
  deleteBuyback,
};
