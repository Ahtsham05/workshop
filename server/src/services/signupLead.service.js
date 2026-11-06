/**
 * Platform sales pipeline for self-service signups (system_admin only).
 *
 * Every Organization gets one SignupLead. A trial signup creates it immediately (and alerts
 * the platform admins); older orgs are back-filled the first time the list is opened.
 * Each lead carries a follow-up playbook laid out from the signup time and trial end, and a
 * single `nextFollowUpAt` that drives the alarm (scheduler push + in-app watchdog).
 */
const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Organization, User, Branch, Invoice, Product, SignupLead } = require('../models');
const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const billingSettingsService = require('./billing/billingSettings.service');
const { resolveState } = require('./billing/subscriptionState');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const PKT_OFFSET = 5 * HOUR; // Asia/Karachi has no DST
const OPEN_STAGES = ['new', 'contacted', 'demo', 'negotiation'];
const PAID_STATUSES = ['active', 'pastDue', 'gracePeriod'];

// ── Time helpers (business hours in Pakistan time) ───────────────────────────────────

/** `date` moved to hh:mm PKT on the same PKT calendar day. */
const atPktTime = (date, hh, mm = 0) => {
  const pkt = new Date(new Date(date).getTime() + PKT_OFFSET);
  pkt.setUTCHours(hh, mm, 0, 0);
  return new Date(pkt.getTime() - PKT_OFFSET);
};

const pktHour = (date) => new Date(new Date(date).getTime() + PKT_OFFSET).getUTCHours();

/** Nudge a time into calling hours (10:00–20:00 PKT): too early → 10:00 that day, too late → 10:00 next day. */
const intoWorkingHours = (date) => {
  const h = pktHour(date);
  if (h < 10) return atPktTime(date, 10);
  if (h >= 20) return atPktTime(new Date(new Date(date).getTime() + DAY), 10);
  return new Date(date);
};

// ── Playbook ─────────────────────────────────────────────────────────────────────────

/**
 * The trial follow-up cadence most B2B SaaS sales teams run: speed-to-lead call inside the
 * first hour, an activation nudge on day 1, a demo by day 3, a mid-trial review, a
 * "trial ending" offer two days before the end, and a closing call once it lapses.
 */
const buildPlaybook = (signupAt, trialEndAt) => {
  const start = new Date(signupAt);
  const end = trialEndAt ? new Date(trialEndAt) : new Date(start.getTime() + 14 * DAY);
  const dayAt = (n) => atPktTime(new Date(start.getTime() + n * DAY), 11);
  const steps = [
    {
      key: 'welcome',
      day: 0,
      title: 'Welcome call',
      goal: 'Thank them, confirm their business type and what they want to manage, and offer free setup help.',
      channel: 'call',
      dueAt: intoWorkingHours(new Date(start.getTime() + 30 * 60 * 1000)),
    },
    {
      key: 'activation',
      day: 1,
      title: 'Setup check',
      goal: 'Check they added products and made a first sale. Send the quick-start steps on WhatsApp.',
      channel: 'whatsapp',
      dueAt: dayAt(1),
    },
    {
      key: 'demo',
      day: 3,
      title: 'Book a live demo',
      goal: 'Offer a 15-minute screen-share of the features that matter for their business type.',
      channel: 'call',
      dueAt: dayAt(3),
    },
    {
      key: 'midtrial',
      day: 7,
      title: 'Mid-trial review',
      goal: 'Review what they used, clear objections, and introduce the plan that fits them.',
      channel: 'call',
      dueAt: dayAt(7),
    },
    {
      key: 'ending',
      day: Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY) - 2),
      title: 'Trial ending offer',
      goal: 'Two days left: share prices and payment options (bank / JazzCash / Easypaisa / card).',
      channel: 'whatsapp',
      dueAt: atPktTime(new Date(end.getTime() - 2 * DAY), 11),
    },
    {
      key: 'closing',
      day: Math.round((end.getTime() - start.getTime()) / DAY),
      title: 'Closing call',
      goal: 'Trial is over: ask for the decision, help with payment, or extend the trial if they need time.',
      channel: 'call',
      dueAt: intoWorkingHours(new Date(end.getTime() + 2 * HOUR)),
    },
  ];
  // Keep the order strictly increasing even for very short trials.
  return steps.sort((a, b) => a.dueAt - b.dueAt).map((s) => ({ ...s, doneAt: null, skippedAt: null }));
};

