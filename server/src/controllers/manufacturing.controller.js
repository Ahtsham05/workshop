const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { manufacturingService, auditLogService } = require('../services');
const { getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');

const stockService = require('../services/manufacturing/stock.service');
const { User } = require('../models');

const {
  settings: settingsService,
  bom: bomService,
  productionOrder: productionOrderService,
  execution: executionService,
  products: productsService,
  dashboard: dashboardService,
  analytics: analyticsService,
  traceability: traceabilityService,
  demoData: demoDataService,
  orderList: orderListService,
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
const getAnalytics = catchAsync(async (req, res) => {
  res.send(await analyticsService.getAnalytics(readCtx(req), pick(req.query, ['range'])));
});

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

// ── Demo data ────────────────────────────────────────────────────────────────────
const getDemoDataStatus = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  res.send(await demoDataService.getDemoStatus(ctx));
});

const loadDemoData = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const reload = !!(req.body && req.body.reload === true);
  const job = await demoDataService.startDemoLoad(ctx, { reload });
  await audit(req, {
    module: 'ManufacturingSettings',
    entityName: reload ? 'Manufacturing demo data reloaded' : 'Manufacturing demo data loaded',
  });
  res.status(httpStatus.ACCEPTED).send(job);
});

const removeDemoData = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const result = await demoDataService.removeDemoData(ctx);
  await audit(req, {
    action: 'delete',
    module: 'ManufacturingSettings',
    entityName: 'Manufacturing demo data removed',
    metadata: result,
  });
  res.send(result);
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

const ORDER_FILTER_KEYS = [
  'search',
  'orderNumber',
  'product',
  'status',
  'priority',
  'orderType',
  'parentOrderId',
  'productId',
  'operatorId',
  'createdBy',
  'bomId',
  'branchId',
  'warehouse',
  'workCenter',
  'productType',
  'productionFrom',
  'productionTo',
  'dueFrom',
  'dueTo',
  'completedFrom',
  'completedTo',
  'createdFrom',
  'createdTo',
  'dateFrom',
  'dateTo',
  'quantityMin',
  'quantityMax',
  'completionMin',
  'completionMax',
  'delayed',
  'overdue',
  'hasShortage',
  'hasQcIssue',
  'hasScrap',
  'hasRework',
];

const getOrderStatusCounts = catchAsync(async (req, res) => {
  res.send(await orderListService.summarizeOrders(readCtx(req), pick(req.query, ORDER_FILTER_KEYS)));
});

const getProductionOrders = catchAsync(async (req, res) => {
  res.send(
    await orderListService.listOrders(
      readCtx(req),
      pick(req.query, ORDER_FILTER_KEYS),
      pick(req.query, ['sort', 'dir', 'page', 'limit'])
    )
  );
});

const getProductionOrderFilterOptions = catchAsync(async (req, res) => {
  res.send(await orderListService.filterOptions(readCtx(req)));
});

const exportProductionOrders = catchAsync(async (req, res) => {
  const result = await orderListService.exportOrders(
    readCtx(req),
    pick(req.query, ORDER_FILTER_KEYS),
    pick(req.query, ['sort', 'dir'])
  );
  await audit(req, {
    action: 'export',
    module: 'ProductionOrder',
    entityName: 'Production orders',
    metadata: { rows: result.results.length, filters: pick(req.query, ORDER_FILTER_KEYS) },
  });
  res.send(result);
});

const bulkUpdateProductionOrders = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const result = await orderListService.bulkUpdate(ctx, req.body);
  await Promise.all(
    result.updated.map((order) =>
      audit(req, {
        action: req.body.status ? 'status_change' : 'update',
        module: 'ProductionOrder',
        entity: order,
        entityName: orderLabel(order),
        metadata: {
          bulk: true,
          changes: pick(req.body, ['priority', 'operatorId', 'plannedStartDate', 'plannedCompletionDate', 'status']),
        },
      })
    )
  );
  res.send({
    updated: result.updated.map((o) => ({ id: String(o._id || o.id), orderNumber: o.orderNumber, status: o.status })),
    failed: result.failed,
  });
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
/**
 * Whether the signed-in user holds a role permission — same rules as middlewares/permission
 * (super/system admins hold everything). Used where a permission changes what a request
 * may do rather than whether it may run at all.
 */
