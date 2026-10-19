const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { manufacturingService, auditLogService } = require('../services');
const { getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');

const stockService = require('../services/manufacturing/stock.service');
const batchReportsService = require('../services/manufacturing/batchReports.service');
const { User, Product } = require('../models');
const ApiError = require('../utils/ApiError');

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
  operations: operationsService,
  orderDetail: orderDetailService,
  materialReceipt: materialReceiptService,
  materialIssueVoucher: materialIssueVoucherService,
  materialUsage: materialUsageService,
  materialIssueByMaterial: byMaterialService,
  materialIssueEdit: issueEditService,
  productionOrderBatch: productionOrderBatchService,
  reports: reportsService,
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
const PRODUCT_LIST_FILTERS = ['productType', 'classifiedOnly', 'hasBom', 'procurementType', 'stock', 'tracking', 'search'];

const getProducts = catchAsync(async (req, res) => {
  const filter = pick(req.query, [...PRODUCT_LIST_FILTERS, 'sort']);
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

const batchUnbatchedStock = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const batch = await productsService.batchUnbatchedStock(ctx, req.params.productId, req.body);
  await audit(req, {
    action: 'update',
    module: 'Product',
    entityName: `Batch ${batch.batchNumber}`,
    metadata: { manufacturing: { unbatchedToBatch: { productId: req.params.productId, ...batch } } },
  });
  res.status(httpStatus.CREATED).send(batch);
});

const bulkProductTracking = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const result = await productsService.bulkTracking(ctx, req.body);
  await audit(req, {
    action: 'update',
    module: 'Product',
    entityName: `${result.updated} product(s)`,
    metadata: { manufacturing: { bulkTracking: req.body } },
  });
  res.send(result);
});

const getProductStats = catchAsync(async (req, res) => {
  res.send(await productsService.getProductStats(readCtx(req), pick(req.query, PRODUCT_LIST_FILTERS)));
});

const getProductOverview = catchAsync(async (req, res) => {
  res.send(await productsService.getProductOverview(readCtx(req), req.params.productId));
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
  const bom = await bomService.getBom(readCtx(req), req.params.bomId);
  // Batch / expiry tracking of the product and every component (and alternative), so the
  // recipe shows which lines are issued by batch.
  const ids = [
    bom.productId,
    ...bom.components.flatMap((c) => [c.productId, ...(c.alternatives || []).map((a) => a.productId)]),
  ].filter(Boolean);
  const [tracking, product] = await Promise.all([
    productsService.trackingFor([...new Set(ids.map(String))]),
    Product.findById(bom.productId).select('shelfLifeDays').lean(),
  ]);
  res.send({
    ...bom.toJSON(),
    tracking: Object.fromEntries(tracking),
    productShelfLifeDays: (product && product.shelfLifeDays) || null,
  });
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

/** Several orders from one entry grid — check (read-only), then create all-or-nothing. */
const checkProductionOrderBatch = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const { rows, lines } = await productionOrderBatchService.checkBatch(ctx, req.body);
  res.send({ rows, lines });
});

const createProductionOrderBatch = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const orders = await productionOrderBatchService.createBatch(ctx, req.body);
  await Promise.all(
    orders.map((order) =>
      audit(req, {
        module: 'ProductionOrder',
        entity: order,
        entityName: orderLabel(order),
        metadata: { plannedQuantity: order.plannedQuantity, batch: orders.length },
      })
    )
  );
  res.status(httpStatus.CREATED).send({ orders });
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

// ── Material Issue Voucher (MIV) ──────────────────────────────────────────────────
/** Who may override which MIV warning (see materialIssueVoucher.service.js). */
const issuePermissions = async (req) => ({
  overIssueMaterials: await userHasPermission(req, 'overIssueMaterials'),
  manageManufacturingSettings: await userHasPermission(req, 'manageManufacturingSettings'),
  executeProduction: await userHasPermission(req, 'executeProduction'),
  manageProductionOrders: await userHasPermission(req, 'manageProductionOrders'),
});

/** Issuing for a finished good creates a production order — that needs its own permission. */
const assertCanCreateOrder = async (req) => {
  if (req.body.newOrder && !(await userHasPermission(req, 'manageProductionOrders'))) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      'Issuing for a finished good creates a production order — you need permission to manage production orders'
    );
  }
};

const getMaterialIssuePlan = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  res.send(await materialIssueVoucherService.planForProduct(ctx, req.query));
});

const getPendingMaterials = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  res.send(await byMaterialService.pendingMaterials(ctx, req.query));
});

