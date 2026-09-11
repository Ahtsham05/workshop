const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createTransfer = {
  // Exactly one of quantity (bulk products) or imeis (IMEI/serial-tracked products, moved
  // per-unit) applies to a given line — which one is required is enforced service-side,
  // since that depends on the target product's own trackImei/trackSerial flag, not
  // something the request shape alone can validate.
  body: Joi.object().keys({
    fromProductId: Joi.string().custom(objectId).required(),
    fromVariantId: Joi.string().custom(objectId),
    fromBatchId: Joi.string().custom(objectId),
    toBranchId: Joi.string().custom(objectId).required(),
    quantity: Joi.number().integer().min(1),
    imeis: Joi.array().items(Joi.string().trim()).min(1),
    reason: Joi.string().allow('').trim(),
    notes: Joi.string().allow('').trim(),
  }),
};

const createBulkTransfer = {
  body: Joi.object().keys({
    toBranchId: Joi.string().custom(objectId).required(),
    items: Joi.array()
      .min(1)
      .max(200)
      .items(
        Joi.object().keys({
          fromProductId: Joi.string().custom(objectId).required(),
          fromVariantId: Joi.string().custom(objectId),
          fromBatchId: Joi.string().custom(objectId),
          quantity: Joi.number().integer().min(1),
          imeis: Joi.array().items(Joi.string().trim()).min(1),
        })
      )
      .required(),
    reason: Joi.string().allow('').trim(),
    notes: Joi.string().allow('').trim(),
  }),
};

const getTransferGroup = {
  params: Joi.object().keys({
    groupId: Joi.string().custom(objectId).required(),
  }),
};

const getTransfers = {
  query: Joi.object().keys({
    status: Joi.string().valid('suggested', 'approved', 'in_transit', 'completed', 'cancelled'),
    direction: Joi.string().valid('incoming', 'outgoing'),
    fromBranchId: Joi.string().custom(objectId),
    toBranchId: Joi.string().custom(objectId),
    limit: Joi.number(),
    page: Joi.number(),
    sortBy: Joi.string(),
    search: Joi.string(),
  }),
};

const getTransfer = {
  params: Joi.object().keys({
    transferId: Joi.string().custom(objectId).required(),
  }),
};

const transferIdParam = {
  params: Joi.object().keys({
    transferId: Joi.string().custom(objectId).required(),
  }),
};

module.exports = {
  createTransfer,
  createBulkTransfer,
  getTransfers,
  getTransfer,
  getTransferGroup,
  approveTransfer: transferIdParam,
  completeTransfer: transferIdParam,
  cancelTransfer: transferIdParam,
};
