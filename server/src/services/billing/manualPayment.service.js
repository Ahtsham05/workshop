/**
 * Manual payments (bank transfer / JazzCash / Easypaisa) for Pakistani customers.
 *
 * Flow: customer opens instructions → an intent with a unique reference and a locked PKR
 * quote is created → customer pays and submits proof against that reference → a platform
 * admin approves (subscription activated/renewed through the same writer Polar uses, receipt
 * number minted, email sent) or rejects with a reason.
 */
const crypto = require('crypto');
const httpStatus = require('http-status');
const moment = require('moment');
const { ManualPayment, ManualPaymentIntent, Organization } = require('../../models');
const { normalizeTransactionId } = require('../../models/manualPayment.model');
const ApiError = require('../../utils/ApiError');
const { PROOF_UPLOAD } = require('../../config/billing');
const logger = require('../../config/logger');
const planService = require('./plan.service');
const billingSettingsService = require('./billingSettings.service');
const billingAudit = require('./billingAudit.service');
const billingEmail = require('./billingEmail.service');
const proofStorage = require('./proofStorage');
const polarService = require('./polar.service');
const { applySubscriptionPatch } = require('./subscriptionWriter');
const { computeManualApproval, comparePlans, findLimitOverages } = require('./subscriptionState');
const entitlementService = require('../entitlement.service');

const errorWithCode = (status, message, errorCode, details) => {
  const err = new ApiError(status, message);
  err.errorCode = errorCode;
  if (details) err.details = details;
  return err;
};

const assertManualAllowed = (org) => {
  const routing = entitlementService.getPaymentRouting(org);
  if (!routing.country) {
    throw errorWithCode(httpStatus.BAD_REQUEST, 'Set your business country in Settings → Business Profile first.', 'COUNTRY_REQUIRED');
  }
  if (!routing.allowed.includes('manual')) {
    throw errorWithCode(
      httpStatus.FORBIDDEN,
      'Manual payment is only available for Pakistani businesses. Please pay by card.',
      'MANUAL_NOT_AVAILABLE'
    );
  }
};

const assertNoLivePolarSubscription = (org) => {
  if (polarService.hasLivePolarSubscription(org) && org.subscription.status !== 'canceled') {
    throw errorWithCode(
      httpStatus.CONFLICT,
      'You have an active card subscription. Cancel it from the billing portal before paying manually, so you are not charged twice.',
      'POLAR_SUBSCRIPTION_EXISTS'
    );
  }
};

/** "LXP-2609-7F3KQ" — month stamp + 5 unambiguous base32 chars. */
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeReference = (now) => {
  const bytes = crypto.randomBytes(5);
  const suffix = Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
  return `LXP-${moment(now).utcOffset(300).format('YYMM')}-${suffix}`;
};

const priceInPkr = (plan, months, pkrPerUsd) => {
  const usdAmount = plan.priceUsdMonthly * months;
  // Round up to the next 10 rupees — easy to type into a banking app, never short.
  return { usdAmount, amountPkr: Math.ceil((usdAmount * pkrPerUsd) / 10) * 10 };
};

/**
 * Create a payment reference + locked PKR quote and return everything the instructions
 * screen shows (account details, amount, reference, warnings).
 */
const createIntent = async ({ org, user, planKey, months, now = new Date() }) => {
  assertManualAllowed(org);
  assertNoLivePolarSubscription(org);
  const plan = await planService.getPurchasablePlanOrThrow(planKey);
  const settings = await billingSettingsService.getSettings();
  const { usdAmount, amountPkr } = priceInPkr(plan, months, settings.pkrPerUsd);

  let intent;
  for (let attempt = 0; attempt < 5 && !intent; attempt += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      intent = await ManualPaymentIntent.create({
        organizationId: org._id,
        createdBy: user._id || user.id,
        reference: makeReference(now),
        planKey: plan.key,
        months,
        usdAmount,
        pkrPerUsd: settings.pkrPerUsd,
        amountPkr,
        expiresAt: new Date(now.getTime() + settings.intentTtlHours * 3600 * 1000),
      });
    } catch (err) {
      if (err.code !== 11000) throw err;
    }
  }
  if (!intent) throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Could not create a payment reference, please retry.');

  // Warn now (before they pay) if this purchase is a downgrade their usage exceeds.
  const ent = await entitlementService.getEntitlement(org, { now });
  const direction = comparePlans(ent.plan, plan);
  const warnings =
    direction === 'downgrade' ? findLimitOverages(plan, await entitlementService.getUsage(org._id, { now })) : [];

  return {
    reference: intent.reference,
    plan: { key: plan.key, name: plan.name, priceUsdMonthly: plan.priceUsdMonthly },
    months,
    usdAmount,
    pkrPerUsd: settings.pkrPerUsd,
    amountPkr,
    expiresAt: intent.expiresAt,
    paymentDetails: billingSettingsService.publicPaymentDetails(settings),
    direction,
    warnings,
  };
};

