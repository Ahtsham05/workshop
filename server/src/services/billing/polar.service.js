/**
 * Polar (merchant of record for card payments). Server-side only — the browser is sent to
 * Polar's hosted checkout / customer portal and is never trusted to report a payment.
 * Entitlement changes come from verified webhooks (or from Polar API responses fetched
 * server-to-server), and are written through subscriptionWriter like manual approvals.
 */
const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Polar } = require('@polar-sh/sdk');
const { Organization, User } = require('../../models');
const ApiError = require('../../utils/ApiError');
const config = require('../../config/config');
const logger = require('../../config/logger');
const planService = require('./plan.service');
const billingAudit = require('./billingAudit.service');
const { applySubscriptionPatch } = require('./subscriptionWriter');
const { comparePlans, findLimitOverages, hasPaidTimeLeft } = require('./subscriptionState');
const entitlementService = require('../entitlement.service');

let client = null;

/** Lazily built so the app boots (and tests run) without Polar credentials. */
const getClient = () => {
  if (!config.billing.polar.accessToken) {
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Card payments are not configured yet. Please try again later.');
  }
  if (!client) client = new Polar({ accessToken: config.billing.polar.accessToken, server: config.billing.polar.server });
  return client;
};

/** Test hook: inject a fake Polar client. */
const setClientForTests = (fake) => {
  client = fake;
};

const polarServer = () => config.billing.polar.server;

/**
 * A loggable summary of a Polar API error: status plus the failing field names and error
 * types from a 422 — never the echoed request inputs (they contain customer emails etc.).
 */
const summarizePolarError = (err) => {
  const status = err.statusCode ? ` ${err.statusCode}` : '';
  let detail = [];
  try {
    detail = JSON.parse(err.body || err.body$ || '{}').detail || [];
  } catch (e) {
    detail = [];
  }
  const fields = Array.isArray(detail)
    ? [...new Set(detail.map((d) => `${(d.loc || []).slice(-1)[0]}:${d.type}`))].join(', ')
    : '';
  return `${err.name || 'Error'}${status}${fields ? ` [${fields}]` : ''}`;
};

/** Surface a safe message to the client; log a summary without request data. */
const wrapPolarError = (err, action) => {
  if (err instanceof ApiError) return err;
  logger.error(`Polar ${action} failed: ${summarizePolarError(err)}`);
  return new ApiError(httpStatus.BAD_GATEWAY, `Could not ${action} with the payment provider. Please try again.`);
};

/** Did Polar reject the checkout only because of the prefilled customer email? */
const isCustomerEmailRejection = (err) => {
  if (err.statusCode !== 422) return false;
  try {
    const detail = JSON.parse(err.body || err.body$ || '{}').detail || [];
    return detail.some((d) => (d.loc || []).includes('customer_email') && d.type === 'value_error');
  } catch (e) {
    return false;
  }
};

/** True when the org has a Polar subscription that is still billing (not ended/revoked). */
const hasLivePolarSubscription = (org) => {
  const sub = org.subscription || {};
  return Boolean(
    sub.paymentSource === 'polar' &&
      sub.polar?.subscriptionId &&
      ['active', 'pastDue', 'canceled', 'gracePeriod'].includes(sub.status)
  );
};

// ── Plan ↔ Polar product linking ─────────────────────────────────────────────────────

/**
 * Products in Polar are tagged with metadata.planKey (createPolarProducts.js does this).
 * When a plan has no stored product id for the current Polar environment — e.g. the plans
 * collection was seeded before the link script ran — look the tagged product up once, save
 * the id on the plan, and carry on. Cached so the billing page never waits on Polar twice.
 */
const CATALOG_TTL_MS = 10 * 60 * 1000;
let catalogCache = { at: 0, server: null, byPlanKey: null };

let catalogInFlight = null;

const fetchTaggedProducts = async () => {
  const byPlanKey = new Map();
  const pages = await getClient().products.list({ limit: 100, isArchived: false });
  // eslint-disable-next-line no-restricted-syntax
  for await (const page of pages) {
    page.result.items.forEach((product) => {
      const key = product.metadata?.planKey;
      if (key && product.isRecurring && !byPlanKey.has(key)) byPlanKey.set(key, product.id);
    });
  }
  return byPlanKey;
};

/** Cached, and concurrent callers share one in-flight Polar request. */
const loadTaggedProducts = async () => {
  const server = polarServer();
  if (catalogCache.byPlanKey && catalogCache.server === server && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.byPlanKey;
  }
  if (!catalogInFlight) {
    catalogInFlight = fetchTaggedProducts()
      .then((byPlanKey) => {
        catalogCache = { at: Date.now(), server, byPlanKey };
        return byPlanKey;
      })
      .finally(() => {
        catalogInFlight = null;
      });
  }
  return catalogInFlight;
};

