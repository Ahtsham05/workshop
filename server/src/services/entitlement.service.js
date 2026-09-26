/**
 * Entitlements — the single place that answers "may this organization do X?".
 *
 * Every answer is a decision object:
 *   { allowed: true }
 *   { allowed: false, status, code, reason, details }
 * so routes, services and the UI all get the same machine-readable code and human reason.
 * `assert*` variants throw the denial as an ApiError (see toApiError) for use in services.
 *
 * Rules (see services/billing/subscriptionState.js for the time-based part):
 *  - An org in read-only mode (lapsed trial/plan) can view and export everything but cannot
 *    create or change records. Customers are never locked out of their own data.
 *  - A module missing from the plan blocks writes; reads stay open for data modules and
 *    closed for computed ones (MODULES[x].readableWhenLocked).
 *  - Users / branches / invoices-per-month limits block creating more; nothing existing is
 *    removed or hidden when usage is above a limit (e.g. after a downgrade).
 */
const httpStatus = require('http-status');
const { Organization, User, Branch, Invoice } = require('../models');
const ApiError = require('../utils/ApiError');
const { MODULES, FEATURE_TO_MODULE, MANUAL_PAYMENT_COUNTRIES } = require('../config/billing');
const { toBusinessCalendarDate, startOfBusinessDay } = require('../utils/businessTimezone');
const planService = require('./billing/plan.service');
const billingSettingsService = require('./billing/billingSettings.service');
const { resolveState } = require('./billing/subscriptionState');

const ALLOW = Object.freeze({ allowed: true });

const deny = (status, code, reason, details = {}) => ({ allowed: false, status, code, reason, details });

/** Turn a denial into the ApiError the global error handler renders as { code, message, errorCode, details }. */
const toApiError = (decision) => {
  const err = new ApiError(decision.status, decision.reason);
  err.errorCode = decision.code;
  err.details = decision.details;
  return err;
};

const assertAllowed = (decision) => {
  if (!decision.allowed) throw toApiError(decision);
  return decision;
};

// ── Country / payment routing ────────────────────────────────────────────────

/**
 * The organization's country, as set in Settings → Business Profile / Localization
 * (Organization.countryCode). Billing has no country of its own — one country per business,
 * so payment routing can never disagree with the tax / currency setup.
 * Falls back to the free-text `country` for orgs created before countryCode existed.
 */
const getBillingCountry = (org) => {
  if (org.countryCode && /^[A-Z]{2}$/i.test(org.countryCode)) return org.countryCode.toUpperCase();
  if (org.country && /pakistan/i.test(org.country)) return 'PK';
  return null;
};

/**
 * Payment routing follows the organization's country, never the visitor's IP.
 * Pakistan: manual (PKR) by default, card also allowed. Everyone else: card only.
 * @returns {{ country, allowed: ('manual'|'polar')[], default: 'manual'|'polar'|null }}
 */
const getPaymentRouting = (org) => {
  const country = getBillingCountry(org);
  if (!country) return { country: null, allowed: [], default: null };
  if (MANUAL_PAYMENT_COUNTRIES.includes(country)) return { country, allowed: ['manual', 'polar'], default: 'manual' };
  return { country, allowed: ['polar'], default: 'polar' };
};

// ── Loading ──────────────────────────────────────────────────────────────────────────

/**
 * Resolve an organization's entitlement at `now`.
 * @param {ObjectId|Object} orgOrId organization id, or an already-loaded org (lean) with subscription
 */
const getEntitlement = async (orgOrId, { now = new Date() } = {}) => {
  const org =
    orgOrId && orgOrId.subscription !== undefined
      ? orgOrId
      : await Organization.findById(orgOrId)
          .select('name owner email subscription countryCode country')
          .lean();
  if (!org) throw new ApiError(httpStatus.NOT_FOUND, 'Organization not found');

  const settings = await billingSettingsService.getSettings();
  const state = resolveState(org.subscription, now, settings);
  // A plan key that no longer exists (deleted/renamed in the DB) must not unlock anything.
  const plan = (await planService.getPlan(state.planKey)) || {
    key: state.planKey,
    name: state.planKey,
    limits: { maxUsers: 0, maxBranches: 0, maxInvoicesPerMonth: 0 },
    modules: [],
  };
  return { organizationId: org._id, org, plan, state, settings, now };
};

