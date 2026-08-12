const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const STAGES = ['new', 'contacted', 'qualified', 'proposal_sent', 'won', 'lost'];
const SOURCES = ['whatsapp', 'referral', 'walk_in', 'facebook', 'manual', 'other'];

const stageHistoryEntrySchema = new mongoose.Schema(
  {
    stage: { type: String, enum: STAGES, required: true },
    enteredAt: { type: Date, required: true, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, trim: true },
  },
  { _id: false },
);

const leadSchema = new mongoose.Schema(
  {
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
    whatsapp: { type: String, trim: true },
    address: { type: String, trim: true },
    source: {
      type: String,
      enum: SOURCES,
      default: 'manual',
    },
    stage: {
      type: String,
      enum: STAGES,
      default: 'new',
      index: true,
    },
    // Timestamp the lead entered its *current* stage — drives the Kanban card's
    // "time in stage" display. Reset every time `stage` changes.
    stageEnteredAt: {
      type: Date,
      default: Date.now,
    },
    stageHistory: {
      type: [stageHistoryEntrySchema],
      default: () => [],
    },
    estimatedValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    lostReason: {
      type: String,
      trim: true,
    },
    wonAt: {
      type: Date,
    },
    lostAt: {
      type: Date,
    },
    // Set once this lead is converted — the Lead row itself is then kept forever
    // as a read-only historical record (its CommunicationLog/Reminder/Invoice
    // history stays queryable via relatedType:'Lead'), never merged or deleted.
    convertedCustomerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      index: true,
      sparse: true,
    },
    convertedAt: {
      type: Date,
    },
  },
  { timestamps: true, keepTimestampsInJSON: true },
);

leadSchema.plugin(toJSON);
leadSchema.plugin(paginate);

leadSchema.index({ organizationId: 1, branchId: 1, stage: 1 });
leadSchema.index({ organizationId: 1, branchId: 1, assignedTo: 1, stage: 1 });
leadSchema.index({ organizationId: 1, branchId: 1, phone: 1 });
leadSchema.index({ organizationId: 1, branchId: 1, whatsapp: 1 });
leadSchema.index({ organizationId: 1, branchId: 1, email: 1 });

const Lead = mongoose.model('Lead', leadSchema);

Lead.STAGES = STAGES;
Lead.SOURCES = SOURCES;

module.exports = Lead;
