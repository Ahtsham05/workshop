const Joi = require('joi');
const { objectId } = require('./custom.validation');
const { UNITS } = require('../config/units');
const {
  PRODUCT_TYPES,
  PROCUREMENT_TYPES,
  PRODUCTION_STATUSES,
  PRODUCTION_PRIORITIES,
  SCRAP_STAGES,
  SCRAP_REASONS,
} = require('../config/manufacturing');

const id = () => Joi.string().custom(objectId);
const unit = () => Joi.string().valid(...Object.values(UNITS));
const pagination = {
  limit: Joi.number().integer().min(1).max(200),
  page: Joi.number().integer().min(1),
  sortBy: Joi.string(),
};
const dateRange = { dateFrom: Joi.date(), dateTo: Joi.date() };

// ── Settings ──────────────────────────────────────────────────────────────────────
const prefix = () =>
  Joi.string()
    .trim()
    .max(10)
    .pattern(/^[A-Za-z0-9]+$/)
    .message('Prefixes may only contain letters and numbers');

const updateSettings = {
  body: Joi.object()
    .keys({
      prefixes: Joi.object().keys({
        bom: prefix(),
        productionOrder: prefix(),
        materialIssue: prefix(),
        productionReceipt: prefix(),
        scrap: prefix(),
      }),
      numberPadding: Joi.number().integer().min(3).max(10),
      defaultSourceLocation: Joi.string().allow('').trim().max(100),
      defaultWipLocation: Joi.string().allow('').trim().max(100),
      defaultFinishedGoodsLocation: Joi.string().allow('').trim().max(100),
      allowNegativeStockIssue: Joi.boolean(),
      allowOverProduction: Joi.boolean(),
      requireBomForProduction: Joi.boolean(),
      explodeSubAssemblies: Joi.boolean(),
      defaultPriority: Joi.string().valid(...PRODUCTION_PRIORITIES),
    })
    .min(1),
};

// ── Products ──────────────────────────────────────────────────────────────────────
const getProducts = {
  query: Joi.object().keys({
    productType: Joi.string(),
    classifiedOnly: Joi.boolean(),
    hasBom: Joi.boolean(),
    search: Joi.string().allow(''),
    ...pagination,
  }),
};

const updateProductAttributes = {
  params: Joi.object().keys({ productId: id().required() }),
  body: Joi.object()
    .keys({
      productType: Joi.string()
        .valid(...PRODUCT_TYPES)
        .allow(null),
      procurementType: Joi.string()
        .valid(...PROCUREMENT_TYPES)
        .allow(null),
      manufacturingLeadTimeDays: Joi.number().min(0).max(3650).allow(null),
      defaultBomId: id().allow(null),
    })
    .min(1),
};

const bulkClassifyProducts = {
  body: Joi.object().keys({
    productIds: Joi.array().items(id()).min(1).max(500).required(),
    productType: Joi.string()
      .valid(...PRODUCT_TYPES)
      .allow(null)
      .required(),
    procurementType: Joi.string()
      .valid(...PROCUREMENT_TYPES)
      .allow(null),
  }),
};

const productIdParam = { params: Joi.object().keys({ productId: id().required() }) };

// ── BOMs ──────────────────────────────────────────────────────────────────────────
const component = Joi.object().keys({
  _id: id(),
  productId: id().required(),
  variantId: id().allow(null),
  quantity: Joi.number().positive().required(),
  unit: unit(),
  scrapPercent: Joi.number().min(0).max(100),
  isOptional: Joi.boolean(),
  childBomId: id().allow(null),
  alternatives: Joi.array()
    .items(
      Joi.object().keys({
        productId: id().required(),
        variantId: id().allow(null),
        ratio: Joi.number().positive(),
      })
    )
    .max(10),
  notes: Joi.string().allow('').max(500),
  sequence: Joi.number().integer(),
});

const bomBody = {
  name: Joi.string().allow('').trim().max(200),
  quantity: Joi.number().positive(),
  unit: unit(),
  components: Joi.array().items(component).min(1).max(500),
  notes: Joi.string().allow('').max(2000),
  isActive: Joi.boolean(),
  isDefault: Joi.boolean(),
  effectiveFrom: Joi.date().allow(null),
  effectiveTo: Joi.date()
    .allow(null)
    .when('effectiveFrom', {
      is: Joi.date().required(),
      then: Joi.date().min(Joi.ref('effectiveFrom')),
    }),
};

const createBom = {
  body: Joi.object().keys({
    productId: id().required(),
    variantId: id().allow(null),
    ...bomBody,
    components: bomBody.components.required(),
  }),
};

const getBoms = {
  query: Joi.object().keys({
    productId: id(),
    bomNumber: Joi.string(),
    isActive: Joi.boolean(),
    isDefault: Joi.boolean(),
    search: Joi.string().allow(''),
    ...pagination,
  }),
};

