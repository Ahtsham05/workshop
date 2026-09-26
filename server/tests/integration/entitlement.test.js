const request = require('supertest');
const httpStatus = require('http-status');
const mongoose = require('mongoose');
const moment = require('moment');
const app = require('../../src/app');
const setupTestDB = require('../utils/setupTestDB');
const { Organization, User, Branch, Invoice } = require('../../src/models');
const config = require('../../src/config/config');
const { tokenTypes } = require('../../src/config/tokens');
const tokenService = require('../../src/services/token.service');
const entitlementService = require('../../src/services/entitlement.service');
const planService = require('../../src/services/billing/plan.service');
const billingSettingsService = require('../../src/services/billing/billingSettings.service');
const { addDays } = require('../../src/services/billing/subscriptionState');

// Generous: the in-memory MongoDB can take a while to start when the whole suite runs in parallel.
jest.setTimeout(30000);

setupTestDB();

const ownerId = new mongoose.Types.ObjectId();
const orgId = new mongoose.Types.ObjectId();
const token = tokenService.generateToken(
  ownerId,
  moment().add(config.jwt.accessExpirationMinutes, 'minutes'),
  tokenTypes.ACCESS
);

const makeOrg = async (subscription) => {
  await Organization.collection.insertOne({ _id: orgId, name: 'Acme', owner: ownerId, countryCode: 'PK', subscription });
  await User.collection.insertOne({
    _id: ownerId,
    name: 'Owner',
    email: 'owner@example.com',
    password: '$2a$08$abcdefghijklmnopqrstuuMhMp1Qs1rUXQ8j0x1n3i7Ew8B2WlZ6a', // bcrypt-shaped so save() validation passes
    organizationId: orgId,
    isActive: true,
    onboardingComplete: true,
  });
};

const activeOn = (planType, extra = {}) => ({
  planType,
  status: 'active',
  paymentSource: 'manual',
  currentPeriodEnd: addDays(new Date(), 20),
  ...extra,
});

const addUsers = (n, extra = {}) =>
  User.collection.insertMany(
    Array.from({ length: n }, (_, i) => ({
      name: `U${i}`,
      email: `u${i}-${Math.random()}@example.com`,
      organizationId: orgId,
      isActive: true,
      ...extra,
    }))
  );

const addInvoices = (n, extra = {}) =>
  Invoice.collection.insertMany(
    Array.from({ length: n }, () => ({
      organizationId: orgId,
      type: 'cash',
      status: 'paid',
      createdAt: new Date(),
      ...extra,
    }))
  );

beforeEach(async () => {
  planService.invalidatePlanCache();
  billingSettingsService.invalidateSettingsCache();
  await planService.seedMissingPlans();
});

