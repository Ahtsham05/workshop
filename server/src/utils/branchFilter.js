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

module.exports = { applyBranchFilter, getBranchContext };