/** Earliest open touchpoint, unless the admin set a manual follow-up. */
const recomputeNextFollowUp = (lead) => {
  if (!OPEN_STAGES.includes(lead.stage)) {
    lead.nextFollowUpAt = null;
    lead.nextFollowUpNote = '';
    lead.manualFollowUp = false;
    return lead;
  }
  if (lead.manualFollowUp && lead.nextFollowUpAt) return lead;
  const open = (lead.playbook || []).filter((t) => !t.doneAt && !t.skippedAt).sort((a, b) => a.dueAt - b.dueAt)[0];
  lead.manualFollowUp = false;
  lead.nextFollowUpAt = open ? open.dueAt : null;
  lead.nextFollowUpNote = open ? open.title : '';
  return lead;
};

// ── Subscription view ────────────────────────────────────────────────────────────────

const subscriptionView = (org, settings, now) => {
  const state = resolveState(org.subscription || {}, now, settings);
  const isTrial = state.planKey === 'trial';
  const isPaid = !isTrial && PAID_STATUSES.includes(state.status);
  let bucket = state.status;
  if (isPaid) bucket = 'paid';
  else if (state.status === 'trialing') bucket = 'trial';
  else if (state.status === 'expired' || state.status === 'canceled') bucket = isTrial ? 'trial_expired' : 'lapsed';
  return {
    planKey: state.planKey,
    status: state.status,
    bucket,
    isTrial,
    isPaid,
    periodEnd: state.currentPeriodEnd || null,
    daysRemaining: state.daysRemaining,
  };
};

// ── Back-fill / sync ─────────────────────────────────────────────────────────────────

const initialStageFor = (sub) => (sub.isPaid ? 'won' : 'new');

/**
 * Make sure every organization has a lead, and keep stages honest: an org that started
 * paying is marked Won automatically (whatever path activated it — Polar, manual approval,
 * legacy request). Cheap: two lean queries, writes only when something changed.
 */
const syncLeads = async ({ now = new Date() } = {}) => {
  const settings = await billingSettingsService.getSettings();
  const [orgs, leads] = await Promise.all([
    Organization.find({}).select('_id owner createdAt subscription').lean(),
    SignupLead.find({}).select('_id organizationId stage').lean(),
  ]);
  const byOrg = new Map(leads.map((l) => [String(l.organizationId), l]));
  const inserts = [];
  const wins = [];
  orgs.forEach((org) => {
    const sub = subscriptionView(org, settings, now);
    const lead = byOrg.get(String(org._id));
    if (!lead) {
      const stage = initialStageFor(sub);
      inserts.push({
        organizationId: org._id,
        ownerUserId: org.owner || null,
        stage,
        source: 'backfill',
        temperature: sub.bucket === 'trial' ? 'warm' : 'cold',
        acknowledgedAt: now, // existing accounts are not "new signups"
        // Already paying before the pipeline existed: the real win date is unknown, so leave
        // it empty rather than count it as a win "today" in the 30-day conversion numbers.
        wonAt: null,
        // Running trials still get the remaining touchpoints; past ones are pre-skipped.
        playbook:
          sub.bucket === 'trial'
            ? buildPlaybook(org.createdAt, sub.periodEnd).map((t) => (t.dueAt < now ? { ...t, skippedAt: now } : t))
            : [],
        activities: [{ type: 'system', text: 'Lead created from existing account', at: now }],
      });
    } else if (sub.isPaid && OPEN_STAGES.includes(lead.stage)) {
      wins.push(lead._id);
    }
  });

  if (inserts.length) {
    inserts.forEach(recomputeNextFollowUp);
    try {
      await SignupLead.insertMany(inserts, { ordered: false });
    } catch (err) {
      // Duplicate key = a concurrent sync got there first; anything else is real.
      if (err.code !== 11000 && !(err.writeErrors || []).every((e) => e.code === 11000)) throw err;
    }
  }
  if (wins.length) {
    await SignupLead.updateMany(
      { _id: { $in: wins } },
      {
        $set: { stage: 'won', wonAt: now, nextFollowUpAt: null, nextFollowUpNote: '', manualFollowUp: false },
        $push: { activities: { type: 'stage', text: 'Marked Won automatically — subscription is now paid', at: now } },
      }
    );
  }
  return { created: inserts.length, won: wins.length };
};

