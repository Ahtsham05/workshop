/**
 * Route-level entitlement enforcement — thin wrappers over services/entitlement.service.js.
 * Services that create quota'd records (invoices, users, branches) ALSO assert on their own,
 * so paths that bypass routes (AI assistant actions, desktop sync, imports) are covered too.
 */
const httpStatus = require('http-status');
const passport = require('passport');
const ApiError = require('../utils/ApiError');
const entitlementService = require('../services/entitlement.service');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const isSystemAdmin = (req) => req.user && req.user.systemRole === 'system_admin';

/** One entitlement load per request, shared by every middleware that needs it. */
const loadEntitlement = (req) => {
  if (!req.entitlementPromise) {
    req.entitlementPromise = entitlementService.getEntitlement(req.user.organizationId);
  }
  return req.entitlementPromise;
};

/** Skip checks for callers that have no organization context (system admins, pre-onboarding users). */
const bypass = (req) => isSystemAdmin(req) || !req.user || !req.user.organizationId;

/** Block mutating requests while the org is read-only. Reads always pass. */
const requireWritable = async (req, res, next) => {
  try {
    if (SAFE_METHODS.has(req.method) || bypass(req)) return next();
    const decision = entitlementService.canWrite(await loadEntitlement(req));
    return decision.allowed ? next() : next(entitlementService.toApiError(decision));
  } catch (err) {
    return next(err);
  }
};

/**
 * Gate a route behind a plan module. Accepts a module key or a legacy feature key
 * (e.g. 'repair' → mobile_shop). GETs only require the module to be *readable*, so an org
 * that downgraded can still open the records it created while it had the module.
 */
const requireModule = (moduleOrFeature) => async (req, res, next) => {
  try {
    if (bypass(req)) return next();
    const ent = await loadEntitlement(req);
    const write = !SAFE_METHODS.has(req.method);
    const decision = await entitlementService.withRequiredPlan(
      entitlementService.canUseModuleSync(ent, moduleOrFeature, { write })
    );
    return decision.allowed ? next() : next(entitlementService.toApiError(decision));
  } catch (err) {
    return next(err);
  }
};

const QUOTA_CHECKS = {
  user: entitlementService.canAddUser,
  branch: entitlementService.canAddBranch,
  invoice: entitlementService.canCreateInvoice,
};

/** Put on the route that creates a quota'd record (fails fast before body processing). */
const requireQuota = (kind) => {
  const check = QUOTA_CHECKS[kind];
  if (!check) throw new Error(`Unknown quota kind "${kind}"`);
  return async (req, res, next) => {
    try {
      if (bypass(req)) return next();
      const decision = await check(await loadEntitlement(req).then((e) => e.org));
      return decision.allowed ? next() : next(entitlementService.toApiError(decision));
    } catch (err) {
      return next(err);
    }
  };
};

/**
 * Mutations that stay allowed in read-only mode: they change the user's own session/profile
 * or mark things as read — they do not create business records.
 * AI assistant chat is allowed (asking questions about your data is viewing it); its
 * confirm-action endpoint, which performs writes, is not.
 */
const READ_ONLY_EXEMPT = [
  /^\/users\/me(\/|$)/,
  /^\/notifications(\/|$)/,
  /^\/whatsapp-cloud\/conversations\/[^/]+\/read$/,
  /^\/ai-assistant\/conversations(\/[^/]+)?(\/messages(\/stream)?)?$/,
  /^\/ai-assistant\/conversations\/[^/]+\/messages\/[^/]+\/cancel-action$/,
];

/**
 * Populate req.user from the JWT if one is valid, without rejecting anything — the route's
 * own auth() still decides 401/403 (and skips re-authenticating because req.user is set).
 */
const softAuthenticate = (req, res) =>
  new Promise((resolve) => {
    if (req.user) return resolve();
    passport.authenticate('jwt', { session: false }, (err, user) => {
      if (!err && user) req.user = user;
      resolve();
    })(req, res, () => resolve());
  });

/**
 * Global gate for business routes. Replaces the old trialGuard + enforceTrialStatus pair,
 * which ran before any route's auth() — so req.user was never set there and lapsed orgs
 * were in fact never blocked server-side (only the client redirected them).
 */
const readOnlyGate = async (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (READ_ONLY_EXEMPT.some((re) => re.test(req.path))) return next();
  await softAuthenticate(req, res);
  return requireWritable(req, res, next);
};

/** Only the organization owner may pay, change plans or open the billing portal. */
const requireOrgOwner = async (req, res, next) => {
  try {
    if (!req.user || !req.user.organizationId) {
      return next(new ApiError(httpStatus.BAD_REQUEST, 'Complete onboarding before managing billing.'));
    }
    const ent = await loadEntitlement(req);
    if (String(ent.org.owner) !== String(req.user._id || req.user.id)) {
      const err = new ApiError(httpStatus.FORBIDDEN, 'Only the organization owner can manage billing.');
      err.errorCode = 'NOT_ORG_OWNER';
      return next(err);
    }
    return next();
  } catch (err) {
    return next(err);
  }
};

module.exports = {
  requireWritable,
  requireModule,
  requireQuota,
  readOnlyGate,
  requireOrgOwner,
  READ_ONLY_EXEMPT,
};
