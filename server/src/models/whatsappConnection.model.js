const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

const whatsappConnectionSchema = mongoose.Schema(
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
    businessAccountId: { type: String, trim: true },
    wabaId: { type: String, trim: true },
    phoneNumberId: { type: String, trim: true },
    displayPhoneNumber: { type: String, trim: true },
    verifiedName: { type: String, trim: true },
    accessTokenEnc: { type: String, private: true },
    tokenExpiresAt: { type: Date },
    embeddedSignupSessionId: { type: String, trim: true },
    connectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    connectedAt: { type: Date },
    status: {
      type: String,
      enum: ['pending', 'connected', 'disconnected', 'token_expired', 'webhook_pending', 'error'],
      default: 'pending',
      index: true,
    },
    webhookSubscribed: { type: Boolean, default: false },
    webhookVerifiedAt: { type: Date },
    phoneRegistered: { type: Boolean, default: false },
    registrationPinEnc: { type: String, private: true },
    lastError: { type: String, trim: true },
    messagingLimit: { type: String, trim: true },
    qualityRating: {
      type: String,
      enum: ['GREEN', 'YELLOW', 'RED', 'UNKNOWN'],
      default: 'UNKNOWN',
    },
    apiVersion: { type: String, default: 'v21.0' },
  },
  { timestamps: true },
);

whatsappConnectionSchema.plugin(toJSON);
whatsappConnectionSchema.index({ organizationId: 1, branchId: 1 }, { unique: true });
whatsappConnectionSchema.index({ wabaId: 1 });
whatsappConnectionSchema.index({ phoneNumberId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('WhatsAppConnection', whatsappConnectionSchema);
