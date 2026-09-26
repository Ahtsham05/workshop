/**
 * The only code path that writes Organization.subscription after onboarding. Manual approval,
 * Polar webhook sync, admin overrides and the scheduler all call applySubscriptionPatch(), so
 * every change keeps the legacy mirror fields in sync and leaves an audit entry.
 */
const { Organization } = require('../../models');
const planService = require('./plan.service');
const billingAudit = require('./billingAudit.service');
const { legacyMirror, resolvePlanKey } = require('./subscriptionState');

/**
 * @param {Object} params
 * @param {Object} params.org lean org (needs _id and subscription)
 * @param {Object} params.patch unprefixed subscription fields, e.g. { status, currentPeriodEnd,
 *   'polar.subscriptionId': 'sub_…' } — nested polar/reminders fields use dotted keys.
 * @param {Object} [params.guard] extra filter conditions (optimistic concurrency)
 * @param {Object} [params.audit] { actorType, actorId, actorLabel, action, meta } — status
 *   changes are audited automatically as 'status.changed' when no action is given.
 * @returns {Promise<Object|null>} the updated org (lean), or null when the guard did not match
 */
const applySubscriptionPatch = async ({ org, patch, guard = {}, audit = null, now = new Date() }) => {
  const before = org.subscription || {};
  const planKey = resolvePlanKey(patch.planType !== undefined ? patch.planType : before.planType);
  const plan = await planService.getPlan(planKey);
  const status = patch.status !== undefined ? patch.status : before.status;
  const periodStart = patch.currentPeriodStart !== undefined ? patch.currentPeriodStart : before.currentPeriodStart;
  const periodEnd = patch.currentPeriodEnd !== undefined ? patch.currentPeriodEnd : before.currentPeriodEnd;

  const $set = {};
  Object.entries(patch).forEach(([key, value]) => {
    $set[`subscription.${key}`] = value;
  });
  Object.entries(legacyMirror(planKey, plan, periodStart, periodEnd, status)).forEach(([key, value]) => {
    if (value !== undefined) $set[`subscription.${key}`] = value;
  });
  if (patch.status !== undefined && patch.status !== before.status) $set['subscription.statusChangedAt'] = now;

  const updated = await Organization.findOneAndUpdate({ _id: org._id, ...guard }, { $set }, { new: true, lean: true });
  if (!updated) return null;

  const summarize = (s) => ({
    planType: s.planType,
    status: s.status,
    currentPeriodEnd: s.currentPeriodEnd || null,
    pendingPlanType: s.pendingPlanType || null,
    paymentSource: s.paymentSource || null,
  });
  const from = summarize(before);
  const to = summarize(updated.subscription);
  if (audit) {
    await billingAudit.record({ organizationId: org._id, from, to, ...audit });
  } else if (from.status !== to.status || from.planType !== to.planType) {
    await billingAudit.record({ organizationId: org._id, actorType: 'system', action: 'status.changed', from, to });
  }
  return updated;
};

module.exports = { applySubscriptionPatch };
