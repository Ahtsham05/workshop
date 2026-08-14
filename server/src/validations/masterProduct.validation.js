const Joi = require('joi');

// Each entry is either a plain IMEI/serial string, or a { imei, imei2 } pair for
// dual-SIM phones — same shape as product.validation.js's imeiEntry.
const imeiEntry = Joi.alternatives().try(
  Joi.string().trim(),
  Joi.object().keys({
    imei: Joi.string().trim().required(),
    imei2: Joi.string().trim().allow('').optional(),
  }),
);

const getImportableMasterProducts = {};

const importMasterProducts = {
  body: Joi.object().keys({
    items: Joi.array()
      .items(
        Joi.object().keys({
          masterProductId: Joi.string().required(),
          price: Joi.number().min(0),
          cost: Joi.number().min(0),
          stockQuantity: Joi.number().min(0),
          // Only relevant when stockQuantity > 0 and the master is batch/expiry or
          // serial/IMEI tracked — enforced in masterProduct.service.js#importMasterProducts,
          // not here (the requirement depends on the master's tracking flags, which this
          // schema has no visibility into).
          batchNumber: Joi.string().trim().allow(''),
          expiryDate: Joi.date(),
          imeis: Joi.array().items(imeiEntry),
        }),
      )
      .min(1)
      .required(),
  }),
};

module.exports = {
  getImportableMasterProducts,
  importMasterProducts,
};