const checkMaterialIssueByMaterial = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const permissions = await issuePermissions(req);
  const check = await byMaterialService.checkByMaterial(ctx, req.body);
  res.send({ ...materialIssueVoucherService.describeCheck(check, permissions), allocations: check.allocations });
});

const postMaterialIssueByMaterial = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const result = await byMaterialService.postByMaterial(ctx, req.body, await issuePermissions(req));
  await Promise.all(
    result.issues.map((issue) =>
      audit(req, {
        action: 'stock_adjust',
        module: 'MaterialIssue',
        entity: issue,
        entityName: `${issue.issueNumber} (${issue.orderNumber})`,
        metadata: {
          totalCost: issue.totalCost,
          lines: issue.lines.length,
          overIssue: issue.isOverIssue,
          byMaterial: true,
          overrides: (issue.overrides || []).map((o) => o.code),
        },
      })
    )
  );
  res.status(httpStatus.CREATED).send(result);
});

const getMaterialIssueReversal = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  res.send(await issueEditService.getReversalPreview(ctx, req.params.issueId));
});

const cancelMaterialIssue = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const issue = await issueEditService.cancelIssue(ctx, req.params.issueId, req.body);
  await audit(req, {
    action: 'delete',
    module: 'MaterialIssue',
    entity: issue,
    entityName: `${issue.issueNumber} (${issue.orderNumber}) cancelled`,
    metadata: { reason: req.body.reason, totalCost: issue.totalCost, cancelOrder: !!req.body.cancelOrder },
  });
  res.send(issue);
});

const editMaterialIssue = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const issue = await issueEditService.editIssue(ctx, req.params.issueId, req.body, await issuePermissions(req));
  const last = (issue.editHistory || [])[issue.editHistory.length - 1];
  await audit(req, {
    action: 'update',
    module: 'MaterialIssue',
    entity: issue,
    entityName: `${issue.issueNumber} (${issue.orderNumber})`,
    metadata: { kind: last && last.kind, summary: last && last.summary, totalCost: issue.totalCost },
  });
  res.send(issue);
});

const getMaterialUsage = catchAsync(async (req, res) => {
  res.send(await materialUsageService.getMaterialUsage(readCtx(req), req.query));
});

const checkMaterialIssue = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  await assertCanCreateOrder(req);
  const check = await materialIssueVoucherService.checkVoucher(ctx, req.body);
  res.send(materialIssueVoucherService.describeCheck(check, await issuePermissions(req)));
});

const postMaterialIssue = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  await assertCanCreateOrder(req);
  const issue = await materialIssueVoucherService.postVoucher(ctx, req.body, await issuePermissions(req));
  await audit(req, {
    action: 'stock_adjust',
    module: 'MaterialIssue',
    entity: issue,
    entityName: `${issue.issueNumber} (${issue.orderNumber})`,
    metadata: {
      totalCost: issue.totalCost,
      lines: issue.lines.length,
      overIssue: issue.isOverIssue,
      overrides: (issue.overrides || []).map((o) => o.code),
    },
  });
  res.status(httpStatus.CREATED).send(issue);
});

const getIssueLocations = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const settings = await settingsService.getSettings(ctx.organizationId);
  const locations = await materialIssueVoucherService.knownLocations(ctx, settings);
  res.send({
    locations: [...new Set(locations)].sort((a, b) => a.localeCompare(b)),
    defaultSourceLocation: settings.defaultSourceLocation,
    defaultWipLocation: settings.defaultWipLocation,
    allowNegativeStockIssue: !!settings.allowNegativeStockIssue,
    permissions: await issuePermissions(req),
  });
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

/**
 * After a receipt, inspection or rework result: completes the order if everything planned is
 * now in finished stock (setting `autoCompleteOrders`), audited like a manual completion.
 * Resolves to true when the order was completed.
 */
const autoComplete = async (req, ctx, orderId) => {
  const order = await executionService.autoCompleteIfDone(ctx, orderId);
  if (!order) return false;
  await audit(req, {
    action: 'status_change',
    module: 'ProductionOrder',
    entity: order,
    entityName: orderLabel(order),
    metadata: { status: order.status, note: 'Completed automatically', auto: true },
  });
  return true;
};

