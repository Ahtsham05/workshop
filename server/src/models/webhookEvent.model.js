const mongoose = require('mongoose');

/**
 * Every verified billing webhook we have accepted, keyed by the provider's delivery id
 * (Standard Webhooks `webhook-id` header). The unique index is the idempotency guard: a
 * redelivered event fails the insert and is acknowledged without being processed again.
 *
 * The payload is kept so a row that failed processing (status 'failed', or stuck in
 * 'received' after a crash) can be retried by the billing scheduler. It holds subscription
 * and order metadata only — Polar never sends card data.
 */
const webhookEventSchema = mongoose.Schema(
  {
    provider: { type: String, enum: ['polar'], required: true },
    eventId: { type: String, required: true },
    type: { type: String, required: true },
    payload: { type: mongoose.Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['received', 'processed', 'ignored', 'failed'], default: 'received', index: true },
    attempts: { type: Number, default: 0 },
    lastError: { type: String, default: null },
    organizationId: { type: mongoose.SchemaTypes.ObjectId, ref: 'Organization', default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
// Keep 180 days of history; idempotency only matters within the provider's retry window.
webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });

const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema);

module.exports = WebhookEvent;
