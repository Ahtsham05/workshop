const crypto = require('crypto');
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const config = require('../config/config');
const { Organization } = require('../models');
const entitlementService = require('../services/entitlement.service');
const planService = require('../services/billing/plan.service');
const billingSettingsService = require('../services/billing/billingSettings.service');
const billingAudit = require('../services/billing/billingAudit.service');
const manualPaymentService = require('../services/billing/manualPayment.service');
const polarService = require('../services/billing/polar.service');
const polarWebhookService = require('../services/billing/polarWebhook.service');
const billingSchedulerService = require('../services/billing/billingScheduler.service');
const { applySubscriptionPatch } = require('../services/billing/subscriptionWriter');
const { comparePlans, findLimitOverages } = require('../services/billing/subscriptionState');

/** The org loaded (once) by the entitlement middleware for this request. */
const requestOrg = async (req) => (await req.entitlementPromise).org;

const orgIdOf = (req) => req.user.organizationId;

const isOwner = (org, user) => String(org.owner) === String(user._id || user.id);

// ── Customer ─────────────────────────────────────────────────────────────────────────

/** Everything the billing page and client-side feature gates need. Any org member may read it. */
const getSummary = catchAsync(async (req, res) => {
  if (!orgIdOf(req)) throw new ApiError(httpStatus.BAD_REQUEST, 'Complete onboarding first.');
  const org = await Organization.findById(orgIdOf(req))
    .select('name owner email subscription countryCode country')
    .lean();
  const [summary, plans, settings] = await Promise.all([
    entitlementService.getSummary(org),
    planService.listPlans({ publicOnly: true }),
    billingSettingsService.getSettings(),
  ]);
  const cardByPlan = summary.routing.allowed.includes('polar') ? await polarService.cardAvailability(plans) : {};
  const { priceInPkr } = manualPaymentService;
  res.send({
    ...summary,
    isOwner: isOwner(org, req.user),
    hasCardSubscription: polarService.hasLivePolarSubscription(org),
    pkrPerUsd: settings.pkrPerUsd,
    plans: plans.map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description,
      badge: p.badge,
      priceUsdMonthly: p.priceUsdMonthly,
      pricePkrMonthly: priceInPkr(p, 1, settings.pkrPerUsd).amountPkr,
      limits: p.limits,
      modules: p.modules,
      cardAvailable: Boolean(cardByPlan[p.key]),
    })),
  });
});

/** Before a plan change: which direction it is, when it takes effect, and usage overages. */
const previewPlanChange = catchAsync(async (req, res) => {
  const org = await requestOrg(req);
  const ent = await entitlementService.getEntitlement(org);
  const target = await planService.getPurchasablePlanOrThrow(req.body.planKey);
  const direction = comparePlans(ent.plan, target);
  const paidTimeLeft = ent.state.planKey !== 'trial' && ent.state.mode === 'full' && ent.state.currentPeriodEnd > new Date();
  const warnings = direction === 'downgrade' ? findLimitOverages(target, await entitlementService.getUsage(org._id)) : [];
  res.send({
    direction,
    from: { key: ent.plan.key, name: ent.plan.name },
    to: { key: target.key, name: target.name },
    effectiveAt: direction === 'downgrade' && paidTimeLeft ? ent.state.currentPeriodEnd : new Date(),
    warnings,
  });
});

const createCheckout = catchAsync(async (req, res) => {
  const org = await requestOrg(req);
  const routing = entitlementService.getPaymentRouting(org);
  if (!routing.allowed.includes('polar')) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Set your billing country before paying by card.');
  }
  res.status(httpStatus.CREATED).send(await polarService.createCheckout({ org, user: req.user, planKey: req.body.planKey }));
});

const createPortalSession = catchAsync(async (req, res) => {
  res.send(await polarService.createPortalSession({ org: await requestOrg(req) }));
});

const changePolarPlan = catchAsync(async (req, res) => {
  const org = await requestOrg(req);
  const usage = await entitlementService.getUsage(org._id);
  res.send(await polarService.changePlan({ org, user: req.user, planKey: req.body.planKey, usage }));
});

const createManualIntent = catchAsync(async (req, res) => {
  const org = await requestOrg(req);
  res
    .status(httpStatus.CREATED)
    .send(
      await manualPaymentService.createIntent({ org, user: req.user, planKey: req.body.planKey, months: req.body.months })
    );
});

const submitManualPayment = catchAsync(async (req, res) => {
  const org = await requestOrg(req);
  const payment = await manualPaymentService.submit({ org, user: req.user, body: req.body, file: req.file });
  const json = payment.toJSON();
  delete json.proof;
  delete json.transactionIdNorm;
  res.status(httpStatus.CREATED).send(json);
});

