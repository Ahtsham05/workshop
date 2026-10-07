const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { manufacturingService, auditLogService } = require('../services');
const { getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');

const {
  settings: settingsService,
  bom: bomService,
  productionOrder: productionOrderService,
  execution: executionService,
  products: productsService,
  dashboard: dashboardService,
} = manufacturingService;

/** Read context: org always, branch when the client picked one (superAdmins may read org-wide). */
const readCtx = (req) => {
  const { organizationId, branchId } = getBranchContext(req);
  return { organizationId, branchId };
};

/** Write context: a concrete branch is mandatory — falls back to the user's own branch. */
const writeCtx = async (req) => {
  await resolveWriteBranchId(req);
  return getBranchContext(req);
};

const audit = (req, { action = 'create', module, entity, entityName, metadata }) =>
  auditLogService.recordAuditLog({
    req,
    action,
    module,
    entityId: entity && (entity._id || entity.id),
    entityName,
    metadata,
  });

const listOptions = (req) => pick(req.query, ['sortBy', 'limit', 'page']);

// ── Dashboard & settings ─────────────────────────────────────────────────────────
const getDashboard = catchAsync(async (req, res) => {
  res.send(await dashboardService.getDashboard(readCtx(req)));
});

const getSettings = catchAsync(async (req, res) => {
  res.send(await settingsService.getSettings(req.organizationId));
});

const updateSettings = catchAsync(async (req, res) => {
  const settings = await settingsService.updateSettings(req.organizationId, req.body, req.user.id);
  await audit(req, {
    action: 'update',
    module: 'ManufacturingSettings',
    entity: settings,
    entityName: 'Manufacturing settings',
    metadata: { fields: Object.keys(req.body) },
  });
  res.send(settings);
});

// ── Products ─────────────────────────────────────────────────────────────────────
const getProducts = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['productType', 'classifiedOnly', 'hasBom', 'search']);
  res.send(await productsService.queryProducts(readCtx(req), filter, listOptions(req)));
});

const getProductTypeSummary = catchAsync(async (req, res) => {
  res.send(await productsService.getTypeSummary(readCtx(req)));
});

const updateProductAttributes = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const product = await productsService.updateAttributes(ctx, req.params.productId, req.body);
  await audit(req, {
    action: 'update',
    module: 'Product',
    entity: product,
    entityName: product.name,
    metadata: { manufacturing: req.body },
  });
  res.send(product);
});

const bulkClassifyProducts = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  res.send(await productsService.bulkClassify(ctx, req.body));
});

const getAssemblies = catchAsync(async (req, res) => {
  res.send(await productsService.getAssemblies(readCtx(req)));
});

const getWhereUsed = catchAsync(async (req, res) => {
  res.send(await bomService.whereUsed(readCtx(req), req.params.productId));
});

// ── BOMs ─────────────────────────────────────────────────────────────────────────
const createBom = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const bom = await bomService.createBom(ctx, req.body);
  await audit(req, {
    module: 'Bom',
    entity: bom,
    entityName: `${bom.bomNumber} v${bom.version}`,
    metadata: { productName: bom.productName },
  });
  res.status(httpStatus.CREATED).send(bom);
});

const getBoms = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['productId', 'bomNumber', 'isActive', 'isDefault', 'search']);
  res.send(await bomService.queryBoms(readCtx(req), filter, listOptions(req)));
});

const getBom = catchAsync(async (req, res) => {
  res.send(await bomService.getBom(readCtx(req), req.params.bomId));
});

const updateBom = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const bom = await bomService.updateBom(ctx, req.params.bomId, req.body);
  await audit(req, {
    action: 'update',
    module: 'Bom',
    entity: bom,
    entityName: `${bom.bomNumber} v${bom.version}`,
    metadata: { fields: Object.keys(req.body) },
  });
  res.send(bom);
});

const createBomVersion = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const bom = await bomService.createNewVersion(ctx, req.params.bomId, req.body);
  await audit(req, {
    module: 'Bom',
    entity: bom,
    entityName: `${bom.bomNumber} v${bom.version}`,
    metadata: { fromBomId: req.params.bomId },
  });
  res.status(httpStatus.CREATED).send(bom);
});

const getBomVersions = catchAsync(async (req, res) => {
  res.send(await bomService.listVersions(readCtx(req), req.params.bomId));
});

const setDefaultBom = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const bom = await bomService.setDefaultBom(ctx, req.params.bomId);
  await audit(req, {
    action: 'status_change',
    module: 'Bom',
    entity: bom,
    entityName: `${bom.bomNumber} v${bom.version}`,
    metadata: { isDefault: true },
  });
  res.send(bom);
});

const setBomActive = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const bom = await bomService.setBomActive(ctx, req.params.bomId, req.body.isActive);
  await audit(req, {
    action: 'status_change',
    module: 'Bom',
    entity: bom,
    entityName: `${bom.bomNumber} v${bom.version}`,
    metadata: { isActive: bom.isActive },
  });
  res.send(bom);
});

const deleteBom = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const bom = await bomService.getBom(ctx, req.params.bomId);
  await bomService.deleteBom(ctx, req.params.bomId);
  await audit(req, { action: 'delete', module: 'Bom', entity: bom, entityName: `${bom.bomNumber} v${bom.version}` });
  res.status(httpStatus.NO_CONTENT).send();
});

const explodeBom = catchAsync(async (req, res) => {
  const ctx = readCtx(req);
  const bom = await bomService.getBom(ctx, req.params.bomId);
  const quantity = req.query.quantity || bom.quantity;
  res.send(
    await bomService.explodeBom({ organizationId: ctx.organizationId, branchId: bom.branchId }, bom._id, quantity, {
      explode: req.query.explode === true,
    })
  );
});