/** Test hook. */
const resetProductCatalogCache = () => {
  catalogCache = { at: 0, server: null, byPlanKey: null };
  catalogInFlight = null;
};

/**
 * The plan's Polar product id for the configured environment, linking it on the fly if the
 * plan has none yet. Returns null when card payments are not configured or no tagged product
 * exists — callers treat that as "card not available for this plan".
 */
const resolveProductId = async (plan) => {
  const stored = planService.polarProductIdFor(plan, polarServer());
  if (stored) return stored;
  if (!config.billing.polar.accessToken) return null;
  try {
    const productId = (await loadTaggedProducts()).get(plan.key) || null;
    if (productId) {
      await planService.linkPolarProduct(plan.key, polarServer(), productId);
      logger.info(`Linked plan "${plan.key}" to Polar ${polarServer()} product ${productId}`);
    }
    return productId;
  } catch (err) {
    logger.error(`Polar product lookup failed: ${summarizePolarError(err)}`);
    return null;
  }
};

/** plan key → card available?, for every plan passed (one Polar call at most, cached). */
const cardAvailability = async (plans) => {
  const entries = await Promise.all(plans.map(async (p) => [p.key, Boolean(await resolveProductId(p))]));
  return Object.fromEntries(entries);
};

/**
 * Which plan does this Polar product belong to? Stored ids first; otherwise the product's own
 * metadata.planKey, which Polar includes in every subscription payload.
 */
const planForProduct = async (productId, product) => {
  const stored = await planService.findPlanByPolarProductId(productId, polarServer());
  if (stored) return stored;
  const key = product?.metadata?.planKey;
  if (!key || product?.id !== productId) return null;
  const plan = await planService.getPlan(key);
  if (plan) await planService.linkPolarProduct(plan.key, polarServer(), productId);
  return plan;
};

// ── Checkout / portal / plan change ──────────────────────────────────────────────────

const createCheckout = async ({ org, user, planKey, now = new Date() }) => {
  const plan = await planService.getPurchasablePlanOrThrow(planKey);
  // A card subscription starts billing immediately. If the org already paid manually for
  // time that hasn't run out, a checkout now would charge twice for the same period (and the
  // card period would replace the longer manual one). They can switch once it ends — the
  // grace period is the natural moment.
  const { state } = await entitlementService.getEntitlement(org, { now });
  if (state.paymentSource === 'manual' && hasPaidTimeLeft(state, now)) {
    const until = new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'Asia/Karachi',
    }).format(state.currentPeriodEnd);
    const err = new ApiError(
      httpStatus.CONFLICT,
      `Your plan is already paid by bank / wallet until ${until}. You can switch to card payment when that period ends.`
    );
    err.errorCode = 'MANUAL_TIME_REMAINING';
    err.details = { paidUntil: state.currentPeriodEnd };
    throw err;
  }
  const productId = await resolveProductId(plan);
  if (!productId) {
    const err = new ApiError(
      httpStatus.SERVICE_UNAVAILABLE,
      `Card payment for the ${plan.name} plan isn't available right now. Please pay by bank transfer or try again later.`
    );
    err.errorCode = 'CARD_NOT_AVAILABLE';
    throw err;
  }
  if (hasLivePolarSubscription(org) && org.subscription.status !== 'canceled') {
    const err = new ApiError(
      httpStatus.CONFLICT,
      'You already have a card subscription. Change plan instead of buying a new one.'
    );
    err.errorCode = 'POLAR_SUBSCRIPTION_EXISTS';
    throw err;
  }

  const owner = await User.findById(user._id || user.id)
    .select('email name')
    .lean();
  const base = config.billing.frontendUrl;
  const request = {
    products: [productId],
    externalCustomerId: String(org._id),
    customerEmail: owner?.email || undefined,
    customerName: org.name,
    metadata: { organizationId: String(org._id), planKey: plan.key },
    successUrl: `${base}/settings/billing?checkout=success&checkout_id={CHECKOUT_ID}`,
    returnUrl: `${base}/settings/billing?checkout=canceled`,
  };
  let checkout;
  try {
    checkout = await getClient().checkouts.create(request);
  } catch (err) {
    // Polar validates that the email's domain accepts mail. The email is only a prefill, so
    // if that is the sole problem, let the customer type it on Polar's page instead.
    if (!isCustomerEmailRejection(err)) throw wrapPolarError(err, 'start checkout');
    try {
      checkout = await getClient().checkouts.create({ ...request, customerEmail: undefined });
    } catch (retryErr) {
      throw wrapPolarError(retryErr, 'start checkout');
    }
  }
  await billingAudit.record({
    organizationId: org._id,
    ...billingAudit.actorFromUser(user),
    action: 'polar.checkout_created',
    meta: { planKey: plan.key, checkoutId: checkout.id },
  });
  return { url: checkout.url, checkoutId: checkout.id };
};

