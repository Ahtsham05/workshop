/**
 * Pure subscription state logic — no DB, no clock, no I/O. Everything time-dependent takes
 * `now` so tests can pin it. Both payment paths (Polar webhooks, manual approval) and the
 * scheduler go through these functions, which is what keeps them agreeing with each other.
 *
 * Access decisions use resolveState(), which derives the *effective* status from dates, so an
 * org whose period ended five minutes ago is already in grace even if the scheduler has not
 * run yet. The scheduler only persists what resolveState() already reports, and sends emails.
 */
const moment = require('moment');
const { LEGACY_PLAN_ALIASES } = require('../../config/billing');

const DAY_MS = 24 * 60 * 60 * 1000;

const toDate = (value) => (value ? new Date(value) : null);

const addMonths = (date, months) => moment.utc(date).add(months, 'months').toDate();

const addDays = (date, days) => new Date(new Date(date).getTime() + days * DAY_MS);

const resolvePlanKey = (planType) => LEGACY_PLAN_ALIASES[planType] || planType || 'trial';

/**
 * Normalize a stored Organization.subscription (possibly written by the pre-v2 code) into
 * the v2 shape. Pre-v2 docs: status active|expired|pending, endDate instead of
 * currentPeriodEnd, trial marked by planType 'trial' + status 'active'.
 */
const normalizeSubscription = (stored = {}) => {
  const sub = stored || {};
  const planKey = resolvePlanKey(sub.planType);
  let { status } = sub;
  if (!status || status === 'pending') status = 'expired';
  if (status === 'active' && planKey === 'trial') status = 'trialing';

  let { paymentSource } = sub;
  if (!paymentSource && planKey !== 'trial' && sub.polar?.subscriptionId) paymentSource = 'polar';
  // Before v2 the only way to pay was the manual bank-transfer flow.
  if (!paymentSource && planKey !== 'trial') paymentSource = 'manual';

  return {
    planKey,
    status,
    paymentSource: paymentSource || null,
    currentPeriodStart: toDate(sub.currentPeriodStart || sub.startDate),
    currentPeriodEnd: toDate(sub.currentPeriodEnd || sub.endDate),
    graceEndsAt: toDate(sub.graceEndsAt),
    pendingPlanKey: sub.pendingPlanType ? resolvePlanKey(sub.pendingPlanType) : null,
    pendingPlanEffectiveAt: toDate(sub.pendingPlanEffectiveAt),
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
    polarSubscriptionId: sub.polar?.subscriptionId || null,
  };
};

/**
 * Effective state at `now`.
 * @returns {{
 *   planKey, status, mode: 'full'|'readOnly', paymentSource, currentPeriodStart,
 *   currentPeriodEnd, graceEndsAt, daysRemaining, pendingPlanKey, pendingPlanEffectiveAt,
 *   pendingPlanDue, cancelAtPeriodEnd
 * }}
 */
const resolveState = (stored, now, { graceDays }) => {
  const sub = normalizeSubscription(stored);
  const nowMs = new Date(now).getTime();
  const periodEnd = sub.currentPeriodEnd;
  const periodEnded = periodEnd != null && nowMs >= periodEnd.getTime();

  let { planKey, pendingPlanKey, pendingPlanEffectiveAt } = sub;
  const pendingPlanDue = Boolean(pendingPlanKey && pendingPlanEffectiveAt && nowMs >= pendingPlanEffectiveAt.getTime());
  if (pendingPlanDue) {
    planKey = pendingPlanKey;
    pendingPlanKey = null;
    pendingPlanEffectiveAt = null;
  }

  let { status } = sub;
  let graceEndsAt = null;

  if (status === 'trialing') {
    // Trials have no grace period: when the trial ends the account goes read-only.
    if (periodEnded) status = 'expired';
  } else if (status === 'canceled') {
    // A cancellation is a decision not to renew, not a late payment — no grace either.
    if (periodEnded) status = 'expired';
  } else if (status === 'active' || status === 'pastDue' || status === 'gracePeriod') {
    if (!periodEnded) {
      // Paid through a future date. A stored 'gracePeriod' here means a renewal landed
      // after the scheduler moved the org into grace.
      if (status === 'gracePeriod') status = 'active';
    } else {
      graceEndsAt = sub.graceEndsAt || addDays(periodEnd, graceDays);
      if (nowMs >= graceEndsAt.getTime()) status = 'expired';
      else if (status !== 'pastDue') status = 'gracePeriod';
    }
  }

  const daysRemaining = periodEnd ? Math.max(0, Math.ceil((periodEnd.getTime() - nowMs) / DAY_MS)) : null;

  return {
    planKey,
    status,
    mode: status === 'expired' ? 'readOnly' : 'full',
    paymentSource: sub.paymentSource,
    currentPeriodStart: sub.currentPeriodStart,
    currentPeriodEnd: periodEnd,
    graceEndsAt,
    daysRemaining,
    pendingPlanKey,
    pendingPlanEffectiveAt,
    pendingPlanDue,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
    polarSubscriptionId: sub.polarSubscriptionId,
  };
};

/** True while the org has paid time left on a real (non-trial) plan. */
const hasPaidTimeLeft = (state, now) =>
  state.planKey !== 'trial' &&
  (state.status === 'active' || state.status === 'canceled') &&
  state.currentPeriodEnd != null &&
  state.currentPeriodEnd.getTime() > new Date(now).getTime();

/**
 * Compare two plans by monthly price. Equal price with a different key counts as an upgrade
 * so the switch is immediate (e.g. trial → any paid plan, or enterprise → business).
 * @returns {'same'|'upgrade'|'downgrade'}
 */
