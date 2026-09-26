const {
  resolveState,
  computeManualApproval,
  normalizeSubscription,
  comparePlans,
  findLimitOverages,
  addDays,
} = require('../../../src/services/billing/subscriptionState');

const SETTINGS = { graceDays: 5 };
const T0 = new Date('2026-09-01T00:00:00.000Z');
const plan = (key, price, limits = {}) => ({
  key,
  name: key,
  priceUsdMonthly: price,
  limits: { maxUsers: 3, maxBranches: 1, maxInvoicesPerMonth: 100, ...limits },
});
const STARTER = plan('starter', 5);
const GROWTH = plan('growth', 10, { maxUsers: 10, maxBranches: 2 });
const BUSINESS = plan('business', 30, { maxUsers: 25, maxBranches: 5, maxInvoicesPerMonth: -1 });

describe('subscriptionState', () => {
  describe('normalizeSubscription (pre-v2 documents)', () => {
    test('maps legacy plan keys and trial/pending statuses', () => {
      expect(normalizeSubscription({ planType: 'single', status: 'active', endDate: T0 })).toMatchObject({
        planKey: 'starter',
        status: 'active',
        paymentSource: 'manual',
        currentPeriodEnd: T0,
      });
      expect(normalizeSubscription({ planType: 'multi', status: 'active' }).planKey).toBe('growth');
      expect(normalizeSubscription({ planType: 'trial', status: 'active' }).status).toBe('trialing');
      expect(normalizeSubscription({ planType: 'trial', status: 'pending' }).status).toBe('expired');
      expect(normalizeSubscription(undefined)).toMatchObject({ planKey: 'trial', status: 'expired' });
    });
  });

  describe('grace period transitions', () => {
    const active = { planType: 'starter', status: 'active', paymentSource: 'manual', currentPeriodEnd: T0 };

    test('active before period end → active, full access', () => {
      const s = resolveState(active, addDays(T0, -1), SETTINGS);
      expect(s).toMatchObject({ status: 'active', mode: 'full', daysRemaining: 1 });
    });

    test('period end reached → gracePeriod with graceEndsAt = end + graceDays, still full access', () => {
      const s = resolveState(active, T0, SETTINGS);
      expect(s.status).toBe('gracePeriod');
      expect(s.mode).toBe('full');
      expect(s.graceEndsAt).toEqual(addDays(T0, 5));
    });

    test('last moment of grace is still grace; grace end → expired and read-only', () => {
      expect(resolveState(active, new Date(addDays(T0, 5).getTime() - 1), SETTINGS).status).toBe('gracePeriod');
      const s = resolveState(active, addDays(T0, 5), SETTINGS);
      expect(s).toMatchObject({ status: 'expired', mode: 'readOnly' });
    });

    test('a stored graceEndsAt wins over a later change to graceDays', () => {
      const stored = { ...active, status: 'gracePeriod', graceEndsAt: addDays(T0, 5) };
      expect(resolveState(stored, addDays(T0, 6), { graceDays: 30 }).status).toBe('expired');
    });

    test('stored gracePeriod with a renewed (future) period end resolves to active', () => {
      const stored = { ...active, status: 'gracePeriod', currentPeriodEnd: addDays(T0, 30) };
      expect(resolveState(stored, addDays(T0, 2), SETTINGS).status).toBe('active');
    });

    test('Polar pastDue stays pastDue through grace, then expires', () => {
      const pastDue = { ...active, status: 'pastDue', paymentSource: 'polar' };
      expect(resolveState(pastDue, addDays(T0, 1), SETTINGS)).toMatchObject({ status: 'pastDue', mode: 'full' });
      expect(resolveState(pastDue, addDays(T0, 5), SETTINGS).status).toBe('expired');
    });

    test('trials and cancellations get no grace', () => {
      const trial = { planType: 'trial', status: 'trialing', currentPeriodEnd: T0 };
      expect(resolveState(trial, T0, SETTINGS)).toMatchObject({ status: 'expired', mode: 'readOnly' });
      const canceled = { ...active, status: 'canceled', cancelAtPeriodEnd: true };
      expect(resolveState(canceled, addDays(T0, -1), SETTINGS).mode).toBe('full');
      expect(resolveState(canceled, T0, SETTINGS).status).toBe('expired');
    });

    test('no period end (e.g. enterprise by agreement) never lapses', () => {
      const s = resolveState({ planType: 'enterprise', status: 'active', paymentSource: 'manual' }, T0, SETTINGS);
      expect(s).toMatchObject({ status: 'active', mode: 'full', daysRemaining: null });
    });
  });

  describe('downgrade timing', () => {
    const withPending = {
      planType: 'business',
      status: 'active',
      paymentSource: 'manual',
      currentPeriodEnd: addDays(T0, 60),
      pendingPlanType: 'starter',
      pendingPlanEffectiveAt: T0,
    };

    test('before the effective date the current plan still applies', () => {
      const s = resolveState(withPending, addDays(T0, -1), SETTINGS);
      expect(s.planKey).toBe('business');
      expect(s.pendingPlanKey).toBe('starter');
      expect(s.pendingPlanDue).toBe(false);
    });

    test('from the effective date the lower plan applies', () => {
      const s = resolveState(withPending, T0, SETTINGS);
      expect(s.planKey).toBe('starter');
      expect(s.pendingPlanKey).toBeNull();
      expect(s.pendingPlanDue).toBe(true);
      expect(s.status).toBe('active');
    });
  });

  describe('computeManualApproval', () => {
    const activeState = (planKey, end) =>
      resolveState({ planType: planKey, status: 'active', paymentSource: 'manual', currentPeriodEnd: end }, T0, SETTINGS);

    test('from trial: plan applies now and unused trial days are kept', () => {
      const state = resolveState({ planType: 'trial', status: 'trialing', currentPeriodEnd: addDays(T0, 4) }, T0, SETTINGS);
      const r = computeManualApproval({ state, currentPlan: null, targetPlan: GROWTH, months: 1, now: T0 });
      expect(r.appliedAs).toBe('new');
      expect(r.patch).toMatchObject({ planType: 'growth', status: 'active', paymentSource: 'manual' });
      expect(r.patch.currentPeriodStart).toEqual(T0);
      expect(r.patch.currentPeriodEnd).toEqual(new Date('2026-10-05T00:00:00.000Z'));
    });

    test('from expired: starts now', () => {
      const state = resolveState(
        { planType: 'starter', status: 'expired', currentPeriodEnd: addDays(T0, -40) },
        T0,
        SETTINGS
      );
      const r = computeManualApproval({ state, currentPlan: STARTER, targetPlan: STARTER, months: 3, now: T0 });
      expect(r.appliedAs).toBe('new');
      expect(r.patch.currentPeriodEnd).toEqual(new Date('2026-12-01T00:00:00.000Z'));
    });

    test('from grace: renewal continues from the old period end', () => {
      const end = addDays(T0, -2);
      const state = resolveState({ planType: 'starter', status: 'active', currentPeriodEnd: end }, T0, SETTINGS);
      expect(state.status).toBe('gracePeriod');
      const r = computeManualApproval({ state, currentPlan: STARTER, targetPlan: STARTER, months: 1, now: T0 });
      expect(r.appliedAs).toBe('renewal');
      expect(r.patch.currentPeriodStart).toEqual(end);
      expect(r.patch.currentPeriodEnd).toEqual(new Date('2026-09-30T00:00:00.000Z'));
      expect(r.patch.graceEndsAt).toBeNull();
    });

    test('same plan with time left: extends from current period end', () => {
      const end = addDays(T0, 10);
      const r = computeManualApproval({
        state: activeState('starter', end),
        currentPlan: STARTER,
        targetPlan: STARTER,
        months: 1,
        now: T0,
      });
      expect(r.appliedAs).toBe('renewal');
      expect(r.patch.currentPeriodEnd).toEqual(new Date('2026-10-11T00:00:00.000Z'));
    });

    test('upgrade applies immediately and credits unused value at the new price', () => {
      // 10 days of Starter ($5) left → worth 5 days of Growth ($10).
      const r = computeManualApproval({
        state: activeState('starter', addDays(T0, 10)),
        currentPlan: STARTER,
        targetPlan: GROWTH,
        months: 1,
        now: T0,
      });
      expect(r.appliedAs).toBe('upgrade');
      expect(r.patch.planType).toBe('growth');
      expect(r.patch.currentPeriodStart).toEqual(T0);
      expect(r.patch.currentPeriodEnd).toEqual(addDays(new Date('2026-10-01T00:00:00.000Z'), 5));
      expect(r.patch.pendingPlanType).toBeNull();
    });

    test('downgrade with time left is scheduled for period end, not applied now', () => {
      const end = addDays(T0, 10);
      const r = computeManualApproval({
        state: activeState('business', end),
        currentPlan: BUSINESS,
        targetPlan: STARTER,
        months: 1,
        now: T0,
      });
      expect(r.appliedAs).toBe('scheduledDowngrade');
      expect(r.patch.planType).toBeUndefined();
      expect(r.patch.pendingPlanType).toBe('starter');
      expect(r.patch.pendingPlanEffectiveAt).toEqual(end);
      expect(r.patch.currentPeriodEnd).toEqual(new Date('2026-10-11T00:00:00.000Z'));
    });
  });

  test('comparePlans', () => {
    expect(comparePlans(STARTER, GROWTH)).toBe('upgrade');
    expect(comparePlans(BUSINESS, STARTER)).toBe('downgrade');
    expect(comparePlans(GROWTH, GROWTH)).toBe('same');
    expect(comparePlans(null, STARTER)).toBe('upgrade');
  });

  test('findLimitOverages reports only exceeded, non-unlimited limits', () => {
    const overages = findLimitOverages(STARTER, { users: 5, branches: 1, invoicesThisMonth: 101 });
    expect(overages.map((o) => o.limit)).toEqual(['maxUsers', 'maxInvoicesPerMonth']);
    expect(findLimitOverages(BUSINESS, { users: 1, branches: 1, invoicesThisMonth: 1e6 })).toEqual([]);
  });
});
