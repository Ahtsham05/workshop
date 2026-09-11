const Joi = require('joi');
const { imeiEntry } = require('./custom.validation');

const getImportableMasterProducts = {
  query: Joi.object().keys({
    search: Joi.string().allow(''),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(500),
  }),
};

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
        })
      )
      .min(1)
      .required(),
  }),
};

module.exports = {
  getImportableMasterProducts,
  importMasterProducts,
};
