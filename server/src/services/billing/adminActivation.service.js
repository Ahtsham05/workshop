/**
 * System admin activates / renews / changes an organization's plan directly — no customer
 * payment claim needed (cash at the office, bank transfer seen on the statement, a free
 * month for a reference customer, …).
 *
 * Period maths is shared with customer payment approval (computeManualApproval), so an admin
 * activation behaves exactly like an approved payment would: a trial's remaining days are
 * kept, a renewal of the same plan extends from the current end date, an upgrade credits the
 * unused time and a downgrade is scheduled for the end of the paid period. A custom end date
 * overrides that and sets the period explicitly.
 *
 * Optionally records the money received as an approved ManualPayment (with a receipt number),
 * so it shows in the payments queue, the customer's payment history and the admin counters.
 */
const httpStatus = require('http-status');
const { ManualPayment, ManualPaymentIntent, Organization } = require('../../models');
const { normalizeTransactionId } = require('../../models/manualPayment.model');
const ApiError = require('../../utils/ApiError');
const logger = require('../../config/logger');
const { MANUAL_BILLING_MONTHS } = require('../../config/billing');
const planService = require('./plan.service');
const billingSettingsService = require('./billingSettings.service');
const billingAudit = require('./billingAudit.service');
const billingEmail = require('./billingEmail.service');
const polarService = require('./polar.service');
const manualPaymentService = require('./manualPayment.service');
const { applySubscriptionPatch } = require('./subscriptionWriter');
const { computeManualApproval, comparePlans, findLimitOverages } = require('./subscriptionState');
const entitlementService = require('../entitlement.service');

const DAY = 24 * 60 * 60 * 1000;

const loadOrg = async (orgId) => {
  const org = await Organization.findById(orgId).select('name owner email phone subscription countryCode country').populate('owner', 'name email').lean();
  if (!org) throw new ApiError(httpStatus.NOT_FOUND, 'Organization not found');
  return org;
};

const assertNoCardSubscription = (org) => {
  if (polarService.hasLivePolarSubscription(org) && org.subscription.status !== 'canceled') {
    throw new ApiError(
      httpStatus.CONFLICT,
      'This organization pays by card (Polar). Cancel the card subscription in Polar first, so the customer is not charged twice.'
    );
  }
};

/** The selectable plans (no trial), in display order. */
const activatablePlans = async () =>
  (await planService.listPlans()).filter((p) => p.key !== 'trial' && p.isActive !== false);

/**
 * Work out what an activation would do, without writing anything.
 * @param {{ org, planKey: string, months?: number, until?: Date, now?: Date }} args
 */
const computeActivation = async ({ org, planKey, months, until, now = new Date() }) => {
  const targetPlan = await planService.getPlanOrThrow(planKey);
  if (targetPlan.key === 'trial') throw new ApiError(httpStatus.BAD_REQUEST, 'Pick a paid plan');
  const ent = await entitlementService.getEntitlement(org, { now });
  const direction = ent.state.planKey === 'trial' ? 'new' : comparePlans(ent.plan, targetPlan);

  let result;
  if (until) {
    const end = new Date(until);
    if (!(end.getTime() > now.getTime() + 60 * 60 * 1000)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'The end date must be in the future');
    }
    result = {
      appliedAs: 'custom',
      periodStart: now,
      periodEnd: end,
      patch: {
        status: 'active',
        paymentSource: 'manual',
        graceEndsAt: null,
        cancelAtPeriodEnd: false,
        planType: targetPlan.key,
        currentPeriodStart: now,
        currentPeriodEnd: end,
        pendingPlanType: null,
        pendingPlanEffectiveAt: null,
      },
    };
  } else {
    if (!MANUAL_BILLING_MONTHS.includes(months)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid duration');
    result = computeManualApproval({ state: ent.state, currentPlan: ent.plan, targetPlan, months, now });
    // Same as payment approval: apply a due-but-unpersisted scheduled downgrade first.
    if (ent.state.pendingPlanDue && result.patch.planType === undefined) {
      result = { ...result, patch: { ...result.patch, planType: ent.state.planKey } };
    }
  }

  const settings = await billingSettingsService.getSettings();
  const quoteMonths = months || Math.max(1, Math.round((result.periodEnd - now) / (30 * DAY)));
  const quote = manualPaymentService.priceInPkr(targetPlan, quoteMonths, settings.pkrPerUsd);
  const warnings =
    direction === 'downgrade' ? findLimitOverages(targetPlan, await entitlementService.getUsage(org._id, { now })) : [];

  return {
    targetPlan,
    current: {
      planKey: ent.state.planKey,
      planName: ent.plan?.name || ent.state.planKey,
      status: ent.state.status,
      currentPeriodEnd: ent.state.currentPeriodEnd || null,
      paymentSource: ent.state.paymentSource || null,
    },
    direction,
    result,
    quote: { months: quoteMonths, usdAmount: quote.usdAmount, amountPkr: quote.amountPkr, pkrPerUsd: settings.pkrPerUsd },
    warnings,
  };
};

