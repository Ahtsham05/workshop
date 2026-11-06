const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

/**
 * Platform-level sales lead: one per signed-up Organization, owned by the SaaS operator
 * (system_admin), NOT by the tenant. Deliberately separate from the tenant CRM `Lead`
 * model, which is branch-scoped and belongs to each customer's own sales team.
 *
 * A self-service trial signup creates one automatically (stage 'new', unacknowledged, with
 * the follow-up playbook laid out from the signup time); orgs that existed before this
 * feature are back-filled lazily the first time the admin opens the list.
 */
const STAGES = ['new', 'contacted', 'demo', 'negotiation', 'won', 'lost'];
const ACTIVITY_TYPES = ['call', 'whatsapp', 'email', 'meeting', 'note', 'stage', 'system'];
const OUTCOMES = ['reached', 'no_answer', 'interested', 'not_interested', 'call_back', 'needs_help', null];

const activitySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    outcome: { type: String, enum: OUTCOMES, default: null },
    text: { type: String, trim: true, maxlength: 2000, default: '' },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    byName: { type: String, default: '' },
  },
  { _id: true }
);

const touchpointSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    day: { type: Number, required: true },
    title: { type: String, required: true },
    goal: { type: String, default: '' },
    channel: { type: String, enum: ['call', 'whatsapp', 'email'], default: 'call' },
    dueAt: { type: Date, required: true },
    doneAt: { type: Date, default: null },
    skippedAt: { type: Date, default: null },
  },
  { _id: false }
);

const signupLeadSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      unique: true,
    },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    stage: { type: String, enum: STAGES, default: 'new', index: true },
    temperature: { type: String, enum: ['hot', 'warm', 'cold'], default: 'warm' },
    source: { type: String, enum: ['self_signup', 'backfill', 'manual'], default: 'self_signup' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // What plan we expect them to buy, and roughly for how much a month (sales forecast).
    expectedPlan: { type: String, trim: true, default: '' },
    expectedValue: { type: Number, min: 0, default: 0 },
    lostReason: { type: String, trim: true, maxlength: 500, default: '' },
    tags: { type: [String], default: [] },

    // The one date that drives the alarm. Manual follow-ups win; otherwise it tracks the
    // next open playbook touchpoint (see signupLead.service#recomputeNextFollowUp).
    nextFollowUpAt: { type: Date, default: null, index: true },
    nextFollowUpNote: { type: String, trim: true, maxlength: 500, default: '' },
    manualFollowUp: { type: Boolean, default: false },
    // The nextFollowUpAt value an alarm was already sent for — a new date re-arms it.
    followUpAlertedFor: { type: Date, default: null },

    lastContactedAt: { type: Date, default: null },
    wonAt: { type: Date, default: null },
    lostAt: { type: Date, default: null },
    // Null until an admin has seen the "new signup" alert.
    acknowledgedAt: { type: Date, default: null, index: true },
    signupAlertSentAt: { type: Date, default: null },

    playbook: { type: [touchpointSchema], default: [] },
    activities: { type: [activitySchema], default: [] },
  },
  { timestamps: true }
);

signupLeadSchema.index({ stage: 1, nextFollowUpAt: 1 });

signupLeadSchema.plugin(toJSON);

const SignupLead = mongoose.model('SignupLead', signupLeadSchema);
SignupLead.STAGES = STAGES;
SignupLead.ACTIVITY_TYPES = ACTIVITY_TYPES;
SignupLead.OUTCOMES = OUTCOMES.filter(Boolean);

module.exports = SignupLead;