const createPortalSession = async ({ org }) => {
  if (!org.subscription?.polar?.customerId) {
    const err = new ApiError(httpStatus.CONFLICT, 'There is no card billing account for this organization yet.');
    err.errorCode = 'NO_POLAR_CUSTOMER';
    throw err;
  }
  try {
    const session = await getClient().customerSessions.create({
      externalCustomerId: String(org._id),
      returnUrl: `${config.billing.frontendUrl}/settings/billing`,
    });
    return { url: session.customerPortalUrl };
  } catch (err) {
    throw wrapPolarError(err, 'open the billing portal');
  }
};

// ── Webhook → entitlement sync ───────────────────────────────────────────────────────

const toObjectIdOrNull = (value) => (value && mongoose.Types.ObjectId.isValid(value) ? String(value) : null);

const orgIdFromSubscription = (sub) =>
  toObjectIdOrNull(sub.metadata?.organizationId) || toObjectIdOrNull(sub.customer?.externalId);

/**
 * Map a Polar subscription status to ours. Returns null for states that must not change
 * entitlements at all (checkout never completed).
 */
const mapPolarStatus = (sub, now = new Date()) => {
  switch (sub.status) {
    case 'active':
    case 'trialing':
      return sub.cancelAtPeriodEnd ? 'canceled' : 'active';
    case 'past_due':
      return 'pastDue';
    case 'canceled':
      // Polar sets 'canceled' once the subscription has actually ended.
      return sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now && !sub.endedAt ? 'canceled' : 'expired';
    case 'unpaid':
    case 'paused':
      return 'expired';
    default:
      return null; // incomplete, incomplete_expired
  }
};

/**
 * Apply a Polar subscription object (from a verified webhook or a server-side API fetch) to
 * the organization it belongs to. Idempotent and order-safe: a state older than the last one
 * applied is ignored.
 * @returns {Promise<{ applied: boolean, reason?: string, organizationId?: string }>}
 */
const syncSubscription = async (sub, { revoked = false, now = new Date() } = {}) => {
  const organizationId = orgIdFromSubscription(sub);
  if (!organizationId) return { applied: false, reason: 'no organization reference on subscription' };
  const org = await Organization.findById(organizationId).select('name owner email subscription').lean();
  if (!org) return { applied: false, reason: 'organization not found', organizationId };

  const status = revoked ? 'expired' : mapPolarStatus(sub, now);
  if (!status) return { applied: false, reason: `ignored Polar status ${sub.status}`, organizationId };

  const current = org.subscription || {};
  const isCurrentSubscription = current.polar?.subscriptionId === sub.id;
  // An old/other Polar subscription ending must not override the org's current access
  // (e.g. they re-subscribed, or moved to manual payment).
  if (!isCurrentSubscription && current.polar?.subscriptionId && !['active', 'pastDue'].includes(status)) {
    return { applied: false, reason: 'event for a non-current Polar subscription', organizationId };
  }

  const plan = await planForProduct(sub.productId, sub.product);
  if (!plan) {
    logger.error(`Polar product ${sub.productId} is not mapped to any plan (org ${organizationId})`);
    return { applied: false, reason: `unmapped Polar product ${sub.productId}`, organizationId };
  }
  const pendingPlan = sub.pendingUpdate?.productId ? await planForProduct(sub.pendingUpdate.productId, null) : null;

  const version = new Date(sub.modifiedAt || sub.createdAt || now);
  const patch = {
    planType: plan.key,
    status,
    paymentSource: 'polar',
    currentPeriodStart: sub.currentPeriodStart ? new Date(sub.currentPeriodStart) : null,
    currentPeriodEnd: sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null,
    graceEndsAt: null,
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
    pendingPlanType: pendingPlan ? pendingPlan.key : null,
    pendingPlanEffectiveAt: pendingPlan ? new Date(sub.pendingUpdate.appliesAt) : null,
    'polar.customerId': sub.customerId,
    'polar.subscriptionId': sub.id,
    'polar.productId': sub.productId,
    'polar.status': sub.status,
    'polar.lastSyncedAt': version,
  };
  if (status === 'expired' && sub.endedAt) patch.currentPeriodEnd = new Date(sub.endedAt);

  // Out-of-order guard: only apply if nothing newer for the same subscription was applied.
  const guard = isCurrentSubscription
    ? { $or: [{ 'subscription.polar.lastSyncedAt': null }, { 'subscription.polar.lastSyncedAt': { $lte: version } }] }
    : {};
  const updated = await applySubscriptionPatch({
    org,
    patch,
    guard,
    now,
    audit: {
      actorType: 'polar',
      actorLabel: 'Polar webhook',
      action: 'polar.subscription_synced',
      meta: { polarSubscriptionId: sub.id, polarStatus: sub.status, revoked },
    },
  });
  if (!updated) return { applied: false, reason: 'stale event (newer state already applied)', organizationId };
  return { applied: true, organizationId };
};

