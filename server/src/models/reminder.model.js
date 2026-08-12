const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const reminderSchema = new mongoose.Schema(
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
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    relatedType: {
      type: String,
      enum: ['Customer', 'Supplier', 'Lead'],
    },
    relatedId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'relatedType',
      index: true,
    },
    dueAt: {
      type: Date,
      required: true,
      index: true,
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      default: 'medium',
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'snoozed', 'cancelled'],
      default: 'pending',
      index: true,
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
    notifyChannels: {
      type: [String],
      enum: ['push', 'whatsapp'],
      default: ['push'],
    },
    // Explicit WhatsApp target override; else resolved from the related record at fire time.
    whatsappPhone: {
      type: String,
      trim: true,
    },
    repeat: {
      type: String,
      enum: ['none', 'daily', 'weekly', 'monthly'],
      default: 'none',
    },
    // Last time the alarm actually fired — guards against double-sends.
    remindedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
    },
    snoozedUntil: {
      type: Date,
    },
    sourceCommunicationLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CommunicationLog',
    },
  },
  { timestamps: true, keepTimestampsInJSON: true },
);

reminderSchema.plugin(toJSON);
reminderSchema.plugin(paginate);

reminderSchema.index({ organizationId: 1, branchId: 1, status: 1, dueAt: 1 });
reminderSchema.index({ assignedTo: 1, status: 1, dueAt: 1 });

const Reminder = mongoose.model('Reminder', reminderSchema);

module.exports = Reminder;
