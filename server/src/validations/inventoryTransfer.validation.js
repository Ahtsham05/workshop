const Joi = require('joi');
const { objectId } = require('./custom.validation');

const createTransfer = {
  body: Joi.object().keys({
    fromProductId: Joi.string().custom(objectId).required(),
    fromVariantId: Joi.string().custom(objectId),
    fromBatchId: Joi.string().custom(objectId),
    toBranchId: Joi.string().custom(objectId).required(),
    quantity: Joi.number().integer().min(1).required(),
    reason: Joi.string().allow('').trim(),
    notes: Joi.string().allow('').trim(),
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
  getTransfers,
  getTransfer,
  approveTransfer: transferIdParam,
  completeTransfer: transferIdParam,
  cancelTransfer: transferIdParam,
};