const reportOutput = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  if (req.body.qcMode === 'direct') {
    const settings = await settingsService.getSettings(ctx.organizationId);
    if (settings.requireQualityCheck && !(await userHasPermission(req, 'inspectProduction'))) {
      throw new ApiError(
        httpStatus.FORBIDDEN,
        'Quality checks are required — receiving straight to finished stock needs the inspection permission. Send it to QC instead.'
      );
    }
  }
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
      directReceipt: !!output.directReceipt,
    },
  });
  const orderCompleted = await autoComplete(req, ctx, req.params.orderId);
  res.status(httpStatus.CREATED).send({ ...output.toJSON(), orderCompleted });
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
  const orderCompleted = await autoComplete(req, ctx, output.productionOrderId);
  res.send({ ...output.toJSON(), orderCompleted });
});

const reverseOutput = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const pre = await executionService.getOutputOrderStatus(ctx, req.params.outputId);
  if (pre.orderStatus === 'completed' && !(await userHasPermission(req, 'manageProductionOrders'))) {
    throw new ApiError(
      httpStatus.FORBIDDEN,
      `${pre.orderNumber} is completed — reopening it to reverse a receipt needs the "manage production orders" permission`
    );
  }
  const { output, order } = await executionService.reverseOutput(ctx, req.params.outputId, req.body);
  await audit(req, {
    action: 'stock_adjust',
    module: 'ProductionOutput',
    entity: output,
    entityName: `${output.outputNumber} (${output.orderNumber}) reversed`,
    metadata: {
      reason: req.body.reason,
      produced: output.producedQuantity,
      good: output.goodQuantity,
      rejected: output.rejectedQuantity,
      previousStatus: output.reversal.previousStatus,
      reopenedOrder: output.reversal.reopenedOrder,
    },
  });
  if (output.reversal.reopenedOrder) {
    await audit(req, {
      action: 'status_change',
      module: 'ProductionOrder',
      entity: order,
      entityName: orderLabel(order),
      metadata: { status: order.status, note: `Reopened — ${output.outputNumber} reversed` },
    });
  }
  res.send({ ...output.toJSON(), orderStatus: order.status });
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
  const orderCompleted = await autoComplete(req, ctx, req.params.orderId);
  res.send({ ...result, orderCompleted });
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

// ── Order routing, costs, activity, documents (detail page) ────────────────────────
const addOrderOperation = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const order = await operationsService.addOperation(ctx, req.params.orderId, req.body);
  await audit(req, {
    action: 'update',
    module: 'ProductionOrder',
    entity: order,
    entityName: orderLabel(order),
    metadata: { operationAdded: req.body.name },
  });
  res.status(httpStatus.CREATED).send(order);
});

const updateOrderOperation = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  res.send(await operationsService.updateOperation(ctx, req.params.orderId, req.params.operationId, req.body));
});

const removeOrderOperation = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const order = await operationsService.removeOperation(ctx, req.params.orderId, req.params.operationId);
  await audit(req, {
    action: 'update',
    module: 'ProductionOrder',
    entity: order,
    entityName: orderLabel(order),
    metadata: { operationRemoved: req.params.operationId },
  });
  res.send(order);
});

const reorderOrderOperations = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  res.send(await operationsService.reorderOperations(ctx, req.params.orderId, req.body));
});

const orderOperationAction = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const order = await operationsService.operationAction(ctx, req.params.orderId, req.params.operationId, req.body);
  const op = order.operations.id(req.params.operationId);
  await audit(req, {
    action: 'update',
    module: 'ProductionOrder',
    entity: order,
    entityName: orderLabel(order),
    metadata: { operation: op && op.name, action: req.body.action },
  });
  res.send(order);
});

const getOrderCosts = catchAsync(async (req, res) => {
  res.send(await orderDetailService.getOrderCosts(readCtx(req), req.params.orderId));
});

const getOrderActivity = catchAsync(async (req, res) => {
  res.send(await orderDetailService.getOrderActivity(readCtx(req), req.params.orderId));
});

const addOrderDocumentLink = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const order = await orderDetailService.addDocumentLink(ctx, req.params.orderId, req.body);
  await audit(req, {
    action: 'update',
    module: 'ProductionOrder',
    entity: order,
    entityName: orderLabel(order),
    metadata: { documentAdded: req.body.title },
  });
  res.status(httpStatus.CREATED).send(order);
});

const uploadOrderDocument = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const order = await orderDetailService.uploadDocument(ctx, req.params.orderId, req.file, req.body);
  const doc = order.documents[order.documents.length - 1];
  await audit(req, {
    action: 'update',
    module: 'ProductionOrder',
    entity: order,
    entityName: orderLabel(order),
    metadata: { documentAdded: doc && doc.title, bytes: doc && doc.bytes },
  });
  res.status(httpStatus.CREATED).send(order);
});

const getOrderDocumentUrl = catchAsync(async (req, res) => {
  res.send(await orderDetailService.getDocumentUrl(readCtx(req), req.params.orderId, req.params.documentId));
});

