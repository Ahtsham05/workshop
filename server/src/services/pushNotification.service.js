const webpush = require('web-push');
const { PushSubscription, User } = require('../models');
const config = require('../config/config');
const logger = require('../config/logger');

const PORTAL_URL = {
  student: '/school/portals/student',
  parent: '/school/portals/parent',
  teacher: '/school/portals/teacher',
};

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

/** Send push to every portal user whose schoolRole matches one of the audience roles. */
const sendToAudience = async (organizationId, audience, payload) => {
  if (!ensureConfigured()) return { sent: 0, skipped: true };

  const roles = (audience || []).filter((r) => ['teacher', 'student', 'parent'].includes(r));
  if (!roles.length) return { sent: 0 };

  const users = await User.find({
    organizationId,
    schoolRole: { $in: roles },
  })
    .select('_id schoolRole')
    .lean();

  let sent = 0;
  await Promise.all(
    users.map(async (user) => {
      const result = await sendToUser(user._id, {
        ...payload,
        url: PORTAL_URL[user.schoolRole] || payload.url || '/',
      });
      sent += result.sent || 0;
    })
  );
  return { sent, users: users.length };
};

module.exports = {
  getVapidPublicKey,
  subscribe,
  unsubscribe,
  sendToUser,
  sendToAudience,
  ensureConfigured,
};
