/**
 * Platform sales alarms for system admins:
 *  - a new trial signup → push + email to every system_admin, once;
 *  - a lead's follow-up time arrives → push, once per follow-up date (snoozing or
 *    rescheduling sets a new date, which re-arms it).
 * The in-app watchdog (client `useSignupLeadWatchdog`) is the always-on path while the app is
 * open; this covers a closed/background tab. Also re-syncs leads every 30 min so an org that
 * starts paying moves to Won on its own.
 */
const logger = require('../config/logger');
const { User, Organization, SignupLead } = require('../models');
const pushNotificationService = require('../services/pushNotification.service');
const emailService = require('../services/email.service');

const RUN_INTERVAL_MS = 60 * 1000;
const SYNC_EVERY_MS = 30 * 60 * 1000;
const OPEN_STAGES = ['new', 'contacted', 'demo', 'negotiation'];

let isRunning = false;
let lastSyncAt = 0;

const systemAdmins = () => User.find({ systemRole: 'system_admin', isActive: true }).select('_id name email').lean();

const pushToAdmins = async (admins, payload) => {
  await Promise.all(
    admins.map((a) =>
      pushNotificationService.sendToUser(a._id, payload).catch((err) => logger.warn(`Lead push failed: ${err.message}`))
    )
  );
};

/** Alert for one freshly created signup lead. Idempotent via signupAlertSentAt. */
const alertNewSignup = async (leadId) => {
  const lead = await SignupLead.findOneAndUpdate(
    { _id: leadId, signupAlertSentAt: null },
    { $set: { signupAlertSentAt: new Date() } },
    { new: true }
  ).lean();
  if (!lead) return;
  const org = await Organization.findById(lead.organizationId)
    .select('name businessType phone email city')
    .populate('owner', 'name email')
    .lean();
  if (!org) return;
  const admins = await systemAdmins();
  if (!admins.length) return;

  const who = [org.owner?.name, org.phone || org.owner?.email].filter(Boolean).join(' · ');
  await pushToAdmins(admins, {
    title: `🎉 New trial signup: ${org.name}`,
    body: `${org.businessType || 'Business'}${org.city ? `, ${org.city}` : ''} — ${who}. Call within the hour.`,
    tag: `signup-${lead._id}`,
    url: `/admin?tab=leads&lead=${lead.organizationId}`,
  });

  const lines = [
    `A new business just started a free trial.`,
    ``,
    `Business: ${org.name}`,
    `Type: ${org.businessType || '—'}`,
    `Owner: ${org.owner?.name || '—'} (${org.owner?.email || '—'})`,
    `Phone: ${org.phone || '—'}`,
    `Email: ${org.email || '—'}`,
    `City: ${org.city || '—'}`,
    ``,
    `First step: a welcome call within the hour. The full follow-up plan is ready in Admin → Leads.`,
  ];
  await Promise.all(
    admins
      .filter((a) => a.email)
      .map((a) =>
        emailService
          .sendEmail(a.email, `New trial signup: ${org.name}`, lines.join('\n'))
          .catch((err) => logger.warn(`Signup alert email failed: ${err.message}`))
      )
  );
};

const tick = async () => {
  if (isRunning) return;
  isRunning = true;
  try {
    // eslint-disable-next-line global-require
    const signupLeadService = require('../services/signupLead.service');
    if (Date.now() - lastSyncAt > SYNC_EVERY_MS) {
      lastSyncAt = Date.now();
      await signupLeadService.syncLeads();
    }

    // Missed signup alerts (e.g. the server restarted between creating the lead and sending).
    const pending = await SignupLead.find({ source: 'self_signup', signupAlertSentAt: null, acknowledgedAt: null })
      .select('_id')
      .limit(20)
      .lean();
    for (const l of pending) {
      // eslint-disable-next-line no-await-in-loop
      await alertNewSignup(l._id);
    }

    const now = new Date();
    const due = await SignupLead.find({
      stage: { $in: OPEN_STAGES },
      nextFollowUpAt: { $ne: null, $lte: now },
      $expr: { $ne: ['$followUpAlertedFor', '$nextFollowUpAt'] },
    })
      .select('_id organizationId nextFollowUpAt nextFollowUpNote')
      .limit(50)
      .lean();
    if (due.length) {
      const admins = await systemAdmins();
      const orgs = await Organization.find({ _id: { $in: due.map((d) => d.organizationId) } })
        .select('name phone')
        .lean();
      const orgById = new Map(orgs.map((o) => [String(o._id), o]));
      for (const lead of due) {
        // Claim first (atomic), so two server processes never both ring the same alarm.
        // eslint-disable-next-line no-await-in-loop
        const claim = await SignupLead.updateOne(
          { _id: lead._id, nextFollowUpAt: lead.nextFollowUpAt, followUpAlertedFor: { $ne: lead.nextFollowUpAt } },
          { $set: { followUpAlertedFor: lead.nextFollowUpAt } }
        );
        const org = orgById.get(String(lead.organizationId));
        if (claim.modifiedCount && org && admins.length) {
          // eslint-disable-next-line no-await-in-loop
          await pushToAdmins(admins, {
            title: `⏰ Follow up: ${org.name}`,
            body: `${lead.nextFollowUpNote || 'Follow-up due'}${org.phone ? ` — ${org.phone}` : ''}`,
            tag: `lead-followup-${lead._id}`,
            url: `/admin?tab=leads&lead=${lead.organizationId}`,
          });
        }
      }
      logger.info(`Signup lead scheduler: ${due.length} follow-up alarm(s)`);
    }
  } catch (err) {
    logger.error(`Signup lead scheduler error: ${err.message}`);
  } finally {
    isRunning = false;
  }
};

const startSignupLeadScheduler = () => {
  tick();
  setInterval(tick, RUN_INTERVAL_MS);
  logger.info('Scheduler started: signup leads (every 60s)');
};

module.exports = { startSignupLeadScheduler, alertNewSignup, tick };