const removeOrderDocument = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const canManage = await userHasPermission(req, 'manageProductionOrders');
  const order = await orderDetailService.removeDocument(ctx, req.params.orderId, req.params.documentId, { canManage });
  await audit(req, {
    action: 'update',
    module: 'ProductionOrder',
    entity: order,
    entityName: orderLabel(order),
    metadata: { documentRemoved: req.params.documentId },
  });
  res.send(order);
});

// ── Raw material receipts (RMV) ─────────────────────────────────────────────────────
const receiptLabel = (v) => `${v.voucherNumber}${v.supplierName ? ` — ${v.supplierName}` : ''}`;

const getMaterialReceipts = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['status', 'supplierId', 'search', 'dateFrom', 'dateTo']);
  res.send(await materialReceiptService.queryReceipts(readCtx(req), filter, listOptions(req)));
});

const getMaterialReceipt = catchAsync(async (req, res) => {
  res.send(await materialReceiptService.getReceipt(readCtx(req), req.params.receiptId));
});

const auditReceipt = (req, voucher, action) =>
  audit(req, {
    action,
    module: 'RawMaterialReceipt',
    entity: voucher,
    entityName: receiptLabel(voucher),
    metadata: {
      status: voucher.status,
      lines: voucher.lines.length,
      grandTotal: voucher.totals && voucher.totals.grandTotal,
      purchaseInvoiceNumber: voucher.purchaseInvoiceNumber || undefined,
    },
  });

const createMaterialReceipt = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const { confirm, ...body } = req.body;
  const voucher = confirm
    ? await materialReceiptService.saveAndConfirm(ctx, null, body)
    : await materialReceiptService.createReceipt(ctx, body);
  await auditReceipt(req, voucher, confirm ? 'confirm' : 'create');
  res.status(httpStatus.CREATED).send(voucher);
});

const updateMaterialReceipt = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const { confirm, ...body } = req.body;
  const voucher = confirm
    ? await materialReceiptService.saveAndConfirm(ctx, req.params.receiptId, body)
    : await materialReceiptService.updateReceipt(ctx, req.params.receiptId, body);
  await auditReceipt(req, voucher, confirm ? 'confirm' : 'update');
  res.send(voucher);
});

const confirmMaterialReceipt = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const voucher = await materialReceiptService.confirmReceipt(ctx, req.params.receiptId);
  await auditReceipt(req, voucher, 'confirm');
  res.send(voucher);
});

const deleteMaterialReceipt = catchAsync(async (req, res) => {
  const ctx = await writeCtx(req);
  const voucher = await materialReceiptService.getReceipt(ctx, req.params.receiptId);
  await materialReceiptService.deleteReceipt(ctx, req.params.receiptId);
  await auditReceipt(req, voucher, 'delete');
  res.status(httpStatus.NO_CONTENT).send();
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

const searchBatches = catchAsync(async (req, res) => {
  res.send(await batchReportsService.searchBatches(readCtx(req), req.query));
});

const getReport = catchAsync(async (req, res) => {
  res.send(await reportsService.getReport(readCtx(req), req.params.report, req.query));
});

const getWip = catchAsync(async (req, res) => {
  res.send(await executionService.getWip(readCtx(req)));
});

module.exports = {
  getReport,
  searchBatches,
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
  bulkProductTracking,
  batchUnbatchedStock,
  getAssemblies,
  getWhereUsed,
  getProductStats,
  getProductOverview,
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
  reverseOutput,
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
  getMaterialReceipts,
  getMaterialReceipt,
  createMaterialReceipt,
  updateMaterialReceipt,
  confirmMaterialReceipt,
  deleteMaterialReceipt,
  addOrderOperation,
  updateOrderOperation,
  removeOrderOperation,
  reorderOrderOperations,
  orderOperationAction,
  getOrderCosts,
  getOrderActivity,
  addOrderDocumentLink,
  uploadOrderDocument,
  getOrderDocumentUrl,
  removeOrderDocument,
  getOperators,
  checkMaterialIssue,
  getMaterialIssuePlan,
  getMaterialUsage,
  getMaterialIssueReversal,
  cancelMaterialIssue,
  editMaterialIssue,
  getPendingMaterials,
  checkMaterialIssueByMaterial,
  postMaterialIssueByMaterial,
  checkProductionOrderBatch,
  createProductionOrderBatch,
  postMaterialIssue,
  getIssueLocations,
  traceOrder,
  traceFinished,
  traceWhereUsed,
  traceLookup,
};
