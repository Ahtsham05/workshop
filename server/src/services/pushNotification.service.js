const webpush = require('web-push');
const { PushSubscription } = require('../models');
const config = require('../config/config');
const logger = require('../config/logger');

let configured = false;

const ensureConfigured = () => {
  if (configured) return !!config.vapid.publicKey;
  const { publicKey, privateKey, subject } = config.vapid;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
};

const getVapidPublicKey = () => config.vapid.publicKey || null;

const subscribe = async (user, subscription, meta = {}) => {
  const userId = user._id || user.id;
  return PushSubscription.findOneAndUpdate(
    { userId, endpoint: subscription.endpoint },
    {
      userId,
      organizationId: user.organizationId,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      userAgent: meta.userAgent,
    },
    { upsert: true, new: true }
  );
};

const unsubscribe = async (user, endpoint) => {
  const userId = user._id || user.id;
  await PushSubscription.deleteOne({ userId, endpoint });
  return { ok: true };
};

const sendToUser = async (userId, payload) => {
  if (!ensureConfigured()) return { sent: 0, skipped: true };

  const subs = await PushSubscription.find({ userId }).lean();
  if (!subs.length) return { sent: 0 };

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    tag: payload.tag,
    url: payload.url || '/school/portals/student',
    icon: payload.icon,
  });

  let sent = 0;
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body
        );
        sent += 1;
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          logger.warn(`Push failed for user ${userId}: ${err.message}`);
        }
      }
    })
  );
  return { sent };
};

module.exports = {
  getVapidPublicKey,
  subscribe,
  unsubscribe,
  sendToUser,
  ensureConfigured,
};