/** Called from organization setup. Never throws — a lead hiccup must not block signup. */
const createForNewSignup = async (organization) => {
  try {
    const playbook = buildPlaybook(organization.createdAt || new Date(), organization.subscription?.currentPeriodEnd);
    const lead = recomputeNextFollowUp({
      organizationId: organization._id,
      ownerUserId: organization.owner,
      stage: 'new',
      temperature: 'hot',
      source: 'self_signup',
      playbook,
      activities: [
        { type: 'system', text: `Signed up for a free trial (${organization.businessType || 'business'})`, at: new Date() },
      ],
    });
    const doc = await SignupLead.findOneAndUpdate(
      { organizationId: organization._id },
      { $setOnInsert: lead },
      { upsert: true, new: true }
    );
    // Fire the alert right away instead of waiting for the next scheduler tick.
    // eslint-disable-next-line global-require
    const { alertNewSignup } = require('../jobs/signupLeadScheduler');
    alertNewSignup(doc._id).catch((err) => logger.warn(`Signup alert failed: ${err.message}`));
    return doc;
  } catch (err) {
    logger.warn(`Could not create signup lead for org ${organization._id}: ${err.message}`);
    return null;
  }
};

// ── Organization list (search / filter / sort / page) ────────────────────────────────

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * All organizations with owner, subscription bucket and lead, filtered/sorted in memory
 * (effective subscription status is time-derived, so it can't be a Mongo filter), then
 * only the requested page is enriched with usage counts.
 * Fine for thousands of orgs; revisit with a materialized status if it ever gets bigger.
 */
const listOrganizations = async (query = {}) => {
  await syncLeads();
  const now = new Date();
  const settings = await billingSettingsService.getSettings();
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.max(1, parseInt(query.limit, 10) || 25);

  const [orgs, leads] = await Promise.all([
    Organization.find({})
      .select('name businessType email phone city country countryCode owner subscription createdAt isActive')
      .populate('owner', 'name email lastSeenAt')
      .lean(),
    SignupLead.find({})
      .select('organizationId stage temperature nextFollowUpAt nextFollowUpNote lastContactedAt acknowledgedAt assignedTo')
      .lean(),
  ]);
  const leadByOrg = new Map(leads.map((l) => [String(l.organizationId), l]));

  let rows = orgs.map((org) => {
    const sub = subscriptionView(org, settings, now);
    const lead = leadByOrg.get(String(org._id)) || null;
    return { org, sub, lead };
  });

  const facets = {
    businessTypes: [...new Set(rows.map(({ org }) => org.businessType).filter(Boolean))].sort(),
    plans: [...new Set(rows.map(({ sub }) => sub.planKey).filter(Boolean))].sort(),
  };

  // Counts for the filter chips are taken before the bucket filter is applied.
  const searchText = String(query.search || '').trim();
  if (searchText) {
    const re = new RegExp(escapeRe(searchText), 'i');
    rows = rows.filter(
      ({ org }) =>
        re.test(org.name || '') ||
        re.test(org.email || '') ||
        re.test(org.phone || '') ||
        re.test(org.city || '') ||
        re.test(org.owner?.name || '') ||
        re.test(org.owner?.email || '')
    );
  }
  if (query.businessType) rows = rows.filter(({ org }) => org.businessType === query.businessType);
  if (query.plan) rows = rows.filter(({ sub }) => sub.planKey === query.plan);
  if (query.stage) rows = rows.filter(({ lead }) => lead?.stage === query.stage);

  const weekAgo = now.getTime() - 7 * DAY;
  const counts = {
    all: rows.length,
    new: rows.filter(({ org }) => new Date(org.createdAt).getTime() >= weekAgo).length,
    trial: rows.filter(({ sub }) => sub.bucket === 'trial').length,
    paid: rows.filter(({ sub }) => sub.bucket === 'paid').length,
    trial_expired: rows.filter(({ sub }) => sub.bucket === 'trial_expired').length,
    lapsed: rows.filter(({ sub }) => sub.bucket === 'lapsed').length,
    followup: rows.filter(({ lead }) => lead?.nextFollowUpAt && new Date(lead.nextFollowUpAt) <= now).length,
  };

  const bucket = query.bucket || 'all';
  if (bucket === 'new') rows = rows.filter(({ org }) => new Date(org.createdAt).getTime() >= weekAgo);
  else if (bucket === 'followup')
    rows = rows.filter(({ lead }) => lead?.nextFollowUpAt && new Date(lead.nextFollowUpAt) <= now);
  else if (bucket !== 'all') rows = rows.filter(({ sub }) => sub.bucket === bucket);

  const sortBy = query.sortBy || 'createdAt:desc';
  const [field, dir] = sortBy.split(':');
  const sign = dir === 'asc' ? 1 : -1;
  const keyOf = ({ org, sub, lead }) => {
    switch (field) {
      case 'name':
        return (org.name || '').toLowerCase();
      case 'trialEnd':
        return sub.periodEnd ? new Date(sub.periodEnd).getTime() : Number.MAX_SAFE_INTEGER;
      case 'followUp':
        return lead?.nextFollowUpAt ? new Date(lead.nextFollowUpAt).getTime() : Number.MAX_SAFE_INTEGER * sign;
      default:
        return new Date(org.createdAt).getTime();
    }
  };
  rows.sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    if (ka < kb) return -1 * sign;
    if (ka > kb) return 1 * sign;
    return 0;
  });

  const totalResults = rows.length;
  const pageRows = rows.slice((page - 1) * limit, page * limit);
  const ids = pageRows.map(({ org }) => org._id);

  const [userCounts, branchCounts, invoiceStats] = await Promise.all([
    User.aggregate([
      { $match: { organizationId: { $in: ids }, isActive: true, schoolRole: { $nin: ['student', 'parent'] } } },
      { $group: { _id: '$organizationId', n: { $sum: 1 }, lastSeenAt: { $max: '$lastSeenAt' } } },
    ]),
    Branch.aggregate([
      { $match: { organizationId: { $in: ids }, isActive: true } },
      { $group: { _id: '$organizationId', n: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: { organizationId: { $in: ids }, isDemo: { $ne: true } } },
      { $group: { _id: '$organizationId', n: { $sum: 1 }, last: { $max: '$createdAt' } } },
    ]),
  ]);
  const toMap = (arr) => new Map(arr.map((r) => [String(r._id), r]));
  const users = toMap(userCounts);
  const branches = toMap(branchCounts);
  const invoices = toMap(invoiceStats);

  const results = pageRows.map(({ org, sub, lead }) => {
    const id = String(org._id);
    const u = users.get(id);
    const inv = invoices.get(id);
    const lastActivity = [u?.lastSeenAt, inv?.last, org.owner?.lastSeenAt].filter(Boolean).map((d) => new Date(d).getTime());
    return {
      id,
      name: org.name,
      businessType: org.businessType,
      email: org.email || '',
      phone: org.phone || '',
      city: org.city || '',
      country: org.country || org.countryCode || '',
      isActive: org.isActive !== false,
      createdAt: org.createdAt,
      owner: org.owner ? { id: String(org.owner._id), name: org.owner.name, email: org.owner.email } : null,
      subscription: sub,
      usage: {
        users: u?.n || 0,
        branches: branches.get(id)?.n || 0,
        invoices: inv?.n || 0,
        lastActivityAt: lastActivity.length ? new Date(Math.max(...lastActivity)) : null,
      },
      lead: lead
        ? {
            id: String(lead._id),
            stage: lead.stage,
            temperature: lead.temperature,
            nextFollowUpAt: lead.nextFollowUpAt,
            nextFollowUpNote: lead.nextFollowUpNote,
            lastContactedAt: lead.lastContactedAt,
            isNew: !lead.acknowledgedAt,
          }
        : null,
    };
  });

  return { results, page, limit, totalPages: Math.max(1, Math.ceil(totalResults / limit)), totalResults, counts, facets };
};

