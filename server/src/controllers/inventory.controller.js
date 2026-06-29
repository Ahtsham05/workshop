const catchAsync = require('../utils/catchAsync');
const inventoryService = require('../services/inventory.service');
const { auditLogService } = require('../services');
const { ProductVariant, Product } = require('../models');
const pick = require('../utils/pick');

const adjustInventory = catchAsync(async (req, res) => {
  const previous = await inventoryService.getInventoryForVariant(req.params.variantId);
  const previousQuantity = previous ? previous.quantity : undefined;

  const inventory = await inventoryService.adjustInventory(req.params.variantId, {
    ...req.body,
    userId: req.user ? req.user.id : undefined,
  });

  const variant = await ProductVariant.findById(req.params.variantId);
  const product = variant ? await Product.findById(variant.productId).select('name') : null;

  await auditLogService.recordAuditLog({
    req,
    action: 'stock_adjust',
    module: 'Inventory',
    entityId: req.params.variantId,
    entityName: product?.name,
    before: { quantity: previousQuantity },
    after: { quantity: inventory.quantity },
    fields: ['quantity'],
    metadata: { reason: req.body.reason, type: req.body.type, quantityDelta: req.body.quantityDelta },
  });

  res.send(inventory);
});

const getInventory = catchAsync(async (req, res) => {
  const inventory = await inventoryService.getInventoryForVariant(req.params.variantId);
  res.send(inventory);
});

const getInventoryTransactions = catchAsync(async (req, res) => {
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await inventoryService.getTransactionsForVariant(req.params.variantId, options);
  res.send(result);
});

module.exports = {
  adjustInventory,
  getInventory,
  getInventoryTransactions,
};
