const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const followUpSchema = mongoose.Schema(
  {
    note: { type: String, trim: true },
    doneBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    doneAt: { type: Date, default: Date.now },
    nextFollowUpDate: { type: Date },
    statusAfter: {
      type: String,
      enum: ['new', 'contacted', 'interested', 'converted', 'lost'],
    },
  },
  { _id: true }
);

const visitorSchema = mongoose.Schema(
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // ── Student / Child info ──────────────────────────────────────
    studentName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ['male', 'female', 'other'], default: 'male' },
    dateOfBirth: { type: Date },
    desiredClass: { type: String, trim: true }, // e.g. "Class 5"
    previousSchool: { type: String, trim: true },

    // ── Parent / Guardian info ────────────────────────────────────
    parentName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    alternatePhone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: { type: String, trim: true },

    // ── Inquiry details ───────────────────────────────────────────
    inquiryDate: { type: Date, default: Date.now },
    source: {
      type: String,
      enum: ['walk_in', 'phone', 'referral', 'website', 'social_media', 'newspaper', 'other'],
      default: 'walk_in',
    },
    referredBy: { type: String, trim: true },
    notes: { type: String, trim: true },

    // ── Lead tracking ─────────────────────────────────────────────
    status: {
      type: String,
      enum: ['new', 'contacted', 'interested', 'converted', 'lost'],
      default: 'new',
      index: true,
    },
    nextFollowUpDate: { type: Date },
    followUps: [followUpSchema],

    // ── Conversion ────────────────────────────────────────────────
    convertedStudentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      default: null,
    },
    convertedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

visitorSchema.plugin(toJSON);
visitorSchema.plugin(paginate);

// Compound indexes for fast filtered queries
visitorSchema.index({ organizationId: 1, branchId: 1, status: 1 });
visitorSchema.index({ organizationId: 1, branchId: 1, phone: 1 });
visitorSchema.index({ organizationId: 1, branchId: 1, inquiryDate: -1 });

const Visitor = mongoose.model('Visitor', visitorSchema);
module.exports = Visitor;