const publicPreview = ({ targetPlan, current, direction, result, quote, warnings }) => ({
  plan: { key: targetPlan.key, name: targetPlan.name, priceUsdMonthly: targetPlan.priceUsdMonthly },
  current,
  direction,
  appliedAs: result.appliedAs,
  periodStart: result.periodStart,
  periodEnd: result.periodEnd,
  // A scheduled downgrade keeps the current plan until periodStart.
  scheduled: result.appliedAs === 'scheduledDowngrade',
  quote,
  warnings,
});

/** Plans + current status, for the dialog to open with. */
const getOptions = async (orgId) => {
  const org = await loadOrg(orgId);
  const [plans, ent, settings] = await Promise.all([
    activatablePlans(),
    entitlementService.getEntitlement(org),
    billingSettingsService.getSettings(),
  ]);
  return {
    organization: { id: String(org._id), name: org.name, ownerName: org.owner?.name || '', ownerEmail: org.owner?.email || org.email || '' },
    current: {
      planKey: ent.state.planKey,
      planName: ent.plan?.name || ent.state.planKey,
      status: ent.state.status,
      currentPeriodEnd: ent.state.currentPeriodEnd || null,
      paymentSource: ent.state.paymentSource || null,
      hasCardSubscription: polarService.hasLivePolarSubscription(org) && org.subscription.status !== 'canceled',
    },
    plans: plans.map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description || '',
      badge: p.badge || null,
      priceUsdMonthly: p.priceUsdMonthly,
      pricePkrMonthly: Math.ceil((p.priceUsdMonthly * settings.pkrPerUsd) / 10) * 10,
      limits: p.limits,
      isPublic: p.isPublic !== false,
    })),
    months: MANUAL_BILLING_MONTHS,
    pkrPerUsd: settings.pkrPerUsd,
  };
};

const preview = async ({ orgId, planKey, months, until }) => {
  const org = await loadOrg(orgId);
  return publicPreview(await computeActivation({ org, planKey, months, until }));
};

/**
 * @param {object} args
 * @param {string} args.orgId
 * @param {object} args.admin req.user
 * @param {string} args.planKey
 * @param {number} [args.months]   1/3/6/12 — or
 * @param {Date}   [args.until]    explicit end date
 * @param {string} args.note       why (shown in the billing audit)
 * @param {object} [args.payment]  { amountPkr, method, transactionId?, payerName?, paidOn? } — money received
 * @param {boolean} [args.notifyOwner]
 */