// ── Usage ────────────────────────────────────────────────────────────────────────────

/** First instant of the current calendar month in business time (Asia/Karachi). */
const startOfBusinessMonth = (now = new Date()) => startOfBusinessDay(`${toBusinessCalendarDate(now).slice(0, 7)}-01`);

/** Users that count toward the plan: active staff logins (student/parent portal users excluded). */
const countBillableUsers = (organizationId) =>
  User.countDocuments({ organizationId, isActive: true, schoolRole: { $nin: ['student', 'parent'] } });

const countActiveBranches = (organizationId) => Branch.countDocuments({ organizationId, isActive: true });

/** Sales invoices created this business month — quotations, drafts and demo data excluded. */
const countInvoicesThisMonth = (organizationId, now = new Date()) =>
  Invoice.countDocuments({
    organizationId,
    createdAt: { $gte: startOfBusinessMonth(now) },
    type: { $ne: 'quotation' },
    status: { $ne: 'draft' },
    isDemo: { $ne: true },
  });

const getUsage = async (organizationId, { now = new Date() } = {}) => {
  const [users, branches, invoicesThisMonth] = await Promise.all([
    countBillableUsers(organizationId),
    countActiveBranches(organizationId),
    countInvoicesThisMonth(organizationId, now),
  ]);
  return { users, branches, invoicesThisMonth };
};

// ── Decisions (pure, given an entitlement) ───────────────────────────────────────────

const readOnlyReason = (ent) => {
  const planName = ent.state.planKey === 'trial' ? 'free trial' : `${ent.plan.name} plan`;
  return (
    `Your ${planName} has ended, so the account is read-only. You can still view and export all your data. ` +
    'Renew your plan to create or change records.'
  );
};

const canWrite = (ent) =>
  ent.state.mode === 'full'
    ? ALLOW
    : deny(httpStatus.PAYMENT_REQUIRED, 'SUBSCRIPTION_READ_ONLY', readOnlyReason(ent), {
        status: ent.state.status,
        planKey: ent.state.planKey,
      });

/**
 * @param {string} moduleOrFeature a module key (config/billing MODULES) or a legacy feature key
 * @param {{ write?: boolean }} opts write=false asks "may they *view* this module's data?"
 */
const canUseModuleSync = (ent, moduleOrFeature, { write = true } = {}) => {
  const module = MODULES[moduleOrFeature] ? moduleOrFeature : FEATURE_TO_MODULE[moduleOrFeature];
  if (!module) {
    return deny(httpStatus.FORBIDDEN, 'MODULE_UNKNOWN', `Unknown module "${moduleOrFeature}".`);
  }
  if (write) {
    const writable = canWrite(ent);
    if (!writable.allowed) return writable;
  }
  if (ent.plan.modules.includes(module)) return ALLOW;
  if (!write && MODULES[module].readableWhenLocked) return ALLOW;
  return deny(
    httpStatus.FORBIDDEN,
    'MODULE_NOT_IN_PLAN',
    `${MODULES[module].label} is not included in your ${ent.plan.name} plan. Upgrade to use it.`,
    { module, planKey: ent.plan.key }
  );
};

const limitDecision = (ent, limitKey, used, code, noun) => {
  const writable = canWrite(ent);
  if (!writable.allowed) return writable;
  const max = ent.plan.limits[limitKey];
  if (max === -1 || used < max) return ALLOW;
  return deny(
    httpStatus.FORBIDDEN,
    code,
    `Your ${ent.plan.name} plan allows ${max} ${noun}. You have ${used}. Upgrade your plan to add more.`,
    { limit: limitKey, max, used, planKey: ent.plan.key }
  );
};

// ── Public async API (load + decide) ─────────────────────────────────────────────────

const withRequiredPlan = async (decision) => {
  if (decision.allowed || decision.code !== 'MODULE_NOT_IN_PLAN') return decision;
  const required = await planService.cheapestPlanWithModule(decision.details.module);
  if (!required) return decision;
  return {
    ...decision,
    reason: decision.reason.replace('Upgrade to use it.', `Upgrade to ${required.name} to use it.`),
    details: { ...decision.details, requiredPlan: required.key },
  };
};

