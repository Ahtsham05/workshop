const request = require('supertest');
const httpStatus = require('http-status');
const mongoose = require('mongoose');
const moment = require('moment');
const app = require('../../src/app');
const setupTestDB = require('../utils/setupTestDB');
const { Organization, User, ManualPayment, WebhookEvent, BillingAudit, Plan } = require('../../src/models');
const config = require('../../src/config/config');
const { tokenTypes } = require('../../src/config/tokens');
const tokenService = require('../../src/services/token.service');
const emailService = require('../../src/services/email.service');
const planService = require('../../src/services/billing/plan.service');
const billingSettingsService = require('../../src/services/billing/billingSettings.service');
const proofStorage = require('../../src/services/billing/proofStorage');
const polarService = require('../../src/services/billing/polar.service');
const polarWebhookService = require('../../src/services/billing/polarWebhook.service');
const billingScheduler = require('../../src/services/billing/billingScheduler.service');
const entitlementService = require('../../src/services/entitlement.service');
const logger = require('../../src/config/logger');
const { addDays, DAY_MS } = require('../../src/services/billing/subscriptionState');
const { buildSubscription, event, signedRequest } = require('../fixtures/polar.fixture');
const billingRoute = require('../../src/routes/v1/billing.route');

// Generous: the in-memory MongoDB can take a while to start when the whole suite runs in parallel.
jest.setTimeout(30000);

setupTestDB();

const SECRET = 'whsec_test_secret';
const GROWTH_PRODUCT = '22222222-2222-2222-2222-222222222222';
const BUSINESS_PRODUCT = '33333333-3333-3333-3333-333333333333';

const ownerId = new mongoose.Types.ObjectId();
const staffId = new mongoose.Types.ObjectId();
const adminId = new mongoose.Types.ObjectId();
const orgId = new mongoose.Types.ObjectId();
const token = (id) =>
  tokenService.generateToken(id, moment().add(config.jwt.accessExpirationMinutes, 'minutes'), tokenTypes.ACCESS);
const PASSWORD_HASH = '$2a$08$abcdefghijklmnopqrstuuMhMp1Qs1rUXQ8j0x1n3i7Ew8B2WlZ6a';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);

const makeOrg = async ({ subscription, countryCode = 'PK' } = {}) => {
  await Organization.collection.insertOne({
    _id: orgId,
    name: 'Acme Traders',
    owner: ownerId,
    email: 'billing@acme.example',
    countryCode,
    subscription: subscription || {
      planType: 'trial',
      status: 'trialing',
      currentPeriodStart: addDays(new Date(), -3),
      currentPeriodEnd: addDays(new Date(), 11),
    },
  });
  await User.collection.insertMany([
    {
      _id: ownerId,
      name: 'Owner',
      email: 'owner@acme.example',
      password: PASSWORD_HASH,
      organizationId: orgId,
      isActive: true,
    },
    {
      _id: staffId,
      name: 'Staff',
      email: 'staff@acme.example',
      password: PASSWORD_HASH,
      organizationId: orgId,
      isActive: true,
    },
    {
      _id: adminId,
      name: 'Platform Admin',
      email: 'admin@logix.example',
      password: PASSWORD_HASH,
      systemRole: 'system_admin',
    },
  ]);
};

const getOrg = () => Organization.findById(orgId).lean();
const flush = () => new Promise((resolve) => setImmediate(resolve));

let stored;
let sendEmail;

beforeEach(async () => {
  config.billing.polar.webhookSecret = SECRET;
  config.billing.polar.server = 'sandbox';
  planService.invalidatePlanCache();
  billingSettingsService.invalidateSettingsCache();
  await planService.seedMissingPlans();
  await planService.updatePlan('growth', { polar: { sandboxProductId: GROWTH_PRODUCT } });
  await planService.updatePlan('business', { polar: { sandboxProductId: BUSINESS_PRODUCT } });
  await ManualPayment.init(); // build unique indexes before tests rely on them

  stored = new Map();
  proofStorage.setStorageForTests({
    save: async (buffer, { organizationId }) => {
      const key = `billing-proofs/${organizationId}/${stored.size}.png`;
      stored.set(key, buffer);
      return key;
    },
    signedUrl: (key) => `https://signed.example/${key}?exp=300&sig=abc`,
    remove: async (key) => stored.delete(key),
  });
  sendEmail = jest.spyOn(emailService, 'sendEmail').mockResolvedValue();
  billingRoute.resetRateLimitsForUser(ownerId);
});

