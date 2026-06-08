const httpStatus = require('http-status');
const { Notification, NotificationRead } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = scope.organizationId;
  return filter;
};

/** Resolve the school role used to match notification audiences for a user. */
const roleOf = (user) => {
  if (!user) return null;
  if (user.schoolRole) return user.schoolRole;
  if (user.linkedTeacherId) return 'teacher';
  return null;
};

/** Create + broadcast a notification to the given audience roles. */
const createNotification = async (body) => {
  const audience = Array.isArray(body.audience) ? body.audience.filter(Boolean) : [];
  if (!audience.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Select at least one audience (teachers/students/parents)');
  }
  const doc = await Notification.create({
    organizationId: body.organizationId,
    branchId: body.branchId,
    title: body.title,
    message: body.message,
    audience,
    type: body.type || 'general',
    createdBy: body.createdBy,
  });

  // Web push to subscribed portal users (fire-and-forget)
  const pushNotificationService = require('./pushNotification.service');
  pushNotificationService
    .sendToAudience(body.organizationId, audience, {
      title: body.title,
      body: body.message,
      tag: `broadcast-${doc._id}`,
    })
    .catch((err) => {
      const logger = require('../config/logger');
      logger.warn(`Broadcast push failed: ${err.message}`);
    });

  return doc;
};

const visibilityFilter = (user, scope) => {
  const role = roleOf(user);
  const userId = user._id || user.id;
  return {
    ...getTenantFilter(scope),
    audience: { $in: [role] },
    $or: [
      { recipientUserId: { $exists: false } },
      { recipientUserId: null },
      { recipientUserId: userId },
    ],
  };
};

/** Notifications visible to a recipient user, newest first, with a read flag. */
const listForUser = async (user, scope, { limit = 50 } = {}) => {
  const role = roleOf(user);
  if (!role) return [];

  const notifications = await Notification.find(visibilityFilter(user, scope))
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  if (!notifications.length) return [];

  const ids = notifications.map((n) => n._id);
  const reads = await NotificationRead.find({ userId: user._id || user.id, notificationId: { $in: ids } })
    .select('notificationId')
    .lean();
  const readSet = new Set(reads.map((r) => String(r.notificationId)));

  return notifications.map((n) => ({ ...n, read: readSet.has(String(n._id)) }));
};

/** Count of unread notifications for a recipient user. */
const unreadCountForUser = async (user, scope) => {
  const role = roleOf(user);
  if (!role) return 0;

  const notifications = await Notification.find(visibilityFilter(user, scope))
    .select('_id')
    .lean();
  if (!notifications.length) return 0;

  const ids = notifications.map((n) => n._id);
  const readCount = await NotificationRead.countDocuments({
    userId: user._id || user.id,
    notificationId: { $in: ids },
  });
  return Math.max(0, ids.length - readCount);
};

/** Mark a single notification as read for a user (idempotent). */
const markRead = async (user, notificationId) => {
  await NotificationRead.updateOne(
    { userId: user._id || user.id, notificationId },
    { $setOnInsert: { readAt: new Date() } },
    { upsert: true }
  );
  return { ok: true };
};

/** Mark every notification visible to the user as read. */
const markAllRead = async (user, scope) => {
  const role = roleOf(user);
  if (!role) return { ok: true, marked: 0 };

  const notifications = await Notification.find(visibilityFilter(user, scope))
    .select('_id')
    .lean();
  if (!notifications.length) return { ok: true, marked: 0 };

  const userId = user._id || user.id;
  const ops = notifications.map((n) => ({
    updateOne: {
      filter: { userId, notificationId: n._id },
      update: { $setOnInsert: { readAt: new Date() } },
      upsert: true,
    },
  }));
  const res = await NotificationRead.bulkWrite(ops, { ordered: false });
  return { ok: true, marked: res.upsertedCount || 0 };
};

/** Admin view: paginated list of notifications sent in the organization. */
const querySent = async (scope, options = {}) => {
  return Notification.paginate(getTenantFilter(scope), {
    ...options,
    sortBy: options.sortBy || 'createdAt:desc',
    populate: 'createdBy',
  });
};

/** Delete a notification (and its read receipts). */
const deleteNotification = async (id, scope = {}) => {
  const doc = await Notification.findOne({ _id: id, ...getTenantFilter(scope) });
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Notification not found');
  await NotificationRead.deleteMany({ notificationId: id });
  await doc.deleteOne();
  return doc;
};

module.exports = {
  createNotification,
  listForUser,
  unreadCountForUser,
  markRead,
  markAllRead,
  querySent,
  deleteNotification,
};
