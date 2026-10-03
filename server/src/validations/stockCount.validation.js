const Joi = require('joi');
const { objectId } = require('./custom.validation');
const { StockCount, StockCountLine } = require('../models');

const countId = { params: Joi.object().keys({ countId: Joi.string().custom(objectId).required() }) };
const cls = Joi.string().valid('A', 'B', 'C');

const getCounts = {
  query: Joi.object().keys({
    status: Joi.string().valid('open', ...StockCount.STATUSES),
    type: Joi.string().valid(...StockCount.TYPES),
    limit: Joi.number().integer().min(1).max(100),
    page: Joi.number().integer().min(1),
    sortBy: Joi.string(),
  }),
};

const createCount = {
  body: Joi.object().keys({
    type: Joi.string()
      .valid(...StockCount.TYPES)
      .required(),
    title: Joi.string().allow('').trim().max(120),
    notes: Joi.string().allow('').trim().max(1000),
    blind: Joi.boolean(),
    classes: Joi.array().items(cls),
    categoryIds: Joi.array().items(Joi.string().custom(objectId)),
    productIds: Joi.array().items(Joi.string().custom(objectId)).max(2000),
    sampleSize: Joi.number().integer().min(1).max(500),
    includeZeroStock: Joi.boolean(),
  }),
};

const recordCounts = {
  ...countId,
  body: Joi.object().keys({
    entries: Joi.array()
      .items(
        Joi.object()
          .keys({
            lineId: Joi.string().custom(objectId).required(),
            qty: Joi.number().min(0).max(1e9),
            addQty: Joi.number().min(-1e9).max(1e9),
            imeis: Joi.array().items(Joi.string().trim().max(64)).max(5000),
            clear: Joi.boolean(),
            reason: Joi.string()
              .valid(...StockCountLine.VARIANCE_REASONS)
              .allow(null, ''),
            note: Joi.string().allow('').trim().max(500),
            newCost: Joi.number().min(0).allow(null),
          })
          .oxor('qty', 'addQty', 'imeis', 'clear')
      )
      .min(1)
      .max(500)
      .required(),
  }),
};

const addLines = {
  ...countId,
  body: Joi.object().keys({
    itemKeys: Joi.array()
      .items(Joi.string().pattern(/^[pv]:[0-9a-fA-F]{24}$/))
      .min(1)
      .max(200)
      .required(),
  }),
};

const recount = {
  ...countId,
  body: Joi.object().keys({ lineIds: Joi.array().items(Joi.string().custom(objectId)).max(5000) }),
};

const postCount = {
  ...countId,
  body: Joi.object().keys({ uncountedPolicy: Joi.string().valid('skip', 'zero') }),
};

const cancelCount = {
  ...countId,
  body: Joi.object().keys({ reason: Joi.string().allow('').trim().max(500) }),
};

const updatePolicy = {
  body: Joi.object().keys({
    basis: Joi.string().valid('consumption', 'revenue', 'stockValue'),
    lookbackDays: Joi.number().integer().min(7).max(730),
    aShare: Joi.number().min(1).max(99),
    bShare: Joi.number().min(2).max(100),
    intervals: Joi.object().keys({
      A: Joi.number().integer().min(1).max(365),
      B: Joi.number().integer().min(1).max(365),
      C: Joi.number().integer().min(1).max(730),
    }),
    maxItemsPerDay: Joi.number().integer().min(0).max(10000),
    includeZeroStock: Joi.boolean(),
    blindByDefault: Joi.boolean(),
    surpriseSampleSize: Joi.number().integer().min(1).max(500),
  }),
};

const setOverride = {
  body: Joi.object().keys({
    productId: Joi.string().custom(objectId).required(),
    cls: Joi.string().valid('A', 'B', 'C', 'exclude').allow(null).required(),
  }),
};

const getReports = {
  query: Joi.object().keys({
    startDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
    endDate: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/),
  }),
};

const productHistory = {
  params: Joi.object().keys({ productId: Joi.string().custom(objectId).required() }),
};

module.exports = {
  getCounts,
  getCount: countId,
  createCount,
  recordCounts,
  addLines,
  submitCount: countId,
  recount,
  postCount,
  cancelCount,
  updatePolicy,
  setOverride,
  getReports,
  productHistory,
};