const canUseModule = async (organizationId, moduleOrFeature, opts = {}) => {
  const ent = await getEntitlement(organizationId, opts);
  return withRequiredPlan(canUseModuleSync(ent, moduleOrFeature, opts));
};

const canAddUser = async (organizationId, opts = {}) => {
  const ent = await getEntitlement(organizationId, opts);
  return limitDecision(ent, 'maxUsers', await countBillableUsers(ent.organizationId), 'LIMIT_USERS', 'user(s)');
};

const canAddBranch = async (organizationId, opts = {}) => {
  const ent = await getEntitlement(organizationId, opts);
  return limitDecision(ent, 'maxBranches', await countActiveBranches(ent.organizationId), 'LIMIT_BRANCHES', 'branch(es)');
};

const canCreateInvoice = async (organizationId, opts = {}) => {
  const ent = await getEntitlement(organizationId, opts);
  const used = await countInvoicesThisMonth(ent.organizationId, ent.now);
  return limitDecision(ent, 'maxInvoicesPerMonth', used, 'LIMIT_INVOICES', 'invoices per month');
};

const canWriteAsync = async (organizationId, opts = {}) => canWrite(await getEntitlement(organizationId, opts));

const assertCanWrite = async (organizationId, opts) => assertAllowed(await canWriteAsync(organizationId, opts));
const assertCanUseModule = async (organizationId, m, opts) => assertAllowed(await canUseModule(organizationId, m, opts));
const assertCanAddUser = async (organizationId, opts) => assertAllowed(await canAddUser(organizationId, opts));
const assertCanAddBranch = async (organizationId, opts) => assertAllowed(await canAddBranch(organizationId, opts));
const assertCanCreateInvoice = async (organizationId, opts) => assertAllowed(await canCreateInvoice(organizationId, opts));

/** Everything the billing page / client feature gates need, in one payload. */
const getSummary = async (organizationId, opts = {}) => {
  const ent = await getEntitlement(organizationId, opts);
  const usage = await getUsage(ent.organizationId, { now: ent.now });
  const pendingPlan = ent.state.pendingPlanKey ? await planService.getPlan(ent.state.pendingPlanKey) : null;
  return {
    plan: {
      key: ent.plan.key,
      name: ent.plan.name,
      priceUsdMonthly: ent.plan.priceUsdMonthly,
      limits: ent.plan.limits,
      modules: ent.plan.modules,
    },
    status: ent.state.status,
    mode: ent.state.mode,
    paymentSource: ent.state.paymentSource,
    currentPeriodStart: ent.state.currentPeriodStart,
    currentPeriodEnd: ent.state.currentPeriodEnd,
    graceEndsAt: ent.state.graceEndsAt,
    daysRemaining: ent.state.daysRemaining,
    cancelAtPeriodEnd: ent.state.cancelAtPeriodEnd,
    pendingPlan: pendingPlan
      ? { key: pendingPlan.key, name: pendingPlan.name, effectiveAt: ent.state.pendingPlanEffectiveAt }
      : null,
    usage,
    routing: getPaymentRouting(ent.org),
    readOnlyReason: ent.state.mode === 'readOnly' ? readOnlyReason(ent) : null,
  };
};

module.exports = {
  // routing
  getBillingCountry,
  getPaymentRouting,
  // loading / usage
  getEntitlement,
  getUsage,
  startOfBusinessMonth,
  countBillableUsers,
  countActiveBranches,
  countInvoicesThisMonth,
  // pure decisions
  canWrite,
  canUseModuleSync,
  limitDecision,
  withRequiredPlan,
  // async decisions
  canUseModule,
  canAddUser,
  canAddBranch,
  canCreateInvoice,
  canWriteAsync,
  assertAllowed,
  assertCanWrite,
  assertCanUseModule,
  assertCanAddUser,
  assertCanAddBranch,
  assertCanCreateInvoice,
  toApiError,
  getSummary,
};
