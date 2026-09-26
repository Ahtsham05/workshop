/**
 * Customer-facing billing emails. Sending is best-effort: a mail failure is logged and never
 * rolls back or blocks the billing change that triggered it.
 */
const moment = require('moment');
const { User } = require('../../models');
const config = require('../../config/config');
const logger = require('../../config/logger');
const emailService = require('../email.service');

const fmtDate = (d) =>
  d
    ? moment(d)
        .utcOffset(5 * 60)
        .format('D MMM YYYY')
    : '—';
const billingUrl = () => `${config.billing.frontendUrl}/settings/billing`;

/** Owner email first, org contact email as well if different. */
const recipientsFor = async (org) => {
  const owner = org.owner ? await User.findById(org.owner).select('email').lean() : null;
  return [...new Set([owner?.email, org.email].filter(Boolean).map((e) => e.toLowerCase()))];
};

const send = async (org, subject, lines) => {
  try {
    const to = await recipientsFor(org);
    if (!to.length) return;
    const text = [...lines, '', `Manage billing: ${billingUrl()}`, '', '— Logix Plus'].join('\n');
    await Promise.all(to.map((address) => emailService.sendEmail(address, subject, text)));
  } catch (err) {
    logger.warn(`billing email "${subject}" to org ${org._id} failed: ${err.message}`);
  }
};

const manualPaymentApproved = (org, payment, plan) =>
  send(org, `Payment received — receipt ${payment.receiptNumber}`, [
    `Hi ${org.name},`,
    '',
    `We have verified your payment and your ${plan.name} plan is active.`,
    '',
    `Receipt number: ${payment.receiptNumber}`,
    `Reference:      ${payment.reference}`,
    `Amount:         PKR ${payment.paidAmountPkr.toLocaleString('en-PK')}`,
    `Method:         ${payment.method.replace('_', ' ')} (transaction ${payment.transactionId})`,
    `Plan:           ${plan.name}, ${payment.months} month(s)`,
    payment.appliedAs === 'scheduledDowngrade'
      ? `Your current plan continues until ${fmtDate(payment.appliedPeriodStart)}; ${
          plan.name
        } runs from then until ${fmtDate(payment.appliedPeriodEnd)}.`
      : `Paid through:   ${fmtDate(payment.appliedPeriodEnd)}`,
  ]);

const manualPaymentRejected = (org, payment) =>
  send(org, 'We could not verify your payment', [
    `Hi ${org.name},`,
    '',
    `Your payment submission (reference ${payment.reference}, transaction ${payment.transactionId}) was not approved.`,
    '',
    `Reason: ${payment.rejectionReason}`,
    '',
    'You can submit it again with the correct details from the billing page. Nothing has changed on your account.',
  ]);

const renewalReminder = (org, planName, periodEnd, daysBefore) =>
  send(org, `Your Logix Plus plan renews in ${daysBefore} day${daysBefore === 1 ? '' : 's'}`, [
    `Hi ${org.name},`,
    '',
    `Your ${planName} plan is paid through ${fmtDate(periodEnd)}.`,
    'Manual payments do not renew automatically — please send your renewal payment and submit the proof from the billing page before that date.',
  ]);

const trialEndingReminder = (org, trialEnd, daysLeft) =>
  send(org, `Your Logix Plus free trial ends in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, [
    `Hi ${org.name},`,
    '',
    `Your free trial ends on ${fmtDate(trialEnd)}.`,
    'Choose a plan from the billing page to keep creating invoices and records. After the trial your data stays safe and viewable, but the account becomes read-only.',
  ]);

const gracePeriodStarted = (org, planName, graceEndsAt) =>
  send(org, 'Your Logix Plus plan has ended — grace period started', [
    `Hi ${org.name},`,
    '',
    `Your ${planName} plan period has ended. Everything keeps working until ${fmtDate(graceEndsAt)}.`,
    'After that the account becomes read-only: you can still view and export all your data, but not create new records until you renew.',
  ]);

const becameReadOnly = (org, planName) =>
  send(org, 'Your Logix Plus account is now read-only', [
    `Hi ${org.name},`,
    '',
    `Your ${planName} plan has lapsed, so the account is now read-only.`,
    'All your data is safe — you can view and export it at any time. Renew to create new invoices and records again.',
  ]);

module.exports = {
  manualPaymentApproved,
  manualPaymentRejected,
  renewalReminder,
  trialEndingReminder,
  gracePeriodStarted,
  becameReadOnly,
  fmtDate,
};
