const Joi = require('joi');
const { objectId } = require('./custom.validation');
const { WAREHOUSE_TYPES } = require('../models/warehouse.model');
const { LOCATION_TYPES } = require('../models/warehouseLocation.model');
const { TRANSFER_STATUSES } = require('../models/warehouseTransfer.model');
const { MOVE_TYPES } = require('../models/warehouseMove.model');

const id = Joi.string().custom(objectId);
const optionalId = Joi.string().custom(objectId).allow(null, '');

const updateSettings = {
  body: Joi.object({
    enabled: Joi.boolean(),
    useLocations: Joi.boolean(),
    blockNegativeTransfers: Joi.boolean(),
    askOnSales: Joi.boolean(),
    askOnPurchases: Joi.boolean(),
  }).min(1),
};

const warehouseBody = {
  name: Joi.string().trim().max(120),
  code: Joi.string().trim().max(12).allow(''),
  type: Joi.string().valid(...WAREHOUSE_TYPES),
  description: Joi.string().trim().max(1000).allow(''),
  address: Joi.string().trim().max(500).allow(''),
  city: Joi.string().trim().max(120).allow(''),
  phone: Joi.string().trim().max(40).allow(''),
  managerId: optionalId,
  isActive: Joi.boolean(),
  isDefault: Joi.boolean(),
  allowSales: Joi.boolean(),
  allowReceipts: Joi.boolean(),
  color: Joi.string().trim().max(20).allow(''),
  sortOrder: Joi.number().integer(),
};

const listWarehouses = {
  query: Joi.object({ includeInactive: Joi.boolean() }),
};

const createWarehouse = {
  body: Joi.object({ ...warehouseBody, name: warehouseBody.name.required() }),
};

const warehouseParam = { params: Joi.object({ warehouseId: id.required() }) };

const updateWarehouse = {
  ...warehouseParam,
  body: Joi.object(warehouseBody).min(1),
};

const locationBody = {
  name: Joi.string().trim().max(80),
  type: Joi.string().valid(...LOCATION_TYPES),
  parentId: optionalId,
  barcode: Joi.string().trim().max(80).allow(''),
  notes: Joi.string().trim().max(500).allow(''),
  isActive: Joi.boolean(),
  sortOrder: Joi.number().integer(),
};

const createLocation = {
  ...warehouseParam,
  body: Joi.object({ ...locationBody, name: locationBody.name.required() }),
};

const createLocationsBulk = {
  ...warehouseParam,
  body: Joi.object({
    prefix: Joi.string().trim().max(40).allow(''),
    from: Joi.number().integer().min(0).required(),
    to: Joi.number().integer().min(0).required(),
    pad: Joi.number().integer().min(0).max(5),
    type: Joi.string().valid(...LOCATION_TYPES),
    parentId: optionalId,
  }),
};

const locationParam = { params: Joi.object({ locationId: id.required() }) };

const updateLocation = {
  ...locationParam,
  body: Joi.object(locationBody).min(1),
};

const getStock = {
  query: Joi.object({
    warehouseId: id,
    locationId: id,
    search: Joi.string().allow('').max(200),
    filter: Joi.string().valid('in_stock', 'all', 'negative', 'split'),
    sortBy: Joi.string().valid('name', 'qty_desc', 'qty_asc', 'value_desc'),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(1000),
  }),
};

const getAvailability = {
  body: Joi.object({
    warehouseId: id.required(),
    locationId: optionalId,
    productIds: Joi.array().items(id).max(1000).required(),
  }),
};

const productParam = { params: Joi.object({ productId: id.required() }) };

const transferLine = Joi.object({
  productId: id.required(),
  variantId: optionalId,
  quantity: Joi.number().min(0).required(),
  fromLocationId: optionalId,
  toLocationId: optionalId,
  note: Joi.string().trim().max(300).allow(''),
});

const transferBody = {
  fromWarehouseId: id,
  fromLocationId: optionalId,
  toWarehouseId: id,
  toLocationId: optionalId,
  date: Joi.date(),
  reference: Joi.string().trim().max(120).allow(''),
  notes: Joi.string().trim().max(2000).allow(''),
  lines: Joi.array().items(transferLine).max(500),
  // true = post it right away (one-step move).
  validate: Joi.boolean(),
};

const createTransfer = {
  body: Joi.object({
    ...transferBody,
    fromWarehouseId: id.required(),
    toWarehouseId: id.required(),
    lines: transferBody.lines.min(1).required(),
  }),
};

const transferParam = { params: Joi.object({ transferId: id.required() }) };

const updateTransfer = {
  ...transferParam,
  body: Joi.object(transferBody).min(1),
};

const getTransfers = {
  query: Joi.object({
    status: Joi.string().valid(...TRANSFER_STATUSES),
    warehouseId: id,
    search: Joi.string().allow('').max(200),
    from: Joi.date(),
    to: Joi.date(),
    sortBy: Joi.string(),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(200),
  }),
};

const getMoves = {
  query: Joi.object({
    warehouseId: id,
    locationId: id,
    productId: id,
    moveType: Joi.string().valid(...MOVE_TYPES),
    refType: Joi.string().valid('Invoice', 'Purchase', 'WarehouseTransfer', 'SalesReturn', 'PurchaseReturn', 'StockAdjustment', 'InventoryTransfer'),
    search: Joi.string().allow('').max(200),
    from: Joi.date(),
    to: Joi.date(),
    page: Joi.number().integer().min(1),
    limit: Joi.number().integer().min(1).max(200),
  }),
};

const getRules = { query: Joi.object({ warehouseId: id }) };

const upsertRules = {
  ...warehouseParam,
  body: Joi.object({
    rules: Joi.array()
      .items(
        Joi.object({
          productId: id.required(),
          variantId: optionalId,
          minQty: Joi.number().min(0).required(),
          maxQty: Joi.number().min(0).required(),
          sourceWarehouseId: optionalId,
          isActive: Joi.boolean(),
        })
      )
      .min(1)
      .max(500)
      .required(),
  }),
};

const ruleParam = { params: Joi.object({ ruleId: id.required() }) };

const createReplenishment = {
  body: Joi.object({
    lines: Joi.array()
      .items(Joi.object({ ruleId: id.required(), quantity: Joi.number().min(0) }))
      .min(1)
      .max(500)
      .required(),
  }),
};

module.exports = {
  getRules,
  upsertRules,
  ruleParam,
  createReplenishment,
  updateSettings,
  listWarehouses,
  createWarehouse,
  warehouseParam,
  updateWarehouse,
  createLocation,
  createLocationsBulk,
  locationParam,
  updateLocation,
  getStock,
  getAvailability,
  productParam,
  createTransfer,
  transferParam,
  updateTransfer,
  getTransfers,
  getMoves,
};