const activate = async ({ orgId, admin, planKey, months, until, note, payment = null, notifyOwner = true, now = new Date() }) => {
  const org = await loadOrg(orgId);
  assertNoCardSubscription(org);
  const calc = await computeActivation({ org, planKey, months, until, now });
  const { targetPlan, result } = calc;
  const adminId = admin._id || admin.id;

  // 1. Record the payment first (if any), so a duplicate transaction ID fails before the plan changes.
  let paymentDoc = null;
  let intent = null;
  if (payment?.transactionId?.trim()) {
    const dup = await ManualPayment.exists({
      method: payment.method,
      transactionIdNorm: normalizeTransactionId(payment.transactionId),
      status: { $in: ['pending', 'approved'] },
    });
    if (dup) throw new ApiError(httpStatus.CONFLICT, 'This transaction ID is already recorded for another payment.');
  }
  if (payment) {
    const paidMonths = months || calc.quote.months;
    const monthsForRecord = MANUAL_BILLING_MONTHS.includes(paidMonths) ? paidMonths : 1;
    const settings = await billingSettingsService.getSettings();
    for (let attempt = 0; attempt < 5 && !intent; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop
        intent = await ManualPaymentIntent.create({
          organizationId: org._id,
          createdBy: adminId,
          reference: manualPaymentService.makeReference(now),
          planKey: targetPlan.key,
          months: monthsForRecord,
          usdAmount: calc.quote.usdAmount,
          pkrPerUsd: settings.pkrPerUsd,
          amountPkr: calc.quote.amountPkr,
          expiresAt: now,
          usedAt: now,
        });
      } catch (err) {
        if (err.code !== 11000) throw err;
      }
    }
    if (!intent) throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Could not create a payment reference, please retry.');
    try {
      paymentDoc = await ManualPayment.create({
        organizationId: org._id,
        submittedBy: adminId,
        intentId: intent._id,
        reference: intent.reference,
        planKey: targetPlan.key,
        months: monthsForRecord,
        usdAmount: calc.quote.usdAmount,
        pkrPerUsd: settings.pkrPerUsd,
        amountPkr: calc.quote.amountPkr,
        paidAmountPkr: payment.amountPkr,
        method: payment.method,
        // No transaction ID for cash — the reference keeps the unique index happy.
        transactionId: payment.transactionId?.trim() || intent.reference,
        payerName: payment.payerName?.trim() || org.owner?.name || org.name,
        paidOn: payment.paidOn || now,
        status: 'approved',
        reviewedBy: adminId,
        reviewedAt: now,
        recordedByAdmin: true,
        receiptNumber: await billingSettingsService.nextReceiptNumber(now),
        appliedAs: result.appliedAs === 'custom' ? 'new' : result.appliedAs,
        appliedPeriodStart: result.periodStart,
        appliedPeriodEnd: result.periodEnd,
      });
    } catch (err) {
      await ManualPaymentIntent.deleteOne({ _id: intent._id });
      if (err.code === 11000) {
        throw new ApiError(httpStatus.CONFLICT, 'This transaction ID is already recorded for another payment.');
      }
      throw err;
    }
  }

  // 2. Change the subscription (one audited write).
  try {
    await applySubscriptionPatch({
      org,
      patch: result.patch,
      now,
      audit: {
        ...billingAudit.actorFromUser(admin, 'admin'),
        action: 'subscription.admin_activated',
        meta: {
          note,
          planKey: targetPlan.key,
          months: months || null,
          until: until || null,
          appliedAs: result.appliedAs,
          periodEnd: result.periodEnd,
          paymentId: paymentDoc?._id || null,
          receiptNumber: paymentDoc?.receiptNumber || null,
          amountPkr: paymentDoc?.paidAmountPkr ?? null,
          method: paymentDoc?.method || null,
          complimentary: !paymentDoc,
        },
      },
    });
  } catch (err) {
    // Never leave a receipt for a plan that was not activated.
    if (paymentDoc) await ManualPayment.deleteOne({ _id: paymentDoc._id });
    if (intent) await ManualPaymentIntent.deleteOne({ _id: intent._id });
    logger.error(`[admin-activate] ${org._id} failed, payment record rolled back: ${err.message}`);
    throw err;
  }

  if (notifyOwner) {
    // billingEmail looks the owner up by id (best-effort, not awaited).
    const mailOrg = { ...org, owner: org.owner?._id || org.owner };
    if (paymentDoc) billingEmail.manualPaymentApproved(mailOrg, paymentDoc, targetPlan);
    else billingEmail.planActivatedByAdmin(mailOrg, targetPlan, result);
  }
  logger.info(
    `[admin-activate] ${admin.email} set "${org.name}" (${org._id}) to ${targetPlan.key} as ${result.appliedAs} until ${new Date(
      result.periodEnd
    ).toISOString()}${paymentDoc ? `, receipt ${paymentDoc.receiptNumber}` : ' (complimentary)'}`
  );

  return {
    ...publicPreview(calc),
    receiptNumber: paymentDoc?.receiptNumber || null,
    paymentId: paymentDoc ? String(paymentDoc._id) : null,
  };
};

module.exports = { getOptions, preview, activate };
