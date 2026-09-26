/**
 * Periodic billing work. Access decisions never wait for this (entitlement.service resolves
 * time-based state on every request) — the scheduler persists those transitions, applies
 * scheduled downgrades, sends reminder / grace / read-only emails, and retries failed webhooks.
 *
 * Safe to run from several processes at once: every write is a conditional update on the
 * exact state it read, so only one process wins a given transition or reminder — and only
 * the winner sends the email.
 */
const { Organization } = require('../../models');
const logger = require('../../config/logger');
const planService = require('./plan.service');
const billingSettingsService = require('./billingSettings.service');
const billingEmail = require('./billingEmail.service');
const billingAudit = require('./billingAudit.service');
const polarWebhookService = require('./polarWebhook.service');
const { applySubscriptionPatch } = require('./subscriptionWriter');
const { resolveState, DAY_MS } = require('./subscriptionState');

const BATCH = 200;
// Transitions for periods that ended longer ago than this are persisted silently (no email):
// they are long-lapsed accounts, not news to anyone.
const EMAIL_FRESHNESS_MS = 30 * DAY_MS;

const ORG_FIELDS = 'name owner email subscription';

/** Manual orgs whose scheduled downgrade date has arrived. (Polar applies its own.) */
const applyDueDowngrades = async (now) => {
  let applied = 0;
  const orgs = await Organization.find({
    'subscription.paymentSource': 'manual',
    'subscription.pendingPlanType': { $ne: null },
    'subscription.pendingPlanEffectiveAt': { $lte: now },
  })
    .select(ORG_FIELDS)
    .limit(BATCH)
    .lean();
  // eslint-disable-next-line no-restricted-syntax
  for (const org of orgs) {
    const { pendingPlanType, pendingPlanEffectiveAt } = org.subscription;
    // eslint-disable-next-line no-await-in-loop
    const updated = await applySubscriptionPatch({
      org,
      now,
      patch: {
        planType: pendingPlanType,
        pendingPlanType: null,
        pendingPlanEffectiveAt: null,
        currentPeriodStart: pendingPlanEffectiveAt,
      },
      guard: {
        'subscription.pendingPlanType': pendingPlanType,
        'subscription.pendingPlanEffectiveAt': pendingPlanEffectiveAt,
      },
      audit: { actorType: 'system', actorLabel: 'billing scheduler', action: 'plan.downgrade_applied' },
    });
    if (updated) applied += 1;
  }
  return applied;
};

/** Persist status changes resolveState() reports (active → grace → expired, trial → expired). */
const persistTransitions = async (now, settings) => {
  let changed = 0;
  const orgs = await Organization.find({
    'subscription.status': { $in: ['trialing', 'active', 'pastDue', 'gracePeriod', 'canceled', 'pending'] },
    $or: [
      { 'subscription.currentPeriodEnd': { $lte: now } },
      // Pre-migration documents only carry the legacy endDate.
      { 'subscription.currentPeriodEnd': null, 'subscription.endDate': { $lte: now } },
      { 'subscription.status': 'pending' },
    ],
  })
    .select(ORG_FIELDS)
    .limit(BATCH)
    .lean();

  // eslint-disable-next-line no-restricted-syntax
  for (const org of orgs) {
    const stored = org.subscription;
    const state = resolveState(stored, now, settings);
    if (state.status === stored.status && (state.status !== 'gracePeriod' || stored.graceEndsAt)) continue; // eslint-disable-line no-continue

    const patch = { status: state.status };
    // Normalize pre-migration docs on the way (legacy plan keys, endDate → currentPeriodEnd).
    if (stored.planType !== state.planKey && !state.pendingPlanDue) patch.planType = state.planKey;
    if (!stored.currentPeriodEnd && state.currentPeriodEnd) patch.currentPeriodEnd = state.currentPeriodEnd;
    if (!stored.paymentSource && state.paymentSource) patch.paymentSource = state.paymentSource;
    if (state.status === 'gracePeriod' || state.status === 'pastDue') patch.graceEndsAt = state.graceEndsAt;
    // eslint-disable-next-line no-await-in-loop
    const updated = await applySubscriptionPatch({
      org,
      now,
      patch,
      guard: { 'subscription.status': stored.status, 'subscription.currentPeriodEnd': stored.currentPeriodEnd ?? null },
    });
    if (!updated) continue; // eslint-disable-line no-continue
    changed += 1;

    const fresh = state.currentPeriodEnd && now.getTime() - state.currentPeriodEnd.getTime() < EMAIL_FRESHNESS_MS;
    if (!fresh || stored.status === state.status) continue; // eslint-disable-line no-continue
    // eslint-disable-next-line no-await-in-loop
    const plan = await planService.getPlan(state.planKey);
    const planName = state.planKey === 'trial' ? 'free trial' : plan?.name || state.planKey;
    // Polar customers get Polar's own dunning emails while past due / in grace.
    if (state.status === 'gracePeriod' && state.paymentSource === 'manual') {
      billingEmail.gracePeriodStarted(org, planName, state.graceEndsAt);
    } else if (state.status === 'expired') {
      billingEmail.becameReadOnly(org, planName);
    }
  }
  return changed;
};