/**
 * Customer submits proof against a reference. The intent is claimed atomically, so a double
 * click or replay cannot create two claims for one reference.
 */
const submit = async ({ org, user, body, file, now = new Date() }) => {
  assertManualAllowed(org);
  assertNoLivePolarSubscription(org);
  const { mimeType, bytes } = proofStorage.validateProofFile(file);

  const intent = await ManualPaymentIntent.findOne({ reference: body.reference, organizationId: org._id }).lean();
  if (!intent) throw new ApiError(httpStatus.NOT_FOUND, 'Payment reference not found. Start again from the billing page.');
  if (intent.usedAt) {
    throw errorWithCode(httpStatus.CONFLICT, 'A payment was already submitted for this reference.', 'REFERENCE_USED');
  }
  if (intent.expiresAt <= now) {
    throw errorWithCode(
      httpStatus.GONE,
      'This payment reference has expired. Please get a new one from the billing page.',
      'REFERENCE_EXPIRED'
    );
  }

  const transactionIdNorm = normalizeTransactionId(body.transactionId);
  const duplicate = await ManualPayment.exists({
    method: body.method,
    transactionIdNorm,
    status: { $in: ['pending', 'approved'] },
  });
  if (duplicate) {
    throw errorWithCode(httpStatus.CONFLICT, 'This transaction ID has already been submitted.', 'DUPLICATE_TRANSACTION');
  }

  const claimed = await ManualPaymentIntent.findOneAndUpdate(
    { _id: intent._id, usedAt: null },
    { $set: { usedAt: now } },
    { new: true, lean: true }
  );
  if (!claimed)
    throw errorWithCode(httpStatus.CONFLICT, 'A payment was already submitted for this reference.', 'REFERENCE_USED');

  let storageKey;
  try {
    storageKey = await proofStorage.save(file.buffer, { organizationId: String(org._id), mimeType });
    const payment = await ManualPayment.create({
      organizationId: org._id,
      submittedBy: user._id || user.id,
      intentId: intent._id,
      reference: intent.reference,
      planKey: intent.planKey,
      months: intent.months,
      usdAmount: intent.usdAmount,
      pkrPerUsd: intent.pkrPerUsd,
      amountPkr: intent.amountPkr,
      paidAmountPkr: body.paidAmountPkr,
      method: body.method,
      transactionId: body.transactionId,
      transactionIdNorm,
      payerName: body.payerName,
      paidOn: body.paidOn,
      proof: { storageKey, mimeType, bytes },
    });
    await billingAudit.record({
      organizationId: org._id,
      ...billingAudit.actorFromUser(user),
      action: 'manual_payment.submitted',
      meta: {
        paymentId: payment._id,
        reference: payment.reference,
        method: payment.method,
        amountPkr: payment.paidAmountPkr,
      },
    });
    return payment;
  } catch (err) {
    // Give the reference back so the customer can retry, and don't leave an orphaned file.
    await ManualPaymentIntent.updateOne({ _id: intent._id }, { $set: { usedAt: null } });
    if (storageKey) proofStorage.remove(storageKey).catch(() => {});
    if (err.code === 11000) {
      throw errorWithCode(httpStatus.CONFLICT, 'This transaction ID has already been submitted.', 'DUPLICATE_TRANSACTION');
    }
    throw err;
  }
};

/** Customer-facing history — never exposes the proof location. */
const listForOrg = (organizationId, options) =>
  ManualPayment.paginate({ organizationId }, { sortBy: 'createdAt:desc', limit: 20, ...options }).then((page) => ({
    ...page,
    results: page.results.map((p) => {
      const json = p.toJSON();
      delete json.proof;
      delete json.transactionIdNorm;
      return json;
    }),
  }));

