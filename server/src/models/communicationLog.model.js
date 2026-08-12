const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const communicationLogSchema = new mongoose.Schema(
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
    relatedType: {
      type: String,
      enum: ['Customer', 'Supplier', 'Lead'],
      required: true,
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      refPath: 'relatedType',
    },
    type: {
      type: String,
      enum: ['call', 'whatsapp', 'sms', 'email', 'meeting', 'note', 'visit', 'other'],
      required: true,
    },
    direction: {
      type: String,
      enum: ['outgoing', 'incoming'],
      default: 'outgoing',
    },
    subject: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    notes: {
      type: String,
      required: true,
      trim: true,
    },
    outcome: {
      type: String,
      enum: ['positive', 'neutral', 'negative', 'no_answer', 'follow_up_needed'],
    },
    // Set when this entry spun off a follow-up Reminder at creation time.
    reminderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reminder',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true, keepTimestampsInJSON: true },
);

communicationLogSchema.plugin(toJSON);
communicationLogSchema.plugin(paginate);

communicationLogSchema.index({ organizationId: 1, branchId: 1, relatedType: 1, relatedId: 1, createdAt: -1 });

const CommunicationLog = mongoose.model('CommunicationLog', communicationLogSchema);

module.exports = CommunicationLog;