const userHasPermission = async (req, key) => {
  const { user } = req;
  if (!user) return false;
  if (user.systemRole === 'superAdmin' || user.systemRole === 'system_admin') return true;
  if (!user.role || typeof user.role === 'string' || !user.role.permissions) await user.populate('role');
  return !!(user.role && user.role.permissions && user.role.permissions[key] === true);
};

const issueMaterials = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const canOverIssue = req.body.allowOverIssue ? await userHasPermission(req, 'overIssueMaterials') : false;
  const issue = await executionService.issueMaterials(ctx, req.params.orderId, req.body, { canOverIssue });
  await audit(req, {
    action: 'stock_adjust',
    module: 'MaterialIssue',
    entity: issue,
    entityName: `${issue.issueNumber} (${issue.orderNumber})`,
    metadata: { totalCost: issue.totalCost, lines: issue.lines.length, overIssue: issue.isOverIssue },
  });
  res.status(httpStatus.CREATED).send(issue);
});

const returnMaterials = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const doc = await executionService.returnMaterials(ctx, req.params.orderId, req.body);
  await audit(req, {
    action: 'stock_adjust',
    module: 'MaterialReturn',
    entity: doc,
    entityName: `${doc.issueNumber} (${doc.orderNumber})`,
    metadata: { totalCost: doc.totalCost, lines: doc.lines.length },
  });
  res.status(httpStatus.CREATED).send(doc);
});

const reportOutput = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const output = await executionService.reportOutput(ctx, req.params.orderId, req.body);
  await audit(req, {
    action: 'stock_adjust',
    module: 'ProductionOutput',
    entity: output,
    entityName: `${output.outputNumber} (${output.orderNumber})`,
    metadata: {
      produced: output.producedQuantity,
      good: output.goodQuantity,
      rejected: output.rejectedQuantity,
      status: output.status,
    },
  });
  res.status(httpStatus.CREATED).send(output);
});

const inspectOutput = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const output = await executionService.inspectOutput(ctx, req.params.outputId, req.body);
  await audit(req, {
    action: 'status_change',
    module: 'ProductionOutput',
    entity: output,
    entityName: `${output.outputNumber} (${output.orderNumber})`,
    metadata: { good: output.goodQuantity, rejected: output.rejectedQuantity, disposition: output.rejectDisposition },
  });
  res.send(output);
});

const resolveRework = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const result = await executionService.resolveRework(ctx, req.params.orderId, req.body);
  await audit(req, {
    action: 'stock_adjust',
    module: 'ProductionOrder',
    entity: { _id: req.params.orderId },
    entityName: 'Rework result',
    metadata: { good: req.body.goodQuantity || 0, scrapped: req.body.scrapQuantity || 0 },
  });
  res.send(result);
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
  pick(req.query, ['productionOrderId', 'productId', 'stage', 'reason', 'kind', 'status', 'search', 'dateFrom', 'dateTo']);

const getMaterialIssues = catchAsync(async (req, res) => {
  res.send(await executionService.queryIssues(readCtx(req), txFilter(req), listOptions(req)));
});

const getMaterialIssue = catchAsync(async (req, res) => {
  res.send(await executionService.getIssue(readCtx(req), req.params.issueId));
});

const getProductionReceipts = catchAsync(async (req, res) => {
  res.send(await executionService.queryReceipts(readCtx(req), txFilter(req), listOptions(req)));
});

const getProductionOutputs = catchAsync(async (req, res) => {
  res.send(await executionService.queryOutputs(readCtx(req), txFilter(req), listOptions(req)));
});