// ── Admin ────────────────────────────────────────────────────────────────────────────

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const adminList = async ({ status, method, search, page, limit }) => {
  const filter = {};
  if (status) filter.status = status;
  if (method) filter.method = method;
  if (search) {
    const re = new RegExp(escapeRegex(search.trim()), 'i');
    const orgIds = await Organization.find({ name: re }).select('_id').limit(50).lean();
    filter.$or = [
      { reference: re },
      { transactionIdNorm: new RegExp(escapeRegex(normalizeTransactionId(search)), 'i') },
      { payerName: re },
      { organizationId: { $in: orgIds.map((o) => o._id) } },
    ];
  }
  return ManualPayment.paginate(filter, {
    sortBy: status === 'pending' ? 'createdAt:asc' : 'createdAt:desc',
    page,
    limit,
    populate: [
      { path: 'organizationId', select: 'name email countryCode' },
      { path: 'submittedBy', select: 'name email' },
      { path: 'reviewedBy', select: 'name email' },
    ],
  });
};

const adminGet = async (id) => {
  const payment = await ManualPayment.findById(id)
    .populate('organizationId', 'name email countryCode subscription')
    .populate('submittedBy', 'name email')
    .populate('reviewedBy', 'name email');
  if (!payment) throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  const json = payment.toJSON();
  json.proofUrl = proofStorage.signedUrl(payment.proof.storageKey);
  json.proofUrlExpiresInSeconds = PROOF_UPLOAD.signedUrlTtlSeconds;
  json.amountMismatch = payment.paidAmountPkr < payment.amountPkr;
  return json;
};

/** Claim a pending payment for review; only one reviewer can win. */
const claimPending = async (id, $set) => {
  const payment = await ManualPayment.findOneAndUpdate({ _id: id, status: 'pending' }, { $set }, { new: true });
  if (payment) return payment;
  const existing = await ManualPayment.findById(id).select('status').lean();
  if (!existing) throw new ApiError(httpStatus.NOT_FOUND, 'Payment not found');
  throw errorWithCode(httpStatus.CONFLICT, `This payment was already ${existing.status}.`, 'ALREADY_REVIEWED');
};

const approve = async ({ id, admin, now = new Date() }) => {
  const payment = await claimPending(id, { status: 'approved', reviewedBy: admin._id || admin.id, reviewedAt: now });
  try {
    const org = await Organization.findById(payment.organizationId).select('name owner email subscription').lean();
    if (!org) throw new ApiError(httpStatus.NOT_FOUND, 'Organization no longer exists');
    assertNoLivePolarSubscription(org);

    const ent = await entitlementService.getEntitlement(org, { now });
    const targetPlan = await planService.getPlanOrThrow(payment.planKey);
    const result = computeManualApproval({
      state: ent.state,
      currentPlan: ent.plan,
      targetPlan,
      months: payment.months,
      now,
    });
    // Apply a due-but-unpersisted scheduled downgrade before layering this payment on top.
    const patch = { ...result.patch };
    if (ent.state.pendingPlanDue && patch.planType === undefined) patch.planType = ent.state.planKey;

    const receiptNumber = await billingSettingsService.nextReceiptNumber(now);
    await applySubscriptionPatch({
      org,
      patch,
      now,
      audit: {
        ...billingAudit.actorFromUser(admin, 'admin'),
        action: 'manual_payment.approved',
        meta: { paymentId: payment._id, receiptNumber, appliedAs: result.appliedAs, reference: payment.reference },
      },
    });

    payment.receiptNumber = receiptNumber;
    payment.appliedAs = result.appliedAs;
    payment.appliedPeriodStart = result.periodStart;
    payment.appliedPeriodEnd = result.periodEnd;
    await payment.save();

    billingEmail.manualPaymentApproved(org, payment, targetPlan); // best-effort, not awaited
    return payment;
  } catch (err) {
    // Compensate: put it back in the queue so the admin can retry — never leave an
    // "approved" payment that did not activate anything.
    await ManualPayment.updateOne(
      { _id: payment._id, receiptNumber: null },
      { $set: { status: 'pending', reviewedBy: null, reviewedAt: null } }
    );
    logger.error(`manual payment ${payment._id} approval rolled back: ${err.message}`);
    throw err;
  }
};

const reject = async ({ id, admin, reason, now = new Date() }) => {
  const payment = await claimPending(id, {
    status: 'rejected',
    reviewedBy: admin._id || admin.id,
    reviewedAt: now,
    rejectionReason: reason,
  });
  const org = await Organization.findById(payment.organizationId).select('name owner email').lean();
  await billingAudit.record({
    organizationId: payment.organizationId,
    ...billingAudit.actorFromUser(admin, 'admin'),
    action: 'manual_payment.rejected',
    meta: { paymentId: payment._id, reference: payment.reference, reason },
  });
  if (org) billingEmail.manualPaymentRejected(org, payment);
  return payment;
};

module.exports = {
  priceInPkr,
  makeReference,
  createIntent,
  submit,
  listForOrg,
  adminList,
  adminGet,
  approve,
  reject,
};
