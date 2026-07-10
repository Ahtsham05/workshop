const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const whatsappTemplateSchema = mongoose.Schema(
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
    metaTemplateId: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    language: { type: String, default: 'en', trim: true },
    category: {
      type: String,
      enum: ['MARKETING', 'UTILITY', 'AUTHENTICATION'],
      required: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED'],
      default: 'PENDING',
      index: true,
    },
    components: { type: mongoose.Schema.Types.Mixed },
    rejectionReason: { type: String, trim: true },
    internalCategory: {
      type: String,
      enum: [
        'invoice',
        'fee',
        'attendance',
        'result',
        'holiday',
        'promo',
        'homework',
        'payment_reminder',
        'order_update',
        'general',
      ],
      default: 'general',
    },
    variableCount: { type: Number, default: 0 },
    lastSyncedAt: { type: Date },
  },
  { timestamps: true },
);

whatsappTemplateSchema.plugin(toJSON);
whatsappTemplateSchema.plugin(paginate);
whatsappTemplateSchema.index({ organizationId: 1, branchId: 1, name: 1, language: 1 }, { unique: true });

module.exports = mongoose.model('WhatsAppTemplate', whatsappTemplateSchema);
