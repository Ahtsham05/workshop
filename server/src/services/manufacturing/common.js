const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../../utils/ApiError');

/** Quantities keep 6 decimals (fractional units like kg/m are normal in manufacturing). */
const roundQty = (value) => Math.round((Number(value) || 0) * 1e6) / 1e6;
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Every manufacturing write belongs to exactly one branch (products are branch-scoped). */
const requireBranch = (branchId) => {
  if (!branchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Select a branch first — manufacturing records belong to a branch.');
  }
  return branchId;
};

/** The org (+ branch when one is selected) filter every manufacturing read starts from. */
const scopeFilter = ({ organizationId, branchId }) => ({
  organizationId,
  ...(branchId ? { branchId } : {}),
});

/** Same as scopeFilter, cast to ObjectIds — aggregate() pipelines don't auto-cast like find(). */
const aggregateScope = ({ organizationId, branchId }) => ({
  organizationId: new mongoose.Types.ObjectId(String(organizationId)),
  ...(branchId ? { branchId: new mongoose.Types.ObjectId(String(branchId)) } : {}),
});

const escapeRegex = (value) => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const idOf = (value) => {
  if (!value) return null;
  return value._id ? String(value._id) : String(value);
};

const parseDateRange = (dateFrom, dateTo, field) => {
  if (!dateFrom && !dateTo) return {};
  const range = {};
  if (dateFrom) range.$gte = new Date(dateFrom);
  if (dateTo) {
    const end = new Date(dateTo);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return { [field]: range };
};

module.exports = { roundQty, roundMoney, requireBranch, scopeFilter, aggregateScope, escapeRegex, idOf, parseDateRange };
