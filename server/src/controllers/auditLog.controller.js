const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { auditLogService } = require('../services');
const { applyBranchFilter } = require('../utils/branchFilter');

const getAuditLogs = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['module', 'action', 'userId', 'entityId']);
  applyBranchFilter(filter, req);

  if (req.query.search) {
    const escaped = String(req.query.search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ entityName: { $regex: escaped, $options: 'i' } }, { userName: { $regex: escaped, $options: 'i' } }];
  }

  if (req.query.dateFrom || req.query.dateTo) {
    filter.createdAt = {};
    if (req.query.dateFrom) filter.createdAt.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) filter.createdAt.$lte = new Date(req.query.dateTo);
  }

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await auditLogService.queryAuditLogs(filter, options);
  res.send(result);
});

const getAuditModules = catchAsync(async (req, res) => {
  const filter = {};
  applyBranchFilter(filter, req);
  const modules = await auditLogService.getAuditModules(filter);
  res.send(modules);
});

module.exports = {
  getAuditLogs,
  getAuditModules,
};
