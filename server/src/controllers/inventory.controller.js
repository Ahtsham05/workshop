const catchAsync = require('../utils/catchAsync');
const inventoryService = require('../services/inventory.service');
const pick = require('../utils/pick');

const adjustInventory = catchAsync(async (req, res) => {
  const inventory = await inventoryService.adjustInventory(req.params.variantId, {
    ...req.body,
    userId: req.user ? req.user.id : undefined,
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