// ── Production orders ────────────────────────────────────────────────────────────
const orderLabel = (order) => `${order.orderNumber} — ${order.productName}`;

const createProductionOrder = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const order = await productionOrderService.createOrder(ctx, req.body);
  await audit(req, {
    module: 'ProductionOrder',
    entity: order,
    entityName: orderLabel(order),
    metadata: { plannedQuantity: order.plannedQuantity },
  });
  res.status(httpStatus.CREATED).send(order);
});

const getProductionOrders = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status', 'priority', 'productId', 'bomId', 'overdue', 'search', 'dateFrom', 'dateTo']);
  res.send(await productionOrderService.queryOrders(readCtx(req), filter, listOptions(req)));
});

const getProductionOrder = catchAsync(async (req, res) => {
  res.send(await productionOrderService.getOrder(readCtx(req), req.params.orderId));
});

const updateProductionOrder = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const order = await productionOrderService.updateOrder(ctx, req.params.orderId, req.body);
  await audit(req, {
    action: 'update',
    module: 'ProductionOrder',
    entity: order,
    entityName: orderLabel(order),
    metadata: { fields: Object.keys(req.body) },
  });
  res.send(order);
});

const refreshProductionMaterials = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  res.send(await productionOrderService.refreshMaterials(ctx, req.params.orderId));
});

const changeProductionStatus = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const order = await productionOrderService.changeStatus(ctx, req.params.orderId, req.body);
  await audit(req, {
    action: 'status_change',
    module: 'ProductionOrder',
    entity: order,
    entityName: orderLabel(order),
    metadata: { status: order.status, note: req.body.note },
  });
  res.send(order);
});

const deleteProductionOrder = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const order = await productionOrderService.getOrder(ctx, req.params.orderId);
  await productionOrderService.deleteOrder(ctx, req.params.orderId);
  await audit(req, { action: 'delete', module: 'ProductionOrder', entity: order, entityName: orderLabel(order) });
  res.status(httpStatus.NO_CONTENT).send();
});

const getOrderRequirements = catchAsync(async (req, res) => {
  res.send(await productionOrderService.getOrderRequirements(readCtx(req), req.params.orderId));
});

const getRequirements = catchAsync(async (req, res) => {
  const statuses = req.query.statuses ? String(req.query.statuses).split(',').filter(Boolean) : undefined;
  res.send(await productionOrderService.getAggregatedRequirements(readCtx(req), { statuses }));
});

// ── Execution ────────────────────────────────────────────────────────────────────
const issueMaterials = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const issue = await executionService.issueMaterials(ctx, req.params.orderId, req.body);
  await audit(req, {
    action: 'stock_adjust',
    module: 'MaterialIssue',
    entity: issue,
    entityName: `${issue.issueNumber} (${issue.orderNumber})`,
    metadata: { totalCost: issue.totalCost, lines: issue.lines.length },
  });
  res.status(httpStatus.CREATED).send(issue);
});

const receiveFinishedGoods = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const receipt = await executionService.receiveFinishedGoods(ctx, req.params.orderId, req.body);
  await audit(req, {
    action: 'stock_adjust',
    module: 'ProductionReceipt',
    entity: receipt,
    entityName: `${receipt.receiptNumber} (${receipt.orderNumber})`,
    metadata: { quantity: receipt.quantity, productName: receipt.productName },
  });
  res.status(httpStatus.CREATED).send(receipt);
});

const recordScrap = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const scrap = await executionService.recordScrap(ctx, req.body);
  await audit(req, {
    action: scrap.affectsStock ? 'stock_adjust' : 'create',
    module: 'ScrapRecord',
    entity: scrap,
    entityName: `${scrap.scrapNumber} — ${scrap.productName}`,
    metadata: { stage: scrap.stage, quantity: scrap.quantity, reason: scrap.reason },
  });
  res.status(httpStatus.CREATED).send(scrap);
});

const txFilter = (req) =>
  pick(req.query, ['productionOrderId', 'productId', 'stage', 'reason', 'search', 'dateFrom', 'dateTo']);

const getMaterialIssues = catchAsync(async (req, res) => {
  res.send(await executionService.queryIssues(readCtx(req), txFilter(req), listOptions(req)));
});

const getMaterialIssue = catchAsync(async (req, res) => {
  res.send(await executionService.getIssue(readCtx(req), req.params.issueId));
});

const getProductionReceipts = catchAsync(async (req, res) => {
  res.send(await executionService.queryReceipts(readCtx(req), txFilter(req), listOptions(req)));
});

const getScrapRecords = catchAsync(async (req, res) => {
  res.send(await executionService.queryScrap(readCtx(req), txFilter(req), listOptions(req)));
});

const getWip = catchAsync(async (req, res) => {
  res.send(await executionService.getWip(readCtx(req)));
});

module.exports = {
  getDashboard,
  getSettings,
  updateSettings,
  getProducts,
  getProductTypeSummary,
  updateProductAttributes,
  bulkClassifyProducts,
  getAssemblies,
  getWhereUsed,
  createBom,
  getBoms,
  getBom,
  updateBom,
  createBomVersion,
  getBomVersions,
  setDefaultBom,
  setBomActive,
  deleteBom,
  explodeBom,
  createProductionOrder,
  getProductionOrders,
  getProductionOrder,
  updateProductionOrder,
  refreshProductionMaterials,
  changeProductionStatus,
  deleteProductionOrder,
  getOrderRequirements,
  getRequirements,
  issueMaterials,
  receiveFinishedGoods,
  recordScrap,
  getMaterialIssues,
  getMaterialIssue,
  getProductionReceipts,
  getScrapRecords,
  getWip,
};