/**
 * Renewal reminders (default 7 and 3 days before expiry) for manual subscriptions — they
 * never renew automatically — and trial-ending reminders. Only the most urgent due reminder
 * is sent, and all reminders it supersedes are marked sent with it.
 */
const sendReminders = async (now, settings) => {
  const days = [...(settings.reminderDays || [])].filter((d) => d > 0).sort((a, b) => b - a);
  if (!days.length) return 0;
  let sent = 0;
  const orgs = await Organization.find({
    $or: [
      { 'subscription.status': 'active', 'subscription.paymentSource': 'manual' },
      { 'subscription.status': 'trialing' },
    ],
    'subscription.currentPeriodEnd': { $gt: now, $lte: new Date(now.getTime() + days[0] * DAY_MS) },
  })
    .select(ORG_FIELDS)
    .limit(BATCH)
    .lean();

  // eslint-disable-next-line no-restricted-syntax
  for (const org of orgs) {
    const periodEnd = org.subscription.currentPeriodEnd;
    const daysLeft = Math.ceil((periodEnd.getTime() - now.getTime()) / DAY_MS);
    const due = days.filter((d) => daysLeft <= d);
    const already =
      org.subscription.reminders?.periodEnd?.getTime() === periodEnd.getTime() ? org.subscription.reminders.sentDays : [];
    if (!due.length || due.every((d) => already.includes(d))) continue; // eslint-disable-line no-continue

    const sentDays = [...new Set([...already, ...due])].sort((a, b) => b - a);
    // Claim: match the exact reminder state we read, so if two processes race only one
    // records (and sends) this reminder.
    const stateFilter = already.length
      ? { 'subscription.reminders.periodEnd': periodEnd, 'subscription.reminders.sentDays': already }
      : {
          $or: [
            { 'subscription.reminders.periodEnd': { $ne: periodEnd } },
            { 'subscription.reminders.sentDays': { $size: 0 } },
          ],
        };
    // eslint-disable-next-line no-await-in-loop
    const claim = await Organization.updateOne(
      { _id: org._id, 'subscription.currentPeriodEnd': periodEnd, ...stateFilter },
      { $set: { 'subscription.reminders.periodEnd': periodEnd, 'subscription.reminders.sentDays': sentDays } }
    );
    if (!claim.modifiedCount) continue; // eslint-disable-line no-continue
    sent += 1;

    const isTrial = org.subscription.status === 'trialing';
    // eslint-disable-next-line no-await-in-loop
    const plan = await planService.getPlan(org.subscription.planType);
    if (isTrial) billingEmail.trialEndingReminder(org, periodEnd, daysLeft);
    else billingEmail.renewalReminder(org, plan?.name || org.subscription.planType, periodEnd, daysLeft);
    // eslint-disable-next-line no-await-in-loop
    await billingAudit.record({
      organizationId: org._id,
      actorType: 'system',
      actorLabel: 'billing scheduler',
      action: 'reminder.sent',
      meta: { daysLeft, periodEnd, kind: isTrial ? 'trial' : 'renewal' },
    });
  }
  return sent;
};

/** One full pass. Returns counts for logs / the cron endpoint response. */
const runOnce = async ({ now = new Date() } = {}) => {
  const settings = await billingSettingsService.getSettings();
  const result = { downgradesApplied: 0, transitions: 0, reminders: 0, webhooksRetried: 0 };
  const steps = [
    ['downgradesApplied', () => applyDueDowngrades(now)],
    ['transitions', () => persistTransitions(now, settings)],
    ['reminders', () => sendReminders(now, settings)],
    ['webhooksRetried', () => polarWebhookService.retryPending({ now })],
  ];
  // eslint-disable-next-line no-restricted-syntax
  for (const [key, step] of steps) {
    try {
      // eslint-disable-next-line no-await-in-loop
      result[key] = await step();
    } catch (err) {
      // One failing step must not stop the others.
      logger.error(`billing scheduler step ${key} failed: ${err.message}`);
      result[`${key}Error`] = err.message;
    }
  }
  return result;
};

module.exports = { runOnce, applyDueDowngrades, persistTransitions, sendReminders };