const comparePlans = (fromPlan, toPlan) => {
  if (!fromPlan || fromPlan.key === toPlan.key) return fromPlan ? 'same' : 'upgrade';
  if (toPlan.priceUsdMonthly < fromPlan.priceUsdMonthly) return 'downgrade';
  return 'upgrade';
};

/**
 * What approving a manual payment does to the subscription.
 *
 *  - Trial / expired / no paid time: the paid plan starts now. A trial's unused days are
 *    kept (period runs from the later of now and the trial end).
 *  - Grace / past due: renewal continues from the old period end, so the grace days the
 *    customer already used are part of the paid period.
 *  - Same plan with paid time left: extends from the current period end.
 *  - Upgrade with paid time left: new plan applies now; unused value of the old plan is
 *    converted into extra days at the new plan's price.
 *  - Downgrade with paid time left: the customer keeps the current plan until its period end,
 *    then the lower plan runs for the paid months (scheduled downgrade).
 *
 * @returns {{ appliedAs, patch, periodStart, periodEnd }} `patch` is a set of
 *   Organization.subscription fields (unprefixed) to write.
 */
const computeManualApproval = ({ state, currentPlan, targetPlan, months, now }) => {
  const nowDate = new Date(now);
  const base = {
    status: 'active',
    paymentSource: 'manual',
    graceEndsAt: null,
    cancelAtPeriodEnd: false,
  };

  const paidTimeLeft = hasPaidTimeLeft(state, nowDate);
  const inGrace = state.status === 'gracePeriod' || state.status === 'pastDue';

  if (!paidTimeLeft || state.planKey === 'trial') {
    let start = nowDate;
    let appliedAs = 'new';
    if (inGrace && state.currentPeriodEnd && state.planKey !== 'trial') {
      start = state.currentPeriodEnd;
      appliedAs = 'renewal';
    }
    let extendFrom = start;
    if (state.status === 'trialing' && state.currentPeriodEnd && state.currentPeriodEnd > nowDate) {
      extendFrom = state.currentPeriodEnd;
    }
    const periodEnd = addMonths(extendFrom, months);
    return {
      appliedAs,
      periodStart: start,
      periodEnd,
      patch: {
        ...base,
        planType: targetPlan.key,
        currentPeriodStart: start,
        currentPeriodEnd: periodEnd,
        pendingPlanType: null,
        pendingPlanEffectiveAt: null,
      },
    };
  }

  const direction = comparePlans(currentPlan, targetPlan);

  if (direction === 'same') {
    const periodEnd = addMonths(state.currentPeriodEnd, months);
    return {
      appliedAs: 'renewal',
      periodStart: state.currentPeriodStart || nowDate,
      periodEnd,
      patch: {
        ...base,
        planType: targetPlan.key,
        currentPeriodEnd: periodEnd,
        pendingPlanType: null,
        pendingPlanEffectiveAt: null,
      },
    };
  }

  if (direction === 'upgrade') {
    const remainingMs = state.currentPeriodEnd.getTime() - nowDate.getTime();
    const creditMs =
      targetPlan.priceUsdMonthly > 0
        ? Math.floor((remainingMs * (currentPlan?.priceUsdMonthly || 0)) / targetPlan.priceUsdMonthly)
        : 0;
    const periodEnd = new Date(addMonths(nowDate, months).getTime() + Math.max(0, creditMs));
    return {
      appliedAs: 'upgrade',
      periodStart: nowDate,
      periodEnd,
      patch: {
        ...base,
        planType: targetPlan.key,
        currentPeriodStart: nowDate,
        currentPeriodEnd: periodEnd,
        pendingPlanType: null,
        pendingPlanEffectiveAt: null,
      },
    };
  }

  // Downgrade: current plan runs out its paid period, then the lower plan takes over.
  const switchAt = state.currentPeriodEnd;
  const periodEnd = addMonths(switchAt, months);
  return {
    appliedAs: 'scheduledDowngrade',
    periodStart: switchAt,
    periodEnd,
    patch: {
      ...base,
      currentPeriodEnd: periodEnd,
      pendingPlanType: targetPlan.key,
      pendingPlanEffectiveAt: switchAt,
    },
  };
};

/**
 * Which limits of `plan` the given usage already exceeds — for downgrade warnings.
 * @param {{ users, branches, invoicesThisMonth }} usage
 * @returns {Array<{ limit, used, allowed, message }>}
 */
const findLimitOverages = (plan, usage) => {
  const checks = [
    ['maxUsers', usage.users, 'users'],
    ['maxBranches', usage.branches, 'branches'],
    ['maxInvoicesPerMonth', usage.invoicesThisMonth, 'invoices this month'],
  ];
  return checks
    .filter(([limit, used]) => plan.limits[limit] !== -1 && used > plan.limits[limit])
    .map(([limit, used, label]) => ({
      limit,
      used,
      allowed: plan.limits[limit],
      message: `You have ${used} ${label}; the ${plan.name} plan allows ${plan.limits[limit]}.`,
    }));
};

/**
 * Legacy mirror fields written alongside every subscription change so older clients and
 * shipped desktop builds (which read planType/endDate/limits/isTrial) keep working.
 */
const legacyMirror = (planKey, plan, periodStart, periodEnd, status) => ({
  isTrial: planKey === 'trial' || status === 'trialing',
  startDate: periodStart || undefined,
  endDate: periodEnd || undefined,
  limits: plan ? { maxBranches: plan.limits.maxBranches, maxUsers: plan.limits.maxUsers } : undefined,
});

module.exports = {
  DAY_MS,
  addMonths,
  addDays,
  resolvePlanKey,
  normalizeSubscription,
  resolveState,
  hasPaidTimeLeft,
  comparePlans,
  computeManualApproval,
  findLimitOverages,
  legacyMirror,
};