/**
 * Handle one verified, parsed Polar event (SDK camelCase model).
 * @returns {Promise<{ status: 'processed'|'ignored', organizationId?: string, note?: string }>}
 */
const handleEvent = async (event) => {
  switch (event.type) {
    case 'subscription.created':
    case 'subscription.updated':
    case 'subscription.active':
    case 'subscription.canceled':
    case 'subscription.uncanceled':
    case 'subscription.past_due':
    case 'subscription.revoked': {
      const result = await syncSubscription(event.data, { revoked: event.type === 'subscription.revoked' });
      return {
        status: result.applied ? 'processed' : 'ignored',
        organizationId: result.organizationId,
        note: result.reason,
      };
    }
    case 'order.paid': {
      const order = event.data;
      const organizationId =
        toObjectIdOrNull(order.metadata?.organizationId) || toObjectIdOrNull(order.customer?.externalId);
      if (organizationId) {
        await billingAudit.record({
          organizationId,
          actorType: 'polar',
          actorLabel: 'Polar webhook',
          action: 'polar.order_paid',
          meta: {
            orderId: order.id,
            invoiceNumber: order.invoiceNumber,
            billingReason: order.billingReason,
            totalAmount: order.totalAmount,
            currency: order.currency,
            subscriptionId: order.subscriptionId,
          },
        });
      }
      // A paid renewal/upgrade must extend access even if its subscription.updated delivery
      // is late or lost: fetch the subscription server-to-server and sync it.
      if (order.subscriptionId && config.billing.polar.accessToken) {
        const sub = await getClient().subscriptions.get({ id: order.subscriptionId });
        const result = await syncSubscription(sub);
        return { status: 'processed', organizationId: result.organizationId || organizationId, note: result.reason };
      }
      return { status: organizationId ? 'processed' : 'ignored', organizationId };
    }
    default:
      return { status: 'ignored', note: `unhandled event type ${event.type}` };
  }
};

/**
 * Change an existing Polar subscription's plan. Upgrades apply immediately (Polar invoices the
 * prorated difference now); downgrades are scheduled by Polar for the next period.
 * The returned subscription comes straight from Polar's API, so it is applied immediately
 * (the webhook that follows is then a no-op or a newer state).
 */
const changePlan = async ({ org, user, planKey, usage }) => {
  if (!hasLivePolarSubscription(org)) {
    throw new ApiError(httpStatus.CONFLICT, 'There is no active card subscription to change.');
  }
  const target = await planService.getPurchasablePlanOrThrow(planKey);
  const current = await planService.getPlan(org.subscription.planType);
  const direction = comparePlans(current, target);
  if (direction === 'same') throw new ApiError(httpStatus.BAD_REQUEST, `You are already on the ${target.name} plan.`);
  const productId = await resolveProductId(target);
  if (!productId)
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, `Card payment for ${target.name} isn't available right now.`);

  let sub;
  try {
    sub = await getClient().subscriptions.update({
      id: org.subscription.polar.subscriptionId,
      subscriptionUpdate: { productId, prorationBehavior: direction === 'upgrade' ? 'invoice' : 'next_period' },
    });
  } catch (err) {
    throw wrapPolarError(err, 'change your plan');
  }
  await syncSubscription(sub);
  await billingAudit.record({
    organizationId: org._id,
    ...billingAudit.actorFromUser(user),
    action: direction === 'upgrade' ? 'plan.changed' : 'plan.downgrade_scheduled',
    from: { planType: current?.key },
    to: { planType: target.key },
    meta: { paymentSource: 'polar', polarSubscriptionId: sub.id },
  });
  return {
    direction,
    effectiveAt: direction === 'upgrade' ? new Date() : sub.pendingUpdate?.appliesAt || sub.currentPeriodEnd,
    warnings: direction === 'downgrade' && usage ? findLimitOverages(target, usage) : [],
  };
};

module.exports = {
  summarizePolarError,
  resolveProductId,
  cardAvailability,
  resetProductCatalogCache,
  getClient,
  setClientForTests,
  hasLivePolarSubscription,
  mapPolarStatus,
  syncSubscription,
  handleEvent,
  createCheckout,
  createPortalSession,
  changePlan,
};