const bomIdParam = { params: Joi.object().keys({ bomId: id().required() }) };

const updateBom = { ...bomIdParam, body: Joi.object().keys(bomBody).min(1) };

const createBomVersion = { ...bomIdParam, body: Joi.object().keys(bomBody) };

const setBomActive = { ...bomIdParam, body: Joi.object().keys({ isActive: Joi.boolean().required() }) };

const explodeBom = {
  ...bomIdParam,
  query: Joi.object().keys({ quantity: Joi.number().positive(), explode: Joi.boolean() }),
};

// ── Production orders ─────────────────────────────────────────────────────────────
const orderBody = {
  variantId: id().allow(null),
  bomId: id().allow(null),
  plannedQuantity: Joi.number().positive(),
  plannedStartDate: Joi.date().allow(null),
  plannedCompletionDate: Joi.date()
    .allow(null)
    .when('plannedStartDate', {
      is: Joi.date().required(),
      then: Joi.date().min(Joi.ref('plannedStartDate')).messages({
        'date.min': 'Planned completion date cannot be before the planned start date',
      }),
    }),
  sourceLocation: Joi.string().allow('').trim().max(100),
  wipLocation: Joi.string().allow('').trim().max(100),
  finishedGoodsLocation: Joi.string().allow('').trim().max(100),
  priority: Joi.string().valid(...PRODUCTION_PRIORITIES),
  notes: Joi.string().allow('').max(2000),
};

const createProductionOrder = {
  body: Joi.object().keys({
    productId: id().required(),
    ...orderBody,
    plannedQuantity: orderBody.plannedQuantity.required(),
    status: Joi.string().valid('draft', 'planned'),
  }),
};

const getProductionOrders = {
  query: Joi.object().keys({
    status: Joi.string(),
    priority: Joi.string().valid(...PRODUCTION_PRIORITIES),
    productId: id(),
    bomId: id(),
    overdue: Joi.boolean(),
    search: Joi.string().allow(''),
    ...dateRange,
    ...pagination,
  }),
};

const orderIdParam = { params: Joi.object().keys({ orderId: id().required() }) };

const updateProductionOrder = {
  ...orderIdParam,
  body: Joi.object()
    .keys({ productId: id(), ...orderBody })
    .min(1),
};

const changeProductionStatus = {
  ...orderIdParam,
  body: Joi.object().keys({
    status: Joi.string()
      .valid(...PRODUCTION_STATUSES)
      .required(),
    note: Joi.string().allow('').max(500),
  }),
};

const getRequirements = {
  query: Joi.object().keys({ statuses: Joi.string() }),
};

// ── Execution ─────────────────────────────────────────────────────────────────────
const issueMaterials = {
  ...orderIdParam,
  body: Joi.object().keys({
    lines: Joi.array()
      .items(
        Joi.object().keys({
          materialLineId: id().required(),
          quantity: Joi.number().min(0).required(),
          alternativeProductId: id().allow(null),
        })
      )
      .min(1)
      .max(500)
      .required(),
    issueDate: Joi.date(),
    notes: Joi.string().allow('').max(1000),
  }),
};

const receiveFinishedGoods = {
  ...orderIdParam,
  body: Joi.object().keys({
    quantity: Joi.number().positive().required(),
    location: Joi.string().allow('').trim().max(100),
    receiptDate: Joi.date(),
    notes: Joi.string().allow('').max(1000),
  }),
};

const recordScrap = {
  body: Joi.object().keys({
    productionOrderId: id().allow(null),
    stage: Joi.string()
      .valid(...SCRAP_STAGES)
      .required(),
    materialLineId: id().when('stage', { is: 'material', then: Joi.required() }),
    productId: id(),
    variantId: id().allow(null),
    quantity: Joi.number().positive().required(),
    reason: Joi.string().valid(...SCRAP_REASONS),
    scrapDate: Joi.date(),
    notes: Joi.string().allow('').max(1000),
  }),
};

const listTransactions = {
  query: Joi.object().keys({
    productionOrderId: id(),
    productId: id(),
    stage: Joi.string().valid(...SCRAP_STAGES),
    reason: Joi.string().valid(...SCRAP_REASONS),
    search: Joi.string().allow(''),
    ...dateRange,
    ...pagination,
  }),
};

const issueIdParam = { params: Joi.object().keys({ issueId: id().required() }) };

module.exports = {
  updateSettings,
  getProducts,
  updateProductAttributes,
  bulkClassifyProducts,
  productIdParam,
  createBom,
  getBoms,
  bomIdParam,
  updateBom,
  createBomVersion,
  setBomActive,
  explodeBom,
  createProductionOrder,
  getProductionOrders,
  orderIdParam,
  updateProductionOrder,
  changeProductionStatus,
  getRequirements,
  issueMaterials,
  receiveFinishedGoods,
  recordScrap,
  listTransactions,
  issueIdParam,
};
