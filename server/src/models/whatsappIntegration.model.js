const mongoose = require('mongoose');
const { toJSON } = require('./plugins');

/**
 * Singleton-style WhatsApp integration settings (one row per deployment).
 * Cloud API credentials from Meta Business / WhatsApp Manager.
 */
const whatsappIntegrationSchema = mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ['auto', 'cloud', 'web'],
      default: 'auto',
    },
    cloudAccessToken: {
      type: String,
      trim: true,
      private: true,
    },
    cloudPhoneNumberId: {
      type: String,
      trim: true,
    },
    cloudApiVersion: {
      type: String,
      trim: true,
      default: 'v21.0',
    },
    cloudBusinessAccountId: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

whatsappIntegrationSchema.plugin(toJSON);

const WhatsAppIntegration = mongoose.model('WhatsAppIntegration', whatsappIntegrationSchema);

module.exports = WhatsAppIntegration;