const listMyManualPayments = catchAsync(async (req, res) => {
  res.send(await manualPaymentService.listForOrg(orgIdOf(req), req.query));
});

// ── Polar webhook & cron ─────────────────────────────────────────────────────────────

const polarWebhook = catchAsync(async (req, res) => {
  const result = await polarWebhookService.ingest({ rawBody: req.body, headers: req.headers });
  res.status(httpStatus.ACCEPTED).send({ received: true, duplicate: result.duplicate });
});

const safeEqual = (a, b) => {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
};

/** For hosts without a long-running process (e.g. Vercel Cron). 404 unless a secret is set. */
const runCron = catchAsync(async (req, res) => {
  const secret = config.billing.cronSecret;
  if (!secret) throw new ApiError(httpStatus.NOT_FOUND, 'Not found');
  if (!safeEqual(req.get('x-cron-secret') || '', secret)) throw new ApiError(httpStatus.UNAUTHORIZED, 'Invalid cron secret');
  res.send(await billingSchedulerService.runOnce());
});

// ── Platform admin ───────────────────────────────────────────────────────────────────

const adminListManualPayments = catchAsync(async (req, res) => {
  res.send(await manualPaymentService.adminList(req.query));
});

const adminGetManualPayment = catchAsync(async (req, res) => {
  res.send(await manualPaymentService.adminGet(req.params.paymentId));
});

const adminApprove = catchAsync(async (req, res) => {
  res.send(await manualPaymentService.approve({ id: req.params.paymentId, admin: req.user }));
});

const adminReject = catchAsync(async (req, res) => {
  res.send(await manualPaymentService.reject({ id: req.params.paymentId, admin: req.user, reason: req.body.reason }));
});

const adminGetSettings = catchAsync(async (req, res) => {
  res.send(await billingSettingsService.getSettings());
});

const adminUpdateSettings = catchAsync(async (req, res) => {
  const { before, after } = await billingSettingsService.updateSettings(req.body, req.user._id);
  const changed = Object.keys(req.body);
  await billingAudit.record({
    ...billingAudit.actorFromUser(req.user, 'admin'),
    action: 'settings.updated',
    from: Object.fromEntries(changed.map((k) => [k, before[k]])),
    to: Object.fromEntries(changed.map((k) => [k, after[k]])),
  });
  res.send(after);
});

const adminListPlans = catchAsync(async (req, res) => {
  res.send(await planService.listPlans());
});

const adminUpdatePlan = catchAsync(async (req, res) => {
  const { before, after } = await planService.updatePlan(req.params.key, req.body);
  const changed = Object.keys(req.body);
  await billingAudit.record({
    ...billingAudit.actorFromUser(req.user, 'admin'),
    action: 'plan_config.updated',
    from: Object.fromEntries(changed.map((k) => [k, before[k]])),
    to: Object.fromEntries(changed.map((k) => [k, after[k]])),
    meta: { planKey: req.params.key },
  });
  res.send(after);
});

/** Manual override (enterprise deals, goodwill extensions, support fixes) — always audited. */
const adminOverrideSubscription = catchAsync(async (req, res) => {
  const org = await Organization.findById(req.params.orgId).select('name owner email subscription').lean();
  if (!org) throw new ApiError(httpStatus.NOT_FOUND, 'Organization not found');
  const { note, ...fields } = req.body;
  if (fields.planType) await planService.getPlanOrThrow(fields.planType);
  const patch = { ...fields, graceEndsAt: null };
  if (fields.planType || fields.status === 'active') patch.paymentSource = org.subscription?.paymentSource || 'manual';
  const updated = await applySubscriptionPatch({
    org,
    patch,
    audit: { ...billingAudit.actorFromUser(req.user, 'admin'), action: 'subscription.admin_override', meta: { note } },
  });
  res.send(updated.subscription);
});

const adminAudit = catchAsync(async (req, res) => {
  const filter = req.query.organizationId ? { organizationId: req.query.organizationId } : {};
  res.send(await billingAudit.list(filter, { page: req.query.page, limit: req.query.limit }));
});

module.exports = {
  getSummary,
  previewPlanChange,
  createCheckout,
  createPortalSession,
  changePolarPlan,
  createManualIntent,
  submitManualPayment,
  listMyManualPayments,
  polarWebhook,
  runCron,
  adminListManualPayments,
  adminGetManualPayment,
  adminApprove,
  adminReject,
  adminGetSettings,
  adminUpdateSettings,
  adminListPlans,
  adminUpdatePlan,
  adminOverrideSubscription,
  adminAudit,
};