// ── Pipeline ─────────────────────────────────────────────────────────────────────────

const shapeLead = (lead, org, settings, now) => ({
  id: String(lead._id),
  organizationId: String(lead.organizationId),
  stage: lead.stage,
  temperature: lead.temperature,
  source: lead.source,
  expectedPlan: lead.expectedPlan,
  expectedValue: lead.expectedValue,
  lostReason: lead.lostReason,
  tags: lead.tags || [],
  nextFollowUpAt: lead.nextFollowUpAt,
  nextFollowUpNote: lead.nextFollowUpNote,
  manualFollowUp: lead.manualFollowUp,
  lastContactedAt: lead.lastContactedAt,
  wonAt: lead.wonAt,
  lostAt: lead.lostAt,
  isNew: !lead.acknowledgedAt,
  createdAt: lead.createdAt,
  assignedTo:
    lead.assignedTo && lead.assignedTo.name ? { id: String(lead.assignedTo._id), name: lead.assignedTo.name } : null,
  organization: org
    ? {
        id: String(org._id),
        name: org.name,
        businessType: org.businessType,
        email: org.email || '',
        phone: org.phone || '',
        city: org.city || '',
        country: org.country || '',
        createdAt: org.createdAt,
        owner: org.owner ? { id: String(org.owner._id), name: org.owner.name, email: org.owner.email } : null,
        subscription: subscriptionView(org, settings, now),
      }
    : null,
});