afterAll(() => proofStorage.setStorageForTests(null));

// ─────────────────────────────────────────────────────────────────────────────────────
describe('Polar webhook', () => {
  const periodStart = new Date('2026-09-01T00:00:00Z');
  const periodEnd = addDays(new Date(), 30);
  const sub = (over = {}) =>
    buildSubscription({ organizationId: String(orgId), productId: GROWTH_PRODUCT, periodStart, periodEnd, ...over });
  const post = (req) => request(app).post('/v1/billing/polar/webhook').set(req.headers).send(req.body);

  test('rejects a bad signature with 403 before storing or touching anything', async () => {
    await makeOrg();
    const req = signedRequest('whsec_wrong_secret', event('subscription.active', sub()));
    await post(req).expect(httpStatus.FORBIDDEN);
    expect(await WebhookEvent.countDocuments()).toBe(0);
    expect((await getOrg()).subscription.planType).toBe('trial');
  });

  test('rejects a tampered body (signature no longer matches)', async () => {
    await makeOrg();
    const req = signedRequest(SECRET, event('subscription.active', sub()));
    req.body = req.body.replace('"active"', '"trialing"');
    await post(req).expect(httpStatus.FORBIDDEN);
    expect(await WebhookEvent.countDocuments()).toBe(0);
  });

  test('rejects a request with no signature headers', async () => {
    await makeOrg();
    await request(app)
      .post('/v1/billing/polar/webhook')
      .set('content-type', 'application/json')
      .send(JSON.stringify(event('subscription.active', sub())))
      .expect(httpStatus.FORBIDDEN);
  });

  test('a valid subscription.active activates the plan through the shared entitlement fields', async () => {
    await makeOrg();
    await post(signedRequest(SECRET, event('subscription.active', sub()))).expect(httpStatus.ACCEPTED);
    const { subscription } = await getOrg();
    expect(subscription).toMatchObject({
      planType: 'growth',
      status: 'active',
      paymentSource: 'polar',
      isTrial: false,
      limits: { maxUsers: 10, maxBranches: 2 },
    });
    expect(subscription.currentPeriodEnd).toEqual(new Date(periodEnd.toISOString()));
    expect(subscription.polar).toMatchObject({ subscriptionId: 'sub_test_1', customerId: 'cus_test_1' });
    expect((await entitlementService.canUseModule(orgId, 'hr')).allowed).toBe(true);
  });

  test('a duplicate delivery (same webhook-id) is acknowledged but processed only once', async () => {
    await makeOrg();
    const req = signedRequest(SECRET, event('subscription.active', sub()), { id: 'msg_dup_1' });
    const first = await post(req).expect(httpStatus.ACCEPTED);
    const second = await post(req).expect(httpStatus.ACCEPTED);
    expect(first.body.duplicate).toBe(false);
    expect(second.body.duplicate).toBe(true);
    expect(await WebhookEvent.countDocuments({ eventId: 'msg_dup_1' })).toBe(1);
    expect(await BillingAudit.countDocuments({ action: 'polar.subscription_synced' })).toBe(1);
  });

  test('an older (out-of-order) state does not overwrite a newer one', async () => {
    await makeOrg();
    const newer = sub({ modifiedAt: new Date('2026-09-10T00:00:00Z'), cancelAtPeriodEnd: true });
    const older = sub({ modifiedAt: new Date('2026-09-05T00:00:00Z') });
    await post(signedRequest(SECRET, event('subscription.canceled', newer))).expect(httpStatus.ACCEPTED);
    await post(signedRequest(SECRET, event('subscription.updated', older))).expect(httpStatus.ACCEPTED);
    const { subscription } = await getOrg();
    expect(subscription.status).toBe('canceled');
    expect(subscription.cancelAtPeriodEnd).toBe(true);
  });

  test('cancel at period end keeps full access; revoked makes the account read-only', async () => {
    await makeOrg();
    await post(signedRequest(SECRET, event('subscription.canceled', sub({ cancelAtPeriodEnd: true })))).expect(
      httpStatus.ACCEPTED
    );
    expect((await entitlementService.getSummary(orgId)).mode).toBe('full');

    const revoked = sub({ status: 'canceled', endedAt: new Date(), modifiedAt: addDays(new Date(), 1) });
    await post(signedRequest(SECRET, event('subscription.revoked', revoked))).expect(httpStatus.ACCEPTED);
    const summary = await entitlementService.getSummary(orgId);
    expect(summary).toMatchObject({ status: 'expired', mode: 'readOnly' });
  });

  test('a Polar-scheduled downgrade is mirrored as pendingPlanType', async () => {
    await makeOrg();
    const withPending = buildSubscription({
      organizationId: String(orgId),
      productId: BUSINESS_PRODUCT,
      periodStart,
      periodEnd,
      pendingUpdate: {
        created_at: new Date().toISOString(),
        modified_at: null,
        id: 'upd_1',
        applies_at: periodEnd.toISOString(),
        product_id: GROWTH_PRODUCT,
        seats: null,
      },
    });
    await post(signedRequest(SECRET, event('subscription.updated', withPending))).expect(httpStatus.ACCEPTED);
    const { subscription } = await getOrg();
    expect(subscription.planType).toBe('business');
    expect(subscription.pendingPlanType).toBe('growth');
    expect(subscription.pendingPlanEffectiveAt).toEqual(new Date(periodEnd.toISOString()));
  });

  test('a webhook for a product not yet linked resolves the plan from the product metadata', async () => {
    await makeOrg();
    await planService.updatePlan('growth', { polar: { sandboxProductId: null } });
    const payload = sub({ productId: 'prod_fresh' });
    payload.product = { ...payload.product, id: 'prod_fresh', metadata: { planKey: 'growth' } };
    await post(signedRequest(SECRET, event('subscription.active', payload))).expect(httpStatus.ACCEPTED);
    expect((await getOrg()).subscription).toMatchObject({ planType: 'growth', status: 'active' });
    expect((await Plan.findOne({ key: 'growth' }).lean()).polar.sandboxProductId).toBe('prod_fresh');
  });

  test('an unmapped product is recorded as ignored and grants nothing', async () => {
    await makeOrg();
    const unknown = sub({ productId: '99999999-9999-9999-9999-999999999999' });
    await post(signedRequest(SECRET, event('subscription.active', unknown))).expect(httpStatus.ACCEPTED);
    expect((await getOrg()).subscription.planType).toBe('trial');
    expect((await WebhookEvent.findOne().lean()).status).toBe('ignored');
  });

  test('a processing failure is still acknowledged, stored as failed, and retried by the scheduler', async () => {
    await makeOrg();
    jest.spyOn(polarService, 'handleEvent').mockRejectedValueOnce(new Error('db blip'));
    await post(signedRequest(SECRET, event('subscription.active', sub()))).expect(httpStatus.ACCEPTED);
    expect((await WebhookEvent.findOne().lean()).status).toBe('failed');
    expect((await getOrg()).subscription.planType).toBe('trial');

    const retried = await polarWebhookService.retryPending({ now: new Date(Date.now() + 2 * 60 * 1000) });
    expect(retried).toBe(1);
    expect((await WebhookEvent.findOne().lean()).status).toBe('processed');
    expect((await getOrg()).subscription.planType).toBe('growth');
  });

  test('refuses to run without a configured secret (503, so Polar retries later)', async () => {
    config.billing.polar.webhookSecret = '';
    await post(signedRequest(SECRET, event('subscription.active', sub()))).expect(httpStatus.SERVICE_UNAVAILABLE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
describe('Polar checkout', () => {
  const checkout = (userId, planKey = 'growth') =>
    request(app)
      .post('/v1/billing/polar/checkout')
      .set('Authorization', `Bearer ${token(userId)}`)
      .send({ planKey });

  let created;
  beforeEach(() => {
    config.billing.polar.accessToken = 'polar_test_token';
    created = [];
    polarService.setClientForTests({
      checkouts: {
        create: jest.fn(async (req) => {
          created.push(req);
          return { id: 'chk_1', url: 'https://sandbox.polar.sh/checkout/chk_1' };
        }),
      },
    });
  });
  afterAll(() => polarService.setClientForTests(null));

  test('owner of a non-Pakistani org gets a hosted checkout tied to the organization', async () => {
    await makeOrg({ countryCode: 'AE' });
    const res = await checkout(ownerId).expect(httpStatus.CREATED);
    expect(res.body.url).toMatch(/^https:\/\/sandbox\.polar\.sh\//);
    expect(created[0]).toMatchObject({
      products: [GROWTH_PRODUCT],
      externalCustomerId: String(orgId),
      metadata: { organizationId: String(orgId), planKey: 'growth' },
    });
    expect(created[0].successUrl).toContain('/settings/billing?checkout=success');
    expect(created[0].returnUrl).toContain('checkout=canceled');
    // Nothing changes until Polar's webhook confirms the payment.
    expect((await getOrg()).subscription.planType).toBe('trial');
  });

  test('a plan with no stored product id is linked on the fly from the Polar product tagged with its key', async () => {
    await makeOrg({ countryCode: 'AE' });
    await planService.updatePlan('growth', { polar: { sandboxProductId: null } });
    polarService.resetProductCatalogCache();
    const client = polarService.getClient();
    client.products = {
      list: jest.fn(async () =>
        (async function* pages() {
          yield {
            result: {
              items: [
                { id: 'prod_growth_tagged', isRecurring: true, metadata: { planKey: 'growth' } },
                { id: 'prod_untagged', isRecurring: true, metadata: {} },
              ],
            },
          };
        })()
      ),
    };

    const summary = await request(app)
      .get('/v1/billing/summary')
      .set('Authorization', `Bearer ${token(ownerId)}`);
    expect(summary.body.plans.find((p) => p.key === 'growth').cardAvailable).toBe(true);
    expect((await Plan.findOne({ key: 'growth' }).lean()).polar.sandboxProductId).toBe('prod_growth_tagged');

    await checkout(ownerId).expect(httpStatus.CREATED);
    expect(created[0].products).toEqual(['prod_growth_tagged']);
    // Cached: the page and the checkout together asked Polar once.
    expect(client.products.list).toHaveBeenCalledTimes(1);
  });

  test('linking never overwrites a product id an admin set', async () => {
    await planService.linkPolarProduct('growth', 'sandbox', 'prod_other');
    expect((await Plan.findOne({ key: 'growth' }).lean()).polar.sandboxProductId).toBe(GROWTH_PRODUCT);
  });

  test('with no card product for any plan, checkout explains itself instead of failing silently', async () => {
    await makeOrg({ countryCode: 'AE' });
    await planService.updatePlan('growth', { polar: { sandboxProductId: null } });
    polarService.resetProductCatalogCache();
    polarService.getClient().products = {
      list: jest.fn(async () =>
        (async function* p() {
          yield { result: { items: [] } };
        })()
      ),
    };
    const res = await checkout(ownerId).expect(httpStatus.SERVICE_UNAVAILABLE);
    expect(res.body.errorCode).toBe('CARD_NOT_AVAILABLE');
  });

  test('only the owner may start a checkout', async () => {
    await makeOrg({ countryCode: 'AE' });
    await checkout(staffId).expect(httpStatus.FORBIDDEN);
  });

  test('a second checkout is refused while a card subscription is live', async () => {
    await makeOrg({
      countryCode: 'AE',
      subscription: {
        planType: 'growth',
        status: 'active',
        paymentSource: 'polar',
        currentPeriodEnd: addDays(new Date(), 20),
        polar: { subscriptionId: 'sub_live', customerId: 'cus_1' },
      },
    });
    const res = await checkout(ownerId, 'business').expect(httpStatus.CONFLICT);
    expect(res.body.errorCode).toBe('POLAR_SUBSCRIPTION_EXISTS');
  });

  test('if Polar rejects only the prefilled email, retries without it — and never logs the email', async () => {
    await makeOrg({ countryCode: 'AE' });
    const rejection = Object.assign(new Error('API error occurred: owner@acme.example ...'), {
      name: 'HTTPValidationError',
      statusCode: 422,
      body: JSON.stringify({
        detail: [{ loc: ['body', 'customer_email'], type: 'value_error', input: 'owner@acme.example', msg: 'bad domain' }],
      }),
    });
    const client = polarService.getClient();
    client.checkouts.create.mockRejectedValueOnce(rejection);
    const logged = jest.spyOn(logger, 'error');

    await checkout(ownerId).expect(httpStatus.CREATED);
    expect(client.checkouts.create).toHaveBeenCalledTimes(2);
    expect(client.checkouts.create.mock.calls[1][0].customerEmail).toBeUndefined();

    client.checkouts.create.mockRejectedValue(
      Object.assign(rejection, {
        body: JSON.stringify({
          detail: [{ loc: ['body', 'products'], type: 'missing', input: { customer_email: 'owner@acme.example' } }],
        }),
      })
    );
    const res = await checkout(ownerId).expect(httpStatus.BAD_GATEWAY);
    expect(res.body.message).not.toMatch(/acme/);
    const lines = logged.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes('HTTPValidationError 422 [products:missing]'))).toBe(true);
    expect(lines.join('\n')).not.toMatch(/owner@acme\.example/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
describe('Manual payments', () => {
  const intent = (userId, body = { planKey: 'growth', months: 1 }) =>
    request(app)
      .post('/v1/billing/manual/intents')
      .set('Authorization', `Bearer ${token(userId)}`)
      .send(body);

  const submit = (reference, over = {}, file = PNG) => {
    const fields = {
      reference,
      method: 'jazzcash',
      transactionId: 'TXN 12345',
      payerName: 'Ali Raza',
      paidAmountPkr: '2800',
      paidOn: new Date().toISOString(),
      ...over,
    };
    let req = request(app)
      .post('/v1/billing/manual/payments')
      .set('Authorization', `Bearer ${token(ownerId)}`);
    Object.entries(fields).forEach(([k, v]) => {
      req = req.field(k, v);
    });
    return req.attach('proof', file, 'proof.png');
  };

  const newReference = async () => (await intent(ownerId).expect(httpStatus.CREATED)).body.reference;

  test('owner gets a unique reference with a locked PKR quote and the payment details', async () => {
    await makeOrg();
    const res = await intent(ownerId).expect(httpStatus.CREATED);
    expect(res.body.reference).toMatch(/^LXP-\d{4}-[A-Z2-9]{5}$/);
    expect(res.body).toMatchObject({ usdAmount: 10, pkrPerUsd: 280, amountPkr: 2800, months: 1 });
    expect(res.body.paymentDetails.bank.iban).toBeTruthy();
    const second = await intent(ownerId).expect(httpStatus.CREATED);
    expect(second.body.reference).not.toBe(res.body.reference);
  });

  test('only the organization owner may start a payment', async () => {
    await makeOrg();
    const res = await intent(staffId).expect(httpStatus.FORBIDDEN);
    expect(res.body.errorCode).toBe('NOT_ORG_OWNER');
  });

  test('non-Pakistani organizations are routed to Polar', async () => {
    await makeOrg({ countryCode: 'AE' });
    const res = await intent(ownerId).expect(httpStatus.FORBIDDEN);
    expect(res.body.errorCode).toBe('MANUAL_NOT_AVAILABLE');
  });

  test('rejects invalid input with a validation error', async () => {
    await makeOrg();
    const res = await intent(ownerId, { planKey: 'growth', months: 5 }).expect(httpStatus.BAD_REQUEST);
    expect(res.body.errorCode).toBe('VALIDATION_FAILED');
    await intent(ownerId, { planKey: 'enterprise', months: 1 }).expect(httpStatus.BAD_REQUEST);
  });

  test('submits proof, stores it privately, and never returns its location to the customer', async () => {
    await makeOrg();
    const reference = await newReference();
    const res = await submit(reference).expect(httpStatus.CREATED);
    expect(res.body).toMatchObject({ status: 'pending', reference, amountPkr: 2800, paidAmountPkr: 2800 });
    expect(res.body.proof).toBeUndefined();
    expect(stored.size).toBe(1);
    const saved = await ManualPayment.findOne().lean();
    expect(saved.proof.storageKey).toMatch(new RegExp(`^billing-proofs/${orgId}/`));
    expect(saved.transactionIdNorm).toBe('TXN12345');
  });

  test('rejects a file that is not really an image or PDF (content sniffed, not mimetype)', async () => {
    await makeOrg();
    const reference = await newReference();
    const res = await submit(reference, {}, Buffer.from('<script>alert(1)</script> pretending to be a png'));
    expect(res.status).toBe(httpStatus.BAD_REQUEST);
    expect(stored.size).toBe(0);
  });

  test('duplicate transaction IDs are refused (same method, spacing/case-insensitive)', async () => {
    await makeOrg();
    await submit(await newReference(), { transactionId: 'TXN 12345' }).expect(httpStatus.CREATED);
    const dup = await submit(await newReference(), { transactionId: 'txn12345' }).expect(httpStatus.CONFLICT);
    expect(dup.body.errorCode).toBe('DUPLICATE_TRANSACTION');
    // Same number on a different rail is a different transaction.
    await submit(await newReference(), { transactionId: 'TXN12345', method: 'easypaisa' }).expect(httpStatus.CREATED);
    // The file of the refused claim was not kept.
    expect(stored.size).toBe(2);
  });

  test('the unique index backs the check even if two submissions race', async () => {
    await makeOrg();
    const base = {
      organizationId: orgId,
      submittedBy: ownerId,
      reference: 'LXP-2609-AAAAA',
      planKey: 'growth',
      months: 1,
      usdAmount: 10,
      pkrPerUsd: 280,
      amountPkr: 2800,
      paidAmountPkr: 2800,
      method: 'bank_transfer',
      transactionId: 'FT-998877',
      payerName: 'Ali',
      paidOn: new Date(),
      proof: { storageKey: 'k.png', mimeType: 'image/png', bytes: 1 },
    };
    await ManualPayment.create({ ...base, intentId: new mongoose.Types.ObjectId() });
    await expect(
      ManualPayment.create({ ...base, transactionId: 'ft-998877', intentId: new mongoose.Types.ObjectId() })
    ).rejects.toMatchObject({ code: 11000 });
  });

  test('a transaction ID from a rejected claim can be resubmitted', async () => {
    await makeOrg();
    const first = await submit(await newReference()).expect(httpStatus.CREATED);
    await request(app)
      .post(`/v1/billing/admin/manual-payments/${first.body.id}/reject`)
      .set('Authorization', `Bearer ${token(adminId)}`)
      .send({ reason: 'Screenshot is unreadable, please upload a clearer one.' })
      .expect(httpStatus.OK);
    await submit(await newReference()).expect(httpStatus.CREATED);
  });

  test('a reference can be used only once', async () => {
    await makeOrg();
    const reference = await newReference();
    await submit(reference).expect(httpStatus.CREATED);
    const res = await submit(reference, { transactionId: 'OTHER-999' }).expect(httpStatus.CONFLICT);
    expect(res.body.errorCode).toBe('REFERENCE_USED');
  });

  test('submissions are rate limited per user', async () => {
    await makeOrg();
    const statuses = [];
    for (let i = 0; i < 11; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      statuses.push((await submit('LXP-0000-AAAAA', { transactionId: `RL-${i}` })).status);
    }
    expect(statuses.slice(0, 10).every((s) => s !== httpStatus.TOO_MANY_REQUESTS)).toBe(true);
    expect(statuses[10]).toBe(httpStatus.TOO_MANY_REQUESTS);
  });

  describe('admin review', () => {
    const asAdmin = (req) => req.set('Authorization', `Bearer ${token(adminId)}`);

    test('only platform admins can see the queue', async () => {
      await makeOrg();
      await request(app)
        .get('/v1/billing/admin/manual-payments')
        .set('Authorization', `Bearer ${token(ownerId)}`)
        .expect(httpStatus.FORBIDDEN);
    });

    test('admin sees a short-lived signed proof URL', async () => {
      await makeOrg();
      const { body } = await submit(await newReference()).expect(httpStatus.CREATED);
      const res = await asAdmin(request(app).get(`/v1/billing/admin/manual-payments/${body.id}`)).expect(httpStatus.OK);
      expect(res.body.proofUrl).toMatch(/^https:\/\/signed\.example\/billing-proofs\//);
      expect(res.body.proofUrlExpiresInSeconds).toBe(300);
    });

    test('approval activates the plan, mints sequential receipts, audits, emails — and cannot happen twice', async () => {
      await makeOrg();
      const { body } = await submit(await newReference()).expect(httpStatus.CREATED);
      const approved = await asAdmin(request(app).post(`/v1/billing/admin/manual-payments/${body.id}/approve`)).expect(
        httpStatus.OK
      );
      expect(approved.body.receiptNumber).toMatch(/^LXP-R-\d{4}-000001$/);
      expect(approved.body.appliedAs).toBe('new');

      const { subscription } = await getOrg();
      expect(subscription).toMatchObject({ planType: 'growth', status: 'active', paymentSource: 'manual' });
      // Trial had 11 days left: they are kept on top of the paid month.
      expect(subscription.currentPeriodEnd.getTime()).toBeGreaterThan(addDays(new Date(), 40).getTime());

      const again = await asAdmin(request(app).post(`/v1/billing/admin/manual-payments/${body.id}/approve`)).expect(
        httpStatus.CONFLICT
      );
      expect(again.body.errorCode).toBe('ALREADY_REVIEWED');

      const audit = await BillingAudit.findOne({ action: 'manual_payment.approved' }).lean();
      expect(audit).toMatchObject({ actorType: 'admin', organizationId: orgId });
      expect(audit.to.planType).toBe('growth');

      await flush();
      expect(sendEmail).toHaveBeenCalledWith('owner@acme.example', expect.stringContaining('LXP-R-'), expect.any(String));

      const second = await submit(await newReference(), { transactionId: 'NEXT-2' }).expect(httpStatus.CREATED);
      const approved2 = await asAdmin(request(app).post(`/v1/billing/admin/manual-payments/${second.body.id}/approve`));
      expect(approved2.body.receiptNumber).toMatch(/-000002$/);
      expect(approved2.body.appliedAs).toBe('renewal');
    });

    test('rejection stores the reason, emails it, and leaves the subscription untouched', async () => {
      await makeOrg();
      const { body } = await submit(await newReference()).expect(httpStatus.CREATED);
      const res = await asAdmin(request(app).post(`/v1/billing/admin/manual-payments/${body.id}/reject`))
        .send({ reason: 'Amount not received in our account.' })
        .expect(httpStatus.OK);
      expect(res.body).toMatchObject({ status: 'rejected', rejectionReason: 'Amount not received in our account.' });
      expect((await getOrg()).subscription.planType).toBe('trial');
      await flush();
      expect(sendEmail.mock.calls.some(([, , text]) => text.includes('Amount not received'))).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────
describe('Billing scheduler', () => {
  const manualActive = (periodEnd, extra = {}) => ({
    planType: 'starter',
    status: 'active',
    paymentSource: 'manual',
    currentPeriodStart: addDays(periodEnd, -30),
    currentPeriodEnd: periodEnd,
    ...extra,
  });
  const subjects = () => sendEmail.mock.calls.filter(([to]) => to === 'owner@acme.example').map(([, s]) => s);

  test('sends the 7-day then the 3-day reminder, each exactly once', async () => {
    const now = new Date('2026-09-20T06:00:00Z');
    await makeOrg({ subscription: manualActive(new Date(now.getTime() + 6.5 * DAY_MS)) });

    expect((await billingScheduler.runOnce({ now })).reminders).toBe(1);
    expect((await billingScheduler.runOnce({ now })).reminders).toBe(0);
    const later = new Date(now.getTime() + 4 * DAY_MS);
    expect((await billingScheduler.runOnce({ now: later })).reminders).toBe(1);
    expect((await billingScheduler.runOnce({ now: later })).reminders).toBe(0);
    await flush();
    expect(subjects()).toEqual(['Your Logix Plus plan renews in 7 days', 'Your Logix Plus plan renews in 3 days']);
  });

  test('concurrent scheduler runs send a reminder only once', async () => {
    const now = new Date('2026-09-20T06:00:00Z');
    await makeOrg({ subscription: manualActive(new Date(now.getTime() + 2 * DAY_MS)) });
    const results = await Promise.all([1, 2, 3].map(() => billingScheduler.runOnce({ now })));
    expect(results.reduce((n, r) => n + r.reminders, 0)).toBe(1);
  });

  test('active → gracePeriod at period end → expired (read-only) after 5 days, one email each', async () => {
    const end = new Date('2026-09-20T00:00:00Z');
    await makeOrg({ subscription: manualActive(end) });

    await billingScheduler.runOnce({ now: new Date(end.getTime() + DAY_MS) });
    let { subscription } = await getOrg();
    expect(subscription.status).toBe('gracePeriod');
    expect(subscription.graceEndsAt).toEqual(addDays(end, 5));

    await billingScheduler.runOnce({ now: new Date(end.getTime() + 2 * DAY_MS) }); // no change
    await billingScheduler.runOnce({ now: addDays(end, 5) });
    ({ subscription } = await getOrg());
    expect(subscription.status).toBe('expired');

    await flush();
    expect(subjects()).toEqual([
      'Your Logix Plus plan has ended — grace period started',
      'Your Logix Plus account is now read-only',
    ]);
    const transitions = await BillingAudit.find({ action: 'status.changed' }).lean();
    expect(transitions.map((t) => `${t.from.status}→${t.to.status}`)).toEqual(['active→gracePeriod', 'gracePeriod→expired']);
  });

  test('long-lapsed accounts are persisted silently (no surprise emails after deploy)', async () => {
    await makeOrg({ subscription: { planType: 'single', status: 'active', endDate: new Date('2025-01-01') } });
    await billingScheduler.runOnce({ now: new Date('2026-09-20T00:00:00Z') });
    expect((await getOrg()).subscription.status).toBe('expired');
    await flush();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('applies a scheduled manual downgrade at its effective date, not before', async () => {
    const switchAt = new Date('2026-10-01T00:00:00Z');
    await makeOrg({
      subscription: manualActive(new Date('2026-11-01T00:00:00Z'), {
        planType: 'business',
        pendingPlanType: 'starter',
        pendingPlanEffectiveAt: switchAt,
      }),
    });
    await billingScheduler.runOnce({ now: new Date(switchAt.getTime() - 1000) });
    expect((await getOrg()).subscription.planType).toBe('business');
    await billingScheduler.runOnce({ now: switchAt });
    const { subscription } = await getOrg();
    expect(subscription).toMatchObject({ planType: 'starter', pendingPlanType: null, limits: { maxUsers: 3 } });
  });

  test('the cron endpoint is hidden without a secret and rejects a wrong one', async () => {
    config.billing.cronSecret = '';
    await request(app).post('/v1/billing/cron/run').expect(httpStatus.NOT_FOUND);
    config.billing.cronSecret = 'cron-secret-value';
    await request(app).post('/v1/billing/cron/run').set('x-cron-secret', 'nope').expect(httpStatus.UNAUTHORIZED);
    const res = await request(app).post('/v1/billing/cron/run').set('x-cron-secret', 'cron-secret-value');
    expect(res.status).toBe(httpStatus.OK);
    expect(res.body).toHaveProperty('transitions');
    config.billing.cronSecret = '';
  });
});