describe('entitlement.service', () => {
  describe('canUseModule', () => {
    test('allows modules in the plan, denies others with a reason and the cheapest plan that has it', async () => {
      await makeOrg(activeOn('starter'));
      expect(await entitlementService.canUseModule(orgId, 'invoicing')).toEqual({ allowed: true });

      const denied = await entitlementService.canUseModule(orgId, 'hr');
      expect(denied).toMatchObject({
        allowed: false,
        status: httpStatus.FORBIDDEN,
        code: 'MODULE_NOT_IN_PLAN',
        details: { module: 'hr', requiredPlan: 'growth' },
      });
      expect(denied.reason).toMatch(/Upgrade to Growth/);
    });

    test('legacy feature keys resolve to their module', async () => {
      await makeOrg(activeOn('growth'));
      expect((await entitlementService.canUseModule(orgId, 'repair')).allowed).toBe(true);
      expect((await entitlementService.canUseModule(orgId, 'roles_permissions')).allowed).toBe(false);
    });

    test('a locked data module stays readable; a locked computed module does not', async () => {
      await makeOrg(activeOn('starter'));
      expect((await entitlementService.canUseModule(orgId, 'mobile_shop', { write: false })).allowed).toBe(true);
      expect((await entitlementService.canUseModule(orgId, 'profit_loss', { write: false })).allowed).toBe(false);
    });

    test('legacy plan keys (single/multi) are honoured before migration', async () => {
      await makeOrg({ planType: 'multi', status: 'active', endDate: addDays(new Date(), 5) });
      expect((await entitlementService.canUseModule(orgId, 'hr')).allowed).toBe(true);
    });
  });

  describe('limits', () => {
    test('canAddUser counts staff only (student/parent logins excluded)', async () => {
      await makeOrg(activeOn('starter')); // maxUsers 3, owner = 1
      await addUsers(1);
      await addUsers(5, { schoolRole: 'student' });
      expect((await entitlementService.canAddUser(orgId)).allowed).toBe(true);
      await addUsers(1);
      expect(await entitlementService.canAddUser(orgId)).toMatchObject({
        allowed: false,
        code: 'LIMIT_USERS',
        details: { max: 3, used: 3 },
      });
    });

    test('canAddBranch respects maxBranches', async () => {
      await makeOrg(activeOn('starter'));
      expect((await entitlementService.canAddBranch(orgId)).allowed).toBe(true);
      await Branch.collection.insertOne({ organizationId: orgId, name: 'Main', isActive: true });
      expect((await entitlementService.canAddBranch(orgId)).code).toBe('LIMIT_BRANCHES');
    });

    test('canCreateInvoice counts this month only, excluding quotations, drafts and demo data', async () => {
      await makeOrg(activeOn('starter'));
      await planService.updatePlan('starter', { limits: { maxInvoicesPerMonth: 3 } });

      await addInvoices(2);
      await addInvoices(3, { type: 'quotation' });
      await addInvoices(3, { status: 'draft' });
      await addInvoices(3, { isDemo: true });
      await addInvoices(3, { createdAt: moment().subtract(2, 'months').toDate() });
      expect((await entitlementService.canCreateInvoice(orgId)).allowed).toBe(true);

      await addInvoices(1);
      expect(await entitlementService.canCreateInvoice(orgId)).toMatchObject({
        allowed: false,
        code: 'LIMIT_INVOICES',
        details: { max: 3, used: 3 },
      });
    });

    test('-1 means unlimited', async () => {
      await makeOrg(activeOn('business'));
      await addInvoices(50);
      expect((await entitlementService.canCreateInvoice(orgId)).allowed).toBe(true);
    });
  });

  describe('read-only mode', () => {
    test('a lapsed plan blocks every write decision with SUBSCRIPTION_READ_ONLY', async () => {
      await makeOrg(activeOn('business', { currentPeriodEnd: addDays(new Date(), -6) })); // past 5-day grace
      const ro = await entitlementService.canWriteAsync(orgId);
      expect(ro).toMatchObject({ allowed: false, status: httpStatus.PAYMENT_REQUIRED, code: 'SUBSCRIPTION_READ_ONLY' });
      expect(ro.reason).toMatch(/view and export/);
      expect((await entitlementService.canAddUser(orgId)).code).toBe('SUBSCRIPTION_READ_ONLY');
      expect((await entitlementService.canCreateInvoice(orgId)).code).toBe('SUBSCRIPTION_READ_ONLY');
      // Reading a module the plan includes is still fine.
      expect((await entitlementService.canUseModule(orgId, 'hr', { write: false })).allowed).toBe(true);
    });

    test('grace period keeps full access', async () => {
      await makeOrg(activeOn('starter', { currentPeriodEnd: addDays(new Date(), -2) }));
      const summary = await entitlementService.getSummary(orgId);
      expect(summary).toMatchObject({ status: 'gracePeriod', mode: 'full' });
    });
  });

  test("getPaymentRouting follows the organization's country (Business Profile / Localization), not IP", async () => {
    expect(entitlementService.getPaymentRouting({ countryCode: 'PK' })).toEqual({
      country: 'PK',
      allowed: ['manual', 'polar'],
      default: 'manual',
    });
    expect(entitlementService.getPaymentRouting({ countryCode: 'gb' })).toEqual({
      country: 'GB',
      allowed: ['polar'],
      default: 'polar',
    });
    // Orgs created before countryCode existed only have the free-text country.
    expect(entitlementService.getPaymentRouting({ country: 'Pakistan' }).country).toBe('PK');
    expect(entitlementService.getPaymentRouting({}).allowed).toEqual([]);
  });
});

describe('global read-only gate (real app, real JWT)', () => {
  const lapsed = () => activeOn('business', { currentPeriodEnd: addDays(new Date(), -30) });

  test('mutations on business routes get 402 with a machine-readable code', async () => {
    await makeOrg(lapsed());
    const res = await request(app)
      .post('/v1/customers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'New customer' })
      .expect(httpStatus.PAYMENT_REQUIRED);
    expect(res.body).toMatchObject({ errorCode: 'SUBSCRIPTION_READ_ONLY' });
  });

  test('reads are never blocked by billing', async () => {
    await makeOrg(lapsed());
    const res = await request(app).get('/v1/customers').set('Authorization', `Bearer ${token}`);
    expect(res.status).not.toBe(httpStatus.PAYMENT_REQUIRED);
  });

  test('own-profile updates stay allowed in read-only mode', async () => {
    await makeOrg(lapsed());
    await request(app)
      .patch('/v1/users/me/ui-preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ branchTint: 'off' })
      .expect(httpStatus.OK);
  });

  test('an active org passes the gate (route permissions decide from there)', async () => {
    await makeOrg(activeOn('business'));
    const res = await request(app).post('/v1/customers').set('Authorization', `Bearer ${token}`).send({ name: 'X' });
    expect(res.status).not.toBe(httpStatus.PAYMENT_REQUIRED);
  });

  test('an invalid token is left to the route auth (401, not 402)', async () => {
    await request(app).post('/v1/customers').set('Authorization', 'Bearer nope').send({}).expect(httpStatus.UNAUTHORIZED);
  });
});
