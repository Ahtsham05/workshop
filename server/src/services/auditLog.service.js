const { AuditLog } = require('../models');
const logger = require('../config/logger');

/**
 * Computes the changed fields between two plain objects, restricted to `fields`
 * when given. Values are compared with JSON equality so nested objects/arrays work.
 * @returns {Array<{field, oldValue, newValue}>}
 */
const diffFields = (before = {}, after = {}, fields) => {
  const keys = fields && fields.length ? fields : [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changes = [];
  keys.forEach((field) => {
    const oldValue = before ? before[field] : undefined;
    const newValue = after ? after[field] : undefined;
    if (oldValue === undefined && newValue === undefined) return;
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({ field, oldValue: oldValue ?? null, newValue: newValue ?? null });
    }
  });
  return changes;
};

/**
 * Writes one audit trail entry. Never throws — a failure to log must not block the
 * business operation that triggered it; failures are written to the app logger instead.
 *
 * @param {Object} params
 * @param {Object} params.req - Express request (used for user/org/branch/IP context)
 * @param {string} params.action - create|update|delete|stock_adjust|permission_change|status_change
 * @param {string} params.module - e.g. 'Product', 'Invoice', 'Inventory'
 * @param {string|ObjectId} params.entityId
 * @param {string} [params.entityName]
 * @param {Object} [params.before] - Plain object of "old" field values (update/delete)
 * @param {Object} [params.after] - Plain object of "new" field values (create/update)
 * @param {string[]} [params.fields] - Restrict the diff to these fields; omit to diff everything
 * @param {Object} [params.metadata] - Extra free-form context
 */
const recordAuditLog = async ({ req, action, module, entityId, entityName, before, after, fields, metadata }) => {
  try {
    const changes = action === 'delete' ? [] : diffFields(before, after, fields);
    // For updates, skip the no-op write when nothing tracked actually changed.
    if (action === 'update' && changes.length === 0) return;

    await AuditLog.create({
      organizationId: req?.organizationId || req?.user?.organizationId,
      branchId: req?.branchId,
      userId: req?.user?.id || req?.user?._id,
      userName: req?.user?.name,
      userEmail: req?.user?.email,
      action,
      module,
      entityId,
      entityName,
      changes,
      metadata,
      ipAddress: req?.ip,
    });
  } catch (error) {
    logger.error(`Failed to write audit log for ${module}/${entityId}: ${error.message}`);
  }
};

/**
 * Query audit logs with pagination, scoped by org/branch and optional filters.
 * @param {Object} filter - Mongo filter (organizationId/branchId already applied by caller)
 * @param {Object} options - sortBy/limit/page
 */
const queryAuditLogs = async (filter, options) => {
  const populate = [{ path: 'userId', select: 'name email' }];
  return AuditLog.paginate(filter, { ...options, sortBy: options.sortBy || 'createdAt:desc', populate });
};

/** Distinct module names that currently have audit entries — feeds the filter dropdown. */
const getAuditModules = async (filter = {}) => AuditLog.distinct('module', filter);

module.exports = {
  recordAuditLog,
  queryAuditLogs,
  getAuditModules,
  diffFields,
};
