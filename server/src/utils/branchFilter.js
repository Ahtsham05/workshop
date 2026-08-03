const httpStatus = require('http-status');
const ApiError = require('./ApiError');
const { Membership } = require('../models');

/**
 * Applies organization and branch filters to a Mongoose query object.
 * Every controller should call this before passing `filter` to a service.
 *
 * Usage:
 *   const filter = pick(req.query, ['name']);
 *   applyBranchFilter(filter, req);
 *   const result = await someService.querySomething(filter, options);
 *
 * @param {Object} filter  - Mongoose filter object (modified in-place)
 * @param {Object} req     - Express request, expects req.organizationId and req.branchId
 * @returns {Object} The same filter object with org/branch constraints added
 */
const applyBranchFilter = (filter, req) => {
  if (req.organizationId) {
    filter.organizationId = req.organizationId;
  }
  if (req.branchId) {
    filter.branchId = req.branchId;
  }
  return filter;
};

/**
 * Returns the branch context fields to merge into a new document body.
 * Call this when creating any document to embed org/branch/createdBy automatically.
 *
 * Usage:
 *   const doc = await Model.create({ ...req.body, ...getBranchContext(req) });
 *
 * @param {Object} req
 * @returns {{ organizationId, branchId, createdBy }}
 */
const getBranchContext = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
  createdBy: req.user ? req.user.id : undefined,
});

/**
 * Ensures req.branchId is set before creating a document whose schema requires one
 * (Product, Supplier, Customer, ...). branchScope() only sets req.branchId when the
 * client sends an x-branch-id header, and leaves it unset otherwise so read-only routes
 * can legitimately serve org-wide data to superAdmins. A create request has no such
 * "org-wide" option — the document needs one concrete branch home — so this fills in the
 * user's own default (or first) branch membership instead of letting Mongoose's
 * `required: true` throw a raw ValidationError. Covers the common client race where a
 * write happens before the branch switcher's auto-select-on-login effect has resolved.
 *
 * Usage: call before getBranchContext(req) in any create controller, e.g.
 *   await resolveWriteBranchId(req);
 *   const product = await productService.createProduct({ ...req.body, ...getBranchContext(req) });
 *
 * @param {Object} req - Express request; expects req.user
 * @returns {Promise<string>} the resolved branch id
 */
const resolveWriteBranchId = async (req) => {
  if (req.branchId) return req.branchId;
  if (!req.user) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Branch ID is required (x-branch-id header)');
  }
  const membership = await Membership.findOne({ userId: req.user.id, isActive: true }).sort({ createdAt: 1 });
  if (!membership) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      'No branch is available for your account — ask an admin to add you to a branch.'
    );
  }
  req.branchId = String(membership.branchId);
  return req.branchId;
};

module.exports = { applyBranchFilter, getBranchContext, resolveWriteBranchId };
