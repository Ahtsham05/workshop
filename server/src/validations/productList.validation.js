const Joi = require('joi');
const { objectId } = require('./custom.validation');

const PURPOSES = ['custom', 'to_order', 'do_not_order', 'online', 'high_value'];
const RULE_TYPES = ['top_stock_value', 'top_price', 'low_stock', 'out_of_stock', 'inactive_with_stock'];

const rule = Joi.object().keys({
  type: Joi.string().valid(...RULE_TYPES).required(),
  limit: Joi.number().integer().min(1).max(1000),
  threshold: Joi.number().min(0).allow(null),
  categoryId: Joi.string().custom(objectId).allow(null, ''),
});

const listFields = {
  name: Joi.string().trim().min(1).max(80),
  description: Joi.string().trim().allow('').max(500),
  purpose: Joi.string().valid(...PURPOSES),
  color: Joi.string().trim().max(20).allow(null, ''),
  kind: Joi.string().valid('manual', 'smart'),
  rule: rule.allow(null),
  pinned: Joi.boolean(),
};

const listIdParam = Joi.object().keys({ listId: Joi.string().custom(objectId).required() });
const productIds = Joi.array().items(Joi.string().custom(objectId)).min(1).max(5000).required();

module.exports = {
  createProductList: {
    // A preset purpose may stand in for the name (e.g. "To order").
    body: Joi.object().keys(listFields).or('name', 'purpose'),
  },
  updateProductList: { params: listIdParam, body: Joi.object().keys(listFields).min(1) },
  getProductList: { params: listIdParam },
  deleteProductList: { params: listIdParam },
  addProducts: {
    params: listIdParam,
    body: Joi.object().keys({
      productIds,
      quantity: Joi.number().min(0).allow(null),
      note: Joi.string().trim().allow('').max(300),
    }),
  },
  removeProducts: { params: listIdParam, body: Joi.object().keys({ productIds }) },
  updateItem: {
    params: listIdParam.keys({ productId: Joi.string().custom(objectId).required() }),
    body: Joi.object().keys({
      quantity: Joi.number().min(0).allow(null),
      note: Joi.string().trim().allow('').max(300),
    }).min(1),
  },
  getMemberships: { query: Joi.object().keys({ productIds: Joi.string().pattern(/^[0-9a-fA-F]{24}(,[0-9a-fA-F]{24})*$/).required() }) },
  getOrderLines: { params: listIdParam },
};
