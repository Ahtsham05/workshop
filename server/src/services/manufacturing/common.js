const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../../utils/ApiError');
const { startOfBusinessDay, toBusinessCalendarDate } = require('../../utils/businessTimezone');

/** Quantities keep 6 decimals (fractional units like kg/m are normal in manufacturing). */
// `+ 0` turns -0 (a tiny negative rounded) into 0, which would otherwise print as "-0".
const roundQty = (value) => Math.round((Number(value) || 0) * 1e6) / 1e6 + 0;
const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100 + 0;

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

/**
 * Per-line validation problems of an entry grid (RMV, MIV): one 400 with errorCode
 * ROW_ERRORS and details.rows = [{ line, field, message }] so each shows on its row.
 */
class RowErrors {
  constructor() {
    this.rows = [];
  }

  add(line, field, message) {
    this.rows.push({ line, field, message });
  }

  throwIfAny(summary = 'Some lines need attention') {
    if (!this.rows.length) return;
    const err = new ApiError(httpStatus.BAD_REQUEST, `${summary}: ${this.rows[0].message} (line ${this.rows[0].line})`);
    err.errorCode = 'ROW_ERRORS';
    err.details = { rows: this.rows };
    throw err;
  }
}

const DAY_MS = 86400000;

/** 00:00 today in the business timezone (ms) — a batch whose expiry is before it has expired. */
const startOfBusinessToday = () => startOfBusinessDay(toBusinessCalendarDate(new Date())).getTime();

/** Whole calendar days from today to `date` (0 = expires today, negative = expired), or null. */
const daysUntil = (date, today = startOfBusinessToday()) =>
  date ? Math.floor((new Date(date).getTime() - today) / DAY_MS) : null;

module.exports = {
  startOfBusinessToday,
  daysUntil,
  roundQty,
  roundMoney,
  requireBranch,
  scopeFilter,
  aggregateScope,
  escapeRegex,
  idOf,
  parseDateRange,
  RowErrors,
};