/** Leads for the board / follow-up queue, plus the KPI numbers. */
const getPipeline = async (query = {}) => {
  await syncLeads();
  const now = new Date();
  const settings = await billingSettingsService.getSettings();
  const filter = {};
  if (query.stage) filter.stage = query.stage;
  const leads = await SignupLead.find(filter).select('-activities -playbook').populate('assignedTo', 'name').lean();
  const orgs = await Organization.find({ _id: { $in: leads.map((l) => l.organizationId) } })
    .select('name businessType email phone city country owner subscription createdAt')
    .populate('owner', 'name email')
    .lean();
  const orgById = new Map(orgs.map((o) => [String(o._id), o]));

  let rows = leads
    .map((l) => shapeLead(l, orgById.get(String(l.organizationId)), settings, now))
    .filter((r) => r.organization);
  const searchText = String(query.search || '').trim();
  if (searchText) {
    const re = new RegExp(escapeRe(searchText), 'i');
    rows = rows.filter(
      (r) =>
        re.test(r.organization.name) ||
        re.test(r.organization.phone) ||
        re.test(r.organization.email) ||
        re.test(r.organization.owner?.name || '') ||
        re.test(r.organization.owner?.email || '')
    );
  }

  const startToday = atPktTime(now, 0);
  const endToday = new Date(startToday.getTime() + DAY);
  const thirtyAgo = new Date(now.getTime() - 30 * DAY);
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const all = rows;
  const decided30 = all.filter(
    (r) => (r.wonAt && new Date(r.wonAt) >= thirtyAgo) || (r.lostAt && new Date(r.lostAt) >= thirtyAgo)
  );
  const won30 = decided30.filter((r) => r.stage === 'won').length;
  const stats = {
    newUnseen: all.filter((r) => r.isNew).length,
    newThisWeek: all.filter((r) => r.source === 'self_signup' && new Date(r.createdAt) >= weekAgo).length,
    overdue: all.filter((r) => r.nextFollowUpAt && new Date(r.nextFollowUpAt) < startToday).length,
    dueToday: all.filter(
      (r) => r.nextFollowUpAt && new Date(r.nextFollowUpAt) >= startToday && new Date(r.nextFollowUpAt) < endToday
    ).length,
    dueNow: all.filter((r) => r.nextFollowUpAt && new Date(r.nextFollowUpAt) <= now).length,
    activeTrials: all.filter((r) => r.organization.subscription.bucket === 'trial').length,
    open: all.filter((r) => OPEN_STAGES.includes(r.stage)).length,
    won30,
    lost30: decided30.length - won30,
    conversionRate30: decided30.length ? Math.round((won30 / decided30.length) * 100) : null,
    pipelineValue: all.filter((r) => OPEN_STAGES.includes(r.stage)).reduce((s, r) => s + (r.expectedValue || 0), 0),
    byStage: Object.fromEntries(SignupLead.STAGES.map((s) => [s, all.filter((r) => r.stage === s).length])),
  };

  return { results: rows, stats, serverNow: now };
};

