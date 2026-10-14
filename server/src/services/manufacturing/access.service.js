const httpStatus = require('http-status');
const config = require('../../config/config');
const { normalizeBusinessType } = require('../../config/businessTypes');
const { Organization } = require('../../models');
const ApiError = require('../../utils/ApiError');

/**
 * Who may use the Manufacturing module — one rule, used by the API gate and reported to
 * the client (sidebar, pages, product forms) through GET /manufacturing/access:
 *
 *   1. the organization's business type is Manufacturing ('factory'), and
 *   2. when MANUFACTURING_ALLOWED_EMAILS is set, the user's email is on that list
 *      (a rollout gate — leave it empty to open the module to every manufacturing org).
 *
 * Testers (MANUFACTURING_TESTER_EMAILS) skip both: they see the module in any business
 * type, so it can be developed and tested from an existing account.
 *
 * The business type is cached briefly per organization so the gate costs no extra query
 * on most requests; a change in Settings takes effect within a minute.
 */

const CACHE_MS = 60 * 1000;
const businessTypeCache = new Map();

const orgBusinessType = async (organizationId) => {
  const key = String(organizationId || '');
  if (!key) return null;
  const hit = businessTypeCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;
  const org = await Organization.findById(organizationId).select('businessType').lean();
  const value = org ? normalizeBusinessType(org.businessType) : null;
  businessTypeCache.set(key, { value, expires: Date.now() + CACHE_MS });
  return value;
};

/**
 * @returns {{ enabled: boolean, reason: null | 'business_type' | 'not_invited', via?: 'tester' }}
 */
const resolveAccess = async ({
  user,
  organizationId,
  allowedEmails = config.manufacturing.allowedEmails,
  testerEmails = config.manufacturing.testerEmails,
}) => {
  const login = String((user && user.email) || '')
    .trim()
    .toLowerCase();
  if (login && testerEmails.includes(login)) return { enabled: true, reason: null, via: 'tester' };
  const businessType = await orgBusinessType(organizationId || (user && user.organizationId));
  if (businessType !== 'factory') return { enabled: false, reason: 'business_type' };
  if (allowedEmails.length) {
    const email = String((user && user.email) || '')
      .trim()
      .toLowerCase();
    if (!allowedEmails.includes(email)) return { enabled: false, reason: 'not_invited' };
  }
  return { enabled: true, reason: null };
};

const MESSAGES = {
  business_type: 'Manufacturing is available when the organization’s business type is Manufacturing',
  not_invited: 'Manufacturing is not enabled for this account yet',
};

/** Express middleware: 403 unless the current user may use Manufacturing. */
const requireManufacturingAccess = async (req, res, next) => {
  try {
    const access = await resolveAccess({ user: req.user, organizationId: req.organizationId });
    if (!access.enabled) {
      const err = new ApiError(httpStatus.FORBIDDEN, MESSAGES[access.reason]);
      err.errorCode = 'MANUFACTURING_DISABLED';
      err.details = { reason: access.reason };
      return next(err);
    }
    return next();
  } catch (error) {
    return next(error);
  }
};

/** After an organization's business type changes (or in tests): forget the cached value. */
const clearAccessCache = (organizationId) => {
  if (organizationId) businessTypeCache.delete(String(organizationId));
  else businessTypeCache.clear();
};

module.exports = { resolveAccess, requireManufacturingAccess, clearAccessCache };