const getScrapRecords = catchAsync(async (req, res) => {
  res.send(await executionService.queryScrap(readCtx(req), txFilter(req), listOptions(req)));
});

const getMovements = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['productionOrderId', 'productId', 'bucket', 'type', 'dateFrom', 'dateTo']);
  res.send(await executionService.queryMovements(readCtx(req), filter, listOptions(req)));
});

const getStockDetail = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  res.send(
    await stockService.getStockDetail({
      organizationId: ctx.organizationId,
      branchId: ctx.branchId,
      productId: req.query.productId,
      variantId: req.query.variantId || null,
    })
  );
});

// ── Assembly orders & nesting ────────────────────────────────────────────────────────
const startAssembly = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const order = await executionService.startAssembly(ctx, req.params.orderId, req.body || {});
  await audit(req, {
    action: 'status_change',
    module: 'ProductionOrder',
    entity: order,
    entityName: orderLabel(order),
    metadata: { status: order.status, event: 'assembly_started' },
  });
  res.send(order);
});

const completeAssembly = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const order = await executionService.completeAssembly(ctx, req.params.orderId, req.body);
  await audit(req, {
    action: 'status_change',
    module: 'ProductionOrder',
    entity: order,
    entityName: orderLabel(order),
    metadata: { status: order.status, event: 'assembly_completed', produced: order.producedQuantity },
  });
  res.send(order);
});

const createSubAssemblies = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const created = await productionOrderService.createSubAssemblyOrders(ctx, req.params.orderId, req.body);
  await Promise.all(
    created.map(({ order }) =>
      audit(req, {
        module: 'ProductionOrder',
        entity: order,
        entityName: orderLabel(order),
        metadata: { parentOrderId: req.params.orderId },
      })
    )
  );
  res.status(httpStatus.CREATED).send(created.map(({ order, depth }) => ({ order, depth })));
});

const getOrderTree = catchAsync(async (req, res) => {
  res.send(await productionOrderService.getOrderTree(readCtx(req), req.params.orderId));
});

const getOperators = catchAsync(async (req, res) => {
  const users = await User.find({ organizationId: req.organizationId, isActive: { $ne: false } })
    .select('name email')
    .sort({ name: 1 })
    .limit(500)
    .lean();
  res.send(users.map((u) => ({ id: String(u._id), name: u.name, email: u.email })));
});

// ── Traceability ──────────────────────────────────────────────────────────────────
const traceOrder = catchAsync(async (req, res) => {
  res.send(await traceabilityService.traceOrder(readCtx(req), req.params.orderId));
});

const traceFinished = catchAsync(async (req, res) => {
  res.send(await traceabilityService.traceFinished(readCtx(req), pick(req.query, ['imeiId', 'batchId', 'receiptId'])));
});

const traceWhereUsed = catchAsync(async (req, res) => {
  res.send(await traceabilityService.traceWhereUsed(readCtx(req), pick(req.query, ['imeiId', 'batchId', 'productId'])));
});

const traceLookup = catchAsync(async (req, res) => {
  res.send(await traceabilityService.lookup(readCtx(req), req.query.q));
});

const getWip = catchAsync(async (req, res) => {
  res.send(await executionService.getWip(readCtx(req)));
});

module.exports = {
  getProductionOrderFilterOptions,
  exportProductionOrders,
  bulkUpdateProductionOrders,
  getAnalytics,
  getOrderStatusCounts,
  getDashboard,
  getSettings,
  updateSettings,
  getDemoDataStatus,
  loadDemoData,
  removeDemoData,
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
  returnMaterials,
  reportOutput,
  inspectOutput,
  resolveRework,
  recordScrap,
  getProductionOutputs,
  getMovements,
  getStockDetail,
  getMaterialIssues,
  getMaterialIssue,
  getProductionReceipts,
  getScrapRecords,
  getWip,
  startAssembly,
  completeAssembly,
  createSubAssemblies,
  getOrderTree,
  getOperators,
  traceOrder,
  traceFinished,
  traceWhereUsed,
  traceLookup,
};