const loadLead = async (orgId) => {
  if (!mongoose.isValidObjectId(orgId)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid organization id');
  let lead = await SignupLead.findOne({ organizationId: orgId });
  if (!lead) {
    await syncLeads();
    lead = await SignupLead.findOne({ organizationId: orgId });
  }
  if (!lead) throw new ApiError(httpStatus.NOT_FOUND, 'Lead not found');
  return lead;
};

const getLeadDetail = async (orgId) => {
  const lead = await loadLead(orgId);
  await lead.populate('assignedTo', 'name');
  const now = new Date();
  const settings = await billingSettingsService.getSettings();
  const org = await Organization.findById(lead.organizationId)
    .select('name businessType email phone city country owner subscription createdAt')
    .populate('owner', 'name email lastSeenAt')
    .lean();
  const [users, branches, invoiceCount, lastInvoice, productCount] = await Promise.all([
    User.countDocuments({
      organizationId: lead.organizationId,
      isActive: true,
      schoolRole: { $nin: ['student', 'parent'] },
    }),
    Branch.countDocuments({ organizationId: lead.organizationId, isActive: true }),
    Invoice.countDocuments({ organizationId: lead.organizationId, isDemo: { $ne: true } }),
    Invoice.findOne({ organizationId: lead.organizationId, isDemo: { $ne: true } })
      .sort({ createdAt: -1 })
      .select('createdAt')
      .lean(),
    Product.countDocuments({ organizationId: lead.organizationId, isDemo: { $ne: true } }),
  ]);
  const plain = lead.toObject();
  return {
    ...shapeLead(plain, org, settings, now),
    playbook: plain.playbook || [],
    activities: (plain.activities || [])
      .map((a) => ({ ...a, id: String(a._id), _id: undefined }))
      .sort((a, b) => new Date(b.at) - new Date(a.at)),
    usage: {
      users,
      branches,
      invoices: invoiceCount,
      products: productCount,
      lastInvoiceAt: lastInvoice?.createdAt || null,
      ownerLastSeenAt: org?.owner?.lastSeenAt || null,
    },
  };
};

const STAGE_LABEL = {
  new: 'New',
  contacted: 'Contacted',
  demo: 'Demo / Onboarding',
  negotiation: 'Negotiation',
  won: 'Won',
  lost: 'Lost',
};

const actorFields = (user) => ({ by: user?._id || user?.id || null, byName: user?.name || '' });

const updateLead = async (orgId, body, user) => {
  const lead = await loadLead(orgId);
  const now = new Date();
  // Viewing the lead counts as seeing the signup alert.
  if (!lead.acknowledgedAt) lead.acknowledgedAt = now;

  if (body.stage && body.stage !== lead.stage) {
    if (!SignupLead.STAGES.includes(body.stage)) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid stage');
    const from = lead.stage;
    lead.stage = body.stage;
    if (body.stage === 'won') lead.wonAt = now;
    if (body.stage === 'lost') {
      lead.lostAt = now;
      lead.lostReason = body.lostReason || lead.lostReason || '';
    }
    if (OPEN_STAGES.includes(body.stage)) {
      lead.wonAt = null;
      lead.lostAt = null;
    }
    lead.activities.push({
      type: 'stage',
      text: `Stage: ${STAGE_LABEL[from]} → ${STAGE_LABEL[body.stage]}${
        body.stage === 'lost' && lead.lostReason ? ` (${lead.lostReason})` : ''
      }`,
      at: now,
      ...actorFields(user),
    });
  }
  ['temperature', 'expectedPlan', 'expectedValue', 'tags'].forEach((k) => {
    if (body[k] !== undefined) lead[k] = body[k];
  });
  if (body.lostReason !== undefined && lead.stage === 'lost') lead.lostReason = body.lostReason;
  if (body.assignedTo !== undefined) lead.assignedTo = body.assignedTo || null;

  if (body.nextFollowUpAt !== undefined) {
    if (body.nextFollowUpAt) {
      lead.nextFollowUpAt = new Date(body.nextFollowUpAt);
      lead.nextFollowUpNote = body.nextFollowUpNote || '';
      lead.manualFollowUp = true;
    } else {
      // Cleared → fall back to the playbook.
      lead.manualFollowUp = false;
    }
  }
  recomputeNextFollowUp(lead);
  await lead.save();
  return getLeadDetail(orgId);
};

/**
 * Log a call / WhatsApp / email / meeting / note. Contact types stamp lastContactedAt and
 * move a brand-new lead to Contacted; `completeTouchpoint` ticks that playbook step;
 * `nextFollowUpAt` schedules the next alarm in the same request.
 */
const addActivity = async (orgId, body, user) => {
  const lead = await loadLead(orgId);
  const now = new Date();
  if (!lead.acknowledgedAt) lead.acknowledgedAt = now;
  const type = body.type;
  if (!SignupLead.ACTIVITY_TYPES.includes(type) || type === 'system' || type === 'stage') {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid activity type');
  }
  lead.activities.push({
    type,
    outcome: body.outcome || null,
    text: body.text || '',
    at: now,
    ...actorFields(user),
  });
  const isContact = ['call', 'whatsapp', 'email', 'meeting'].includes(type);
  const reached = isContact && body.outcome !== 'no_answer';
  if (isContact) lead.lastContactedAt = now;
  if (reached && lead.stage === 'new') {
    lead.stage = 'contacted';
    lead.activities.push({ type: 'stage', text: 'Stage: New → Contacted', at: now, ...actorFields(user) });
  }
  if (body.outcome === 'interested' && lead.temperature !== 'hot') lead.temperature = 'hot';
  if (body.outcome === 'not_interested') lead.temperature = 'cold';

  if (body.completeTouchpoint) {
    const t = lead.playbook.find((p) => p.key === body.completeTouchpoint);
    if (t && !t.doneAt) t.doneAt = now;
  }
  if (body.nextFollowUpAt) {
    lead.nextFollowUpAt = new Date(body.nextFollowUpAt);
    lead.nextFollowUpNote = body.nextFollowUpNote || '';
    lead.manualFollowUp = true;
  } else if (lead.manualFollowUp && lead.nextFollowUpAt && lead.nextFollowUpAt <= now) {
    // The manual follow-up that was due has now been handled.
    lead.manualFollowUp = false;
  }
  recomputeNextFollowUp(lead);
  await lead.save();
  return getLeadDetail(orgId);
};

const setTouchpoint = async (orgId, key, action, user) => {
  const lead = await loadLead(orgId);
  const t = lead.playbook.find((p) => p.key === key);
  if (!t) throw new ApiError(httpStatus.NOT_FOUND, 'Follow-up step not found');
  const now = new Date();
  if (action === 'done') {
    t.doneAt = now;
    t.skippedAt = null;
  } else if (action === 'skip') {
    t.skippedAt = now;
    t.doneAt = null;
  } else {
    t.doneAt = null;
    t.skippedAt = null;
  }
  lead.activities.push({
    type: 'system',
    text: `${t.title}: ${action === 'done' ? 'done' : action === 'skip' ? 'skipped' : 'reopened'}`,
    at: now,
    ...actorFields(user),
  });
  // A manual follow-up that is already past is replaced by the playbook again.
  if (lead.manualFollowUp && lead.nextFollowUpAt && lead.nextFollowUpAt <= now) lead.manualFollowUp = false;
  recomputeNextFollowUp(lead);
  await lead.save();
  return getLeadDetail(orgId);
};

/** Snooze the current follow-up by N minutes. */
const snoozeFollowUp = async (orgId, minutes, user) => {
  const lead = await loadLead(orgId);
  const mins = Math.min(Math.max(parseInt(minutes, 10) || 60, 5), 60 * 24 * 14);
  const note = lead.nextFollowUpNote;
  lead.nextFollowUpAt = new Date(Date.now() + mins * 60 * 1000);
  lead.nextFollowUpNote = note;
  lead.manualFollowUp = true;
  if (!lead.acknowledgedAt) lead.acknowledgedAt = new Date();
  lead.activities.push({
    type: 'system',
    text: `Follow-up snoozed ${mins >= 60 ? `${Math.round(mins / 60)}h` : `${mins}m`}`,
    at: new Date(),
    ...actorFields(user),
  });
  await lead.save();
  return getLeadDetail(orgId);
};

const acknowledge = async (orgIds) => {
  const filter = { acknowledgedAt: null };
  if (Array.isArray(orgIds) && orgIds.length)
    filter.organizationId = { $in: orgIds.filter((id) => mongoose.isValidObjectId(id)) };
  const res = await SignupLead.updateMany(filter, { $set: { acknowledgedAt: new Date() } });
  return { acknowledged: res.modifiedCount || 0 };
};

/**
 * The tiny payload the admin watchdog polls: unseen signups + follow-ups due now.
 * No sync here (it runs every minute) — new signups create their lead inline.
 */
const getAlerts = async () => {
  const now = new Date();
  const [fresh, due] = await Promise.all([
    SignupLead.find({ acknowledgedAt: null }).select('organizationId createdAt').sort({ createdAt: -1 }).limit(20).lean(),
    SignupLead.find({ stage: { $in: OPEN_STAGES }, nextFollowUpAt: { $ne: null, $lte: now } })
      .select('organizationId nextFollowUpAt nextFollowUpNote')
      .sort({ nextFollowUpAt: 1 })
      .limit(50)
      .lean(),
  ]);
  const ids = [...new Set([...fresh, ...due].map((l) => String(l.organizationId)))];
  const orgs = await Organization.find({ _id: { $in: ids } })
    .select('name businessType phone')
    .populate('owner', 'name')
    .lean();
  const orgById = new Map(orgs.map((o) => [String(o._id), o]));
  const pick = (l) => {
    const o = orgById.get(String(l.organizationId));
    return o ? { name: o.name, businessType: o.businessType, phone: o.phone || '', ownerName: o.owner?.name || '' } : null;
  };
  return {
    serverNow: now,
    newSignups: fresh
      .map((l) => ({ organizationId: String(l.organizationId), createdAt: l.createdAt, ...pick(l) }))
      .filter((r) => r.name),
    dueFollowUps: due
      .map((l) => ({
        organizationId: String(l.organizationId),
        dueAt: l.nextFollowUpAt,
        note: l.nextFollowUpNote,
        ...pick(l),
      }))
      .filter((r) => r.name),
  };
};

module.exports = {
  OPEN_STAGES,
  buildPlaybook,
  recomputeNextFollowUp,
  subscriptionView,
  syncLeads,
  createForNewSignup,
  listOrganizations,
  getPipeline,
  getLeadDetail,
  updateLead,
  addActivity,
  setTouchpoint,
  snoozeFollowUp,
  acknowledge,
  getAlerts,
  // exported for tests
  _internals: { atPktTime, intoWorkingHours },
};
