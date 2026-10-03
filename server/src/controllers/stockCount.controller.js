const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { stockCountService, auditLogService } = require('../services');
const { getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');
const { userHasAnyPermission } = require('../middlewares/permission');
const { STOCK_COUNT_PERMISSIONS } = require('../config/stockCountPermissions');

const canApprove = (req) => userHasAnyPermission(req.user, STOCK_COUNT_PERMISSIONS.approve);
// Same rule as the product catalog: cost belongs to roles that manage products or purchasing.
const canViewCost = (req) =>
  userHasAnyPermission(req.user, ['viewProducts', 'approveStockCounts', 'editProducts', 'viewPurchases', 'createPurchases']);

const context = async (req) => {
  await resolveWriteBranchId(req);
  return getBranchContext(req);
};

const getPlan = catchAsync(async (req, res) => {
  const { organizationId, branchId } = await context(req);
  res.send(await stockCountService.getCyclePlan({ organizationId, branchId }));
});

const getPlanItems = catchAsync(async (req, res) => {
  const { organizationId, branchId } = await context(req);
  const items = await stockCountService.getPlanItems({ organizationId, branchId });
  const showCost = await canViewCost(req);
  res.send(showCost ? items : items.map(({ unitCost, score, ...rest }) => rest));
});

const getCategories = catchAsync(async (req, res) => {
  const { organizationId, branchId } = await context(req);
  res.send(await stockCountService.getCategories({ organizationId, branchId }));
});

const getPolicy = catchAsync(async (req, res) => {
  const { organizationId, branchId } = await context(req);
  res.send(await stockCountService.getPolicy({ organizationId, branchId }));
});

const updatePolicy = catchAsync(async (req, res) => {
  const { organizationId, branchId, createdBy } = await context(req);
  res.send(await stockCountService.updatePolicy({ organizationId, branchId, body: req.body, updatedBy: createdBy }));
});

const setOverride = catchAsync(async (req, res) => {
  const { organizationId, branchId, createdBy } = await context(req);
  res.send(await stockCountService.setOverride({ organizationId, branchId, ...req.body, updatedBy: createdBy }));
});

const getCounts = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const filter = pick(req.query, ['status', 'type']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  res.send(await stockCountService.queryCounts({ organizationId, branchId, ...filter }, options));
});

const createCount = catchAsync(async (req, res) => {
  const { organizationId, branchId, createdBy } = await context(req);
  // Counting staff may start the day's scheduled cycle count; choosing what to count
  // (and especially an unannounced audit) is a manager's call.
  if (req.body.type !== 'cycle' && !(await canApprove(req))) {
    res.status(httpStatus.FORBIDDEN).send({ code: httpStatus.FORBIDDEN, message: 'Only a manager can start this kind of count' });
    return;
  }
  const { count, skippedOpen } = await stockCountService.createCount({ organizationId, branchId, createdBy, body: req.body });
  await auditLogService.recordAuditLog({
    req,
    action: 'create',
    module: 'StockCount',
    entityId: count._id,
    entityName: count.number,
    metadata: { type: count.type, items: count.totals.itemCount, blind: count.blind },
  });
  res.status(httpStatus.CREATED).send({ ...count.toJSON(), skippedOpen });
});

const getCount = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  res.send(
    await stockCountService.getCount({ organizationId, branchId, countId: req.params.countId, canViewCost: await canViewCost(req) })
  );
});

const recordCounts = catchAsync(async (req, res) => {
  const { organizationId, branchId, createdBy } = getBranchContext(req);
  const lines = await stockCountService.recordCounts({
    organizationId,
    branchId,
    countId: req.params.countId,
    entries: req.body.entries,
    userId: createdBy,
    canApprove: await canApprove(req),
    canViewCost: await canViewCost(req),
  });
  res.send({ lines });
});

const addLines = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const added = await stockCountService.addLines({ organizationId, branchId, countId: req.params.countId, itemKeys: req.body.itemKeys });
  res.send({ added });
});

const submitCount = catchAsync(async (req, res) => {
  const { organizationId, branchId, createdBy } = getBranchContext(req);
  res.send(await stockCountService.submitCount({ organizationId, branchId, countId: req.params.countId, userId: createdBy }));
});

const recount = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  res.send(await stockCountService.requestRecount({ organizationId, branchId, countId: req.params.countId, lineIds: req.body.lineIds }));
});

const postCount = catchAsync(async (req, res) => {
  const { organizationId, branchId, createdBy } = getBranchContext(req);
  const { count, failed } = await stockCountService.postCount({
    organizationId,
    branchId,
    countId: req.params.countId,
    userId: createdBy,
    uncountedPolicy: req.body.uncountedPolicy,
  });
  await auditLogService.recordAuditLog({
    req,
    action: 'stock_adjust',
    module: 'StockCount',
    entityId: count._id,
    entityName: count.number,
    metadata: {
      type: count.type,
      counted: count.totals.countedCount,
      variances: count.totals.varianceCount,
      gainValue: count.totals.gainValue,
      lossValue: count.totals.lossValue,
      failed,
    },
  });
  res.send({ count, failed });
});

const cancelCount = catchAsync(async (req, res) => {
  const { organizationId, branchId, createdBy } = getBranchContext(req);
  res.send(
    await stockCountService.cancelCount({ organizationId, branchId, countId: req.params.countId, userId: createdBy, reason: req.body.reason })
  );
});

const getReports = catchAsync(async (req, res) => {
  const { organizationId, branchId } = await context(req);
  res.send(
    await stockCountService.getReports({ organizationId, branchId, ...pick(req.query, ['startDate', 'endDate']), canViewCost: await canViewCost(req) })
  );
});

const getProductHistory = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  res.send(await stockCountService.getProductHistory({ organizationId, branchId, productId: req.params.productId }));
});

module.exports = {
  getPlan,
  getPlanItems,
  getCategories,
  getPolicy,
  updatePolicy,
  setOverride,
  getCounts,
  createCount,
  getCount,
  recordCounts,
  addLines,
  submitCount,
  recount,
  postCount,
  cancelCount,
  getReports,
  getProductHistory,
};
