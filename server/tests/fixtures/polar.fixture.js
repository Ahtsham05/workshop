/**
 * Realistic Polar webhook payloads (snake_case wire format) that pass the SDK's strict
 * parsers, plus a signer that produces valid Standard Webhooks headers — so tests exercise
 * the real validateEvent() path end to end.
 */
const crypto = require('crypto');
const { Webhook } = require('standardwebhooks');

const iso = (d) => new Date(d).toISOString();

const buildProduct = (productId, { name = 'Logix Plus Growth', amount = 1000 } = {}) => ({
  id: productId,
  created_at: iso('2026-01-01'),
  modified_at: null,
  trial_interval: null,
  trial_interval_count: null,
  name,
  description: null,
  visibility: 'public',
  recurring_interval: 'month',
  recurring_interval_count: 1,
  meter_interval: 'month',
  meter_interval_count: 1,
  is_recurring: true,
  is_archived: false,
  organization_id: crypto.randomUUID(),
  metadata: {},
  prices: [
    {
      id: crypto.randomUUID(),
      created_at: iso('2026-01-01'),
      modified_at: null,
      source: 'catalog',
      amount_type: 'fixed',
      price_currency: 'usd',
      tax_behavior: null,
      is_archived: false,
      product_id: productId,
      type: 'recurring',
      recurring_interval: 'month',
      price_amount: amount,
    },
  ],
  benefits: [],
  medias: [],
  attached_custom_fields: [],
});

const buildCustomer = (organizationId) => ({
  id: 'cus_test_1',
  created_at: iso('2026-01-01'),
  modified_at: null,
  metadata: {},
  external_id: organizationId,
  email: 'owner@example.com',
  email_verified: true,
  type: 'individual',
  name: 'Acme',
  billing_name: null,
  billing_address: null,
  tax_id: null,
  organization_id: crypto.randomUUID(),
  deleted_at: null,
  avatar_url: 'https://example.com/a.png',
});

/**
 * @param {Object} o
 * @param {string} o.organizationId our org id (sent as metadata + customer external id)
 * @param {string} o.productId
 * @param {string} [o.status] Polar status
 * @param {Date} o.periodStart
 * @param {Date} o.periodEnd
 * @param {Date} [o.modifiedAt] event ordering version
 */
const buildSubscription = ({
  id = 'sub_test_1',
  organizationId,
  productId,
  status = 'active',
  periodStart,
  periodEnd,
  modifiedAt = new Date(),
  cancelAtPeriodEnd = false,
  endedAt = null,
  pendingUpdate = null,
}) => ({
  created_at: iso(periodStart),
  modified_at: iso(modifiedAt),
  id,
  amount: 1000,
  currency: 'usd',
  recurring_interval: 'month',
  recurring_interval_count: 1,
  status,
  current_period_start: iso(periodStart),
  current_period_end: iso(periodEnd),
  current_meter_period_start: null,
  current_meter_period_end: null,
  trial_start: null,
  trial_end: null,
  cancel_at_period_end: cancelAtPeriodEnd,
  canceled_at: null,
  started_at: iso(periodStart),
  ends_at: cancelAtPeriodEnd ? iso(periodEnd) : null,
  ended_at: endedAt ? iso(endedAt) : null,
  pause_at_period_end: false,
  paused_at: null,
  resumes_at: null,
  customer_id: 'cus_test_1',
  product_id: productId,
  discount_id: null,
  checkout_id: null,
  customer_cancellation_reason: null,
  customer_cancellation_comment: null,
  metadata: { organizationId },
  custom_field_data: {},
  customer: buildCustomer(organizationId),
  product: buildProduct(productId),
  discount: null,
  prices: buildProduct(productId).prices,
  meters: [],
  pending_update: pendingUpdate,
});

const event = (type, data) => ({ type, timestamp: new Date().toISOString(), data });

/** Sign exactly like Polar: Standard Webhooks with the secret's UTF-8 bytes base64-encoded. */
const signedRequest = (secret, payload, { id = `msg_${crypto.randomUUID()}`, at = new Date() } = {}) => {
  const body = JSON.stringify(payload);
  const wh = new Webhook(Buffer.from(secret, 'utf-8').toString('base64'));
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'webhook-id': id,
      'webhook-timestamp': String(Math.floor(at.getTime() / 1000)),
      'webhook-signature': wh.sign(id, at, body),
    },
  };
};

module.exports = { buildSubscription, buildProduct, event, signedRequest };
