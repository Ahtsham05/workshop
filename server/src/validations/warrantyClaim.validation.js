const Joi = require('joi');
const { objectId } = require('./custom.validation');

const claimIdParam = Joi.object().keys({ claimId: Joi.string().custom(objectId).required() });
const dateValue = Joi.string().trim().max(40).allow('');
const text = (max) => Joi.string().trim().allow('').max(max);

module.exports = {
  lookupUnit: { query: Joi.object().keys({ serial: Joi.string().trim().min(1).max(80).required() }) },
  createClaim: {
    body: Joi.object().keys({
      type: Joi.string().valid('customer', 'stock').required(),
      productId: Joi.string().custom(objectId).required(),
      variantId: Joi.string().custom(objectId).allow(null, ''),
      quantity: Joi.number().integer().min(1).max(10000),
      serial: text(80),
      customerId: Joi.string().custom(objectId).allow(null, ''),
      customerName: text(120),
      customerPhone: text(40),
      invoiceId: Joi.string().custom(objectId).allow(null, ''),
      invoiceNumber: text(60),
      saleDate: dateValue,
      supplierId: Joi.string().custom(objectId).allow(null, ''),
      supplierName: text(120),
      problem: Joi.string().trim().min(2).max(2000).required(),
      conditionNotes: text(2000),
      accessories: Joi.array().items(Joi.string().trim().max(60)).max(20),
      receivedAt: dateValue,
    }),
  },
  queryClaims: {
    query: Joi.object().keys({
      status: Joi.string().pattern(/^(received|sent|returned|closed|cancelled)(,(received|sent|returned|closed|cancelled))*$/),
      type: Joi.string().valid('customer', 'stock'),
      search: Joi.string().allow('').max(200),
      overdue: Joi.boolean(),
      page: Joi.number().integer().min(1),
      limit: Joi.number().integer().min(1).max(200),
    }),
  },
  getClaim: { params: claimIdParam },
  sendToSupplier: {
    params: claimIdParam,
    body: Joi.object().keys({
      supplierId: Joi.string().custom(objectId).allow(null, ''),
      supplierName: text(120),
      reference: text(120),
      sentAt: dateValue,
      expectedBackAt: dateValue,
      note: text(500),
    }),
  },
  giveReplacement: {
    params: claimIdParam,
    body: Joi.object().keys({
      productId: Joi.string().custom(objectId),
      variantId: Joi.string().custom(objectId).allow(null, ''),
      serial: text(80),
      quantity: Joi.number().integer().min(1).max(10000),
    }),
  },
  receiveBack: {
    params: claimIdParam,
    body: Joi.object().keys({
      resolution: Joi.string().valid('repaired', 'replaced', 'rejected', 'credited').required(),
      replacementSerial: text(80),
      creditAmount: Joi.number().min(0),
      returnTo: Joi.string().valid('stock', 'scrap'),
      returnedAt: dateValue,
      note: text(1000),
    }),
  },
  closeClaim: { params: claimIdParam, body: Joi.object().keys({ note: text(500) }) },
  cancelClaim: { params: claimIdParam, body: Joi.object().keys({ reason: text(500) }) },
};
