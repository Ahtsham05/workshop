const mongoose = require('mongoose');

const whatsappWebhookLogSchema = mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
    phoneNumberId: { type: String, index: true },
    eventType: { type: String, index: true },
    payload: { type: mongoose.Schema.Types.Mixed },
    processed: { type: Boolean, default: false },
    processingError: { type: String },
    receivedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false },
);

whatsappWebhookLogSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('WhatsAppWebhookLog', whatsappWebhookLogSchema);
