/**
 * Polar webhook intake: verify → record (idempotency) → process → acknowledge.
 *
 *  1. The signature is verified against the RAW request body before anything else; a bad
 *     or missing signature is rejected with 403 and nothing is stored.
 *  2. The event is inserted into WebhookEvent keyed by its `webhook-id`. A redelivery hits the
 *     unique index and is acknowledged without being processed again.
 *  3. Processing runs inline (it is a few DB writes). If it throws, the row is marked 'failed'
 *     and we STILL acknowledge — the event is safely stored and the billing scheduler retries
 *     it, which is more reliable than depending on Polar's retry schedule.
 */
const httpStatus = require('http-status');
// eslint-disable-next-line import/no-unresolved -- resolved via the package's "exports" map
const { validateEvent, WebhookVerificationError } = require('@polar-sh/sdk/webhooks');
const { WebhookEvent } = require('../../models');
const ApiError = require('../../utils/ApiError');
const config = require('../../config/config');
const logger = require('../../config/logger');
const polarService = require('./polar.service');

const MAX_ATTEMPTS = 8;
const RETRY_AFTER_MS = 60 * 1000;

const safeError = (err) => String((err && err.message) || err).slice(0, 500);

const processStoredEvent = async (doc) => {
  try {
    const result = await polarService.handleEvent(doc.payload);
    await WebhookEvent.updateOne(
      { _id: doc._id },
      {
        $set: {
          status: result.status,
          organizationId: result.organizationId || null,
          lastError: result.note || null,
          processedAt: new Date(),
        },
      }
    );
    return result.status;
  } catch (err) {
    logger.error(`Polar webhook ${doc.eventId} (${doc.type}) failed on attempt ${doc.attempts}: ${safeError(err)}`);
    await WebhookEvent.updateOne({ _id: doc._id }, { $set: { status: 'failed', lastError: safeError(err) } });
    return 'failed';
  }
};

/**
 * @param {{ rawBody: Buffer, headers: Object }} req
 * @returns {Promise<{ duplicate: boolean, status?: string }>}
 */
const ingest = async ({ rawBody, headers }) => {
  const { webhookSecret } = config.billing.polar;
  if (!webhookSecret) {
    logger.error('Polar webhook received but POLAR_WEBHOOK_SECRET is not set');
    throw new ApiError(httpStatus.SERVICE_UNAVAILABLE, 'Webhook receiver not configured');
  }
  if (!Buffer.isBuffer(rawBody) || !rawBody.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Empty webhook body');
  }

  let event;
  try {
    event = validateEvent(rawBody, headers, webhookSecret);
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      logger.warn(`Polar webhook rejected: invalid signature (id ${headers['webhook-id'] || 'none'})`);
      throw new ApiError(httpStatus.FORBIDDEN, 'Invalid webhook signature');
    }
    // Signature was valid (verification happens before parsing) but the SDK does not know
    // this event shape — keep it for the record and acknowledge.
    if (err && err.name === 'SDKValidationError') {
      const raw = err.rawValue && typeof err.rawValue === 'object' ? err.rawValue : {};
      event = { type: raw.type || 'unknown', data: null, unparsed: true };
    } else {
      throw err;
    }
  }

  const eventId = headers['webhook-id'];
  let doc;
  try {
    doc = await WebhookEvent.create({
      provider: 'polar',
      eventId,
      type: event.type,
      payload: event,
      status: event.unparsed ? 'ignored' : 'received',
      attempts: event.unparsed ? 0 : 1,
    });
  } catch (err) {
    if (err.code === 11000) return { duplicate: true };
    throw err;
  }
  if (event.unparsed) return { duplicate: false, status: 'ignored' };
  return { duplicate: false, status: await processStoredEvent(doc) };
};

/**
 * Retry events that failed, or were left in 'received' by a crash mid-processing.
 * Each row is claimed atomically so concurrent schedulers never process it twice.
 */
const retryPending = async ({ now = new Date(), limit = 50 } = {}) => {
  let retried = 0;
  for (let i = 0; i < limit; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    const doc = await WebhookEvent.findOneAndUpdate(
      {
        provider: 'polar',
        status: { $in: ['failed', 'received'] },
        attempts: { $lt: MAX_ATTEMPTS },
        updatedAt: { $lt: new Date(now.getTime() - RETRY_AFTER_MS) },
      },
      { $set: { status: 'received' }, $inc: { attempts: 1 } },
      { new: true, sort: { createdAt: 1 }, lean: true }
    );
    if (!doc) break;
    // eslint-disable-next-line no-await-in-loop
    await processStoredEvent(doc);
    retried += 1;
  }
  return retried;
};

module.exports = { ingest, retryPending, processStoredEvent, MAX_ATTEMPTS };
