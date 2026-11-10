const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { warehouseService } = require('../services');
const { getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');
const { userHasAnyPermission } = require('../middlewares/permission');

// Same rule as the product catalog: cost and stock value need viewCostPrices.
const canViewCost = (req) => userHasAnyPermission(req.user, ['viewCostPrices']);

const writeContext = async (req) => {
  await resolveWriteBranchId(req);
  const { organizationId, branchId, createdBy } = getBranchContext(req);
  return { organizationId, branchId, userId: createdBy };
};

const readContext = async (req) => {
  // Warehouse screens are per branch; fall back to the user's own branch like writes do.
  await resolveWriteBranchId(req);
  const { organizationId, branchId } = getBranchContext(req);
  return { organizationId, branchId };
};

const getSettings = catchAsync(async (req, res) => {
  res.send(await warehouseService.getSettings(req.organizationId));
});

const updateSettings = catchAsync(async (req, res) => {
  res.send(await warehouseService.updateSettings(req.organizationId, req.body, req.user.id));
});

const listWarehouses = catchAsync(async (req, res) => {
  const { organizationId, branchId } = await readContext(req);
  const includeInactive = req.query.includeInactive !== false && req.query.includeInactive !== 'false';
  res.send(await warehouseService.listWarehouses({ organizationId, branchId, includeInactive }));
});

const getOverview = catchAsync(async (req, res) => {
  const { organizationId, branchId } = await readContext(req);
  res.send(await warehouseService.getOverview({ organizationId, branchId, showCost: await canViewCost(req) }));
});

const createWarehouse = catchAsync(async (req, res) => {
  const ctx = await writeContext(req);
  res.status(httpStatus.CREATED).send(await warehouseService.createWarehouse({ ...ctx, body: req.body }));
});

const getWarehouse = catchAsync(async (req, res) => {
  const wh = await warehouseService.getWarehouse(req.organizationId, req.params.warehouseId);
  await wh.populate('managerId', 'name email');
  res.send(wh);
});

const updateWarehouse = catchAsync(async (req, res) => {
  res.send(
    await warehouseService.updateWarehouse({
      organizationId: req.organizationId,
      warehouseId: req.params.warehouseId,
      body: req.body,
      userId: req.user.id,
    })
  );
});

const setDefaultWarehouse = catchAsync(async (req, res) => {
  res.send(
    await warehouseService.setDefaultWarehouse({ organizationId: req.organizationId, warehouseId: req.params.warehouseId, userId: req.user.id })
  );
});

const deleteWarehouse = catchAsync(async (req, res) => {
  res.send(await warehouseService.deleteWarehouse({ organizationId: req.organizationId, warehouseId: req.params.warehouseId }));
});

const listLocations = catchAsync(async (req, res) => {
  res.send(await warehouseService.listLocations({ organizationId: req.organizationId, warehouseId: req.params.warehouseId }));
});

const createLocation = catchAsync(async (req, res) => {
  res.status(httpStatus.CREATED).send(
    await warehouseService.createLocation({
      organizationId: req.organizationId,
      warehouseId: req.params.warehouseId,
      body: req.body,
      userId: req.user.id,
    })
  );
});

const createLocationsBulk = catchAsync(async (req, res) => {
  res.status(httpStatus.CREATED).send(
    await warehouseService.createLocationsBulk({
      organizationId: req.organizationId,
      warehouseId: req.params.warehouseId,
      body: req.body,
      userId: req.user.id,
    })
  );
});

const updateLocation = catchAsync(async (req, res) => {
  res.send(await warehouseService.updateLocation({ organizationId: req.organizationId, locationId: req.params.locationId, body: req.body }));
});

const deleteLocation = catchAsync(async (req, res) => {
  res.send(await warehouseService.deleteLocation({ organizationId: req.organizationId, locationId: req.params.locationId }));
});

const getStock = catchAsync(async (req, res) => {
  const { organizationId, branchId } = await readContext(req);
  res.send(await warehouseService.getStock({ organizationId, branchId, query: req.query, showCost: await canViewCost(req) }));
});

const getAvailability = catchAsync(async (req, res) => {
  const { organizationId, branchId } = await readContext(req);
  res.send(await warehouseService.getAvailability({ organizationId, branchId, ...req.body }));
});

const getProductBreakdown = catchAsync(async (req, res) => {
  res.send(await warehouseService.getProductBreakdown({ organizationId: req.organizationId, productId: req.params.productId, variantId: req.query.variantId }));
});

const getTransfers = catchAsync(async (req, res) => {
  const { organizationId, branchId } = await readContext(req);
  res.send(await warehouseService.queryTransfers({ organizationId, branchId, query: req.query }));
});

const getTransfer = catchAsync(async (req, res) => {
  res.send(await warehouseService.getTransfer({ organizationId: req.organizationId, transferId: req.params.transferId }));
});

const createTransfer = catchAsync(async (req, res) => {
  const ctx = await writeContext(req);
  res.status(httpStatus.CREATED).send(await warehouseService.createTransfer({ ...ctx, body: req.body }));
});

const updateTransfer = catchAsync(async (req, res) => {
  res.send(
    await warehouseService.updateTransfer({
      organizationId: req.organizationId,
      transferId: req.params.transferId,
      body: req.body,
      userId: req.user.id,
    })
  );
});

const validateTransfer = catchAsync(async (req, res) => {
  res.send(await warehouseService.validateTransfer({ organizationId: req.organizationId, transferId: req.params.transferId, userId: req.user.id }));
});

const cancelTransfer = catchAsync(async (req, res) => {
  res.send(await warehouseService.cancelTransfer({ organizationId: req.organizationId, transferId: req.params.transferId, userId: req.user.id }));
});

const deleteTransfer = catchAsync(async (req, res) => {
  res.send(await warehouseService.deleteTransfer({ organizationId: req.organizationId, transferId: req.params.transferId }));
});

const getMoves = catchAsync(async (req, res) => {
  const { organizationId, branchId } = await readContext(req);
  res.send(await warehouseService.queryMoves({ organizationId, branchId, query: req.query }));
});

const getReport = catchAsync(async (req, res) => {
  const { organizationId, branchId } = await readContext(req);
  // eslint-disable-next-line global-require
  const warehouseReportService = require('../services/warehouseReport.service');
  res.send(
    await warehouseReportService.runReport({ report: req.params.report, organizationId, branchId, query: req.query, showCost: await canViewCost(req) })
  );
});

const getQuantities = catchAsync(async (req, res) => {
  const { organizationId, branchId } = await readContext(req);
  res.send(await warehouseService.getWarehouseQuantities({ organizationId, branchId, warehouseId: req.params.warehouseId }));
});

const getRules = catchAsync(async (req, res) => {
  const { organizationId, branchId } = await readContext(req);
  res.send(await warehouseService.listRules({ organizationId, branchId, warehouseId: req.query.warehouseId }));
});

const upsertRules = catchAsync(async (req, res) => {
  const ctx = await writeContext(req);
  res.send(await warehouseService.upsertRules({ ...ctx, warehouseId: req.params.warehouseId, rules: req.body.rules }));
});

const deleteRule = catchAsync(async (req, res) => {
  res.send(await warehouseService.deleteRule({ organizationId: req.organizationId, ruleId: req.params.ruleId }));
});

const getReplenishment = catchAsync(async (req, res) => {
  const { organizationId, branchId } = await readContext(req);
  res.send(await warehouseService.getReplenishment({ organizationId, branchId }));
});

const createReplenishment = catchAsync(async (req, res) => {
  const ctx = await writeContext(req);
  res.status(httpStatus.CREATED).send(await warehouseService.createReplenishmentTransfers({ ...ctx, lines: req.body.lines }));
});

module.exports = {
  getReport,
  getQuantities,
  getRules,
  upsertRules,
  deleteRule,
  getReplenishment,
  createReplenishment,
  getSettings,
  updateSettings,
  listWarehouses,
  getOverview,
  createWarehouse,
  getWarehouse,
  updateWarehouse,
  setDefaultWarehouse,
  deleteWarehouse,
  listLocations,
  createLocation,
  createLocationsBulk,
  updateLocation,
  deleteLocation,
  getStock,
  getAvailability,
  getProductBreakdown,
  getTransfers,
  getTransfer,
  createTransfer,
  updateTransfer,
  validateTransfer,
  cancelTransfer,
  deleteTransfer,
  getMoves,
};
