const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const whatsappCampaignSchema = mongoose.Schema(
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
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String, required: true, trim: true },
    templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'WhatsAppTemplate', required: true },
    templateParams: { type: mongoose.Schema.Types.Mixed },
    audience: {
      type: {
        type: String,
        enum: ['all_customers', 'all_parents', 'class', 'section', 'students', 'customers', 'custom_list'],
        required: true,
      },
      classId: { type: mongoose.Schema.Types.ObjectId, ref: 'SchoolClass' },
      sectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Section' },
      studentIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
      customerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Customer' }],
      phones: [{ type: String }],
    },
    scheduledAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'running', 'completed', 'cancelled', 'failed'],
      default: 'draft',
      index: true,
    },
    stats: {
      total: { type: Number, default: 0 },
      // queued/rejected reflect our own send API call (accepted vs. rejected outright);
      // sent/delivered/read/failed are updated exclusively from Meta's status webhooks
      // to avoid double-counting the same message.
      queued: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      read: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

whatsappCampaignSchema.plugin(toJSON);
whatsappCampaignSchema.plugin(paginate);
whatsappCampaignSchema.index({ organizationId: 1, branchId: 1, status: 1 });

module.exports = mongoose.model('WhatsAppCampaign', whatsappCampaignSchema);
