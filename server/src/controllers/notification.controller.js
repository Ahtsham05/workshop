const httpStatus = require('http-status');
const pick = require('../utils/pick');
const catchAsync = require('../utils/catchAsync');
const { notificationService } = require('../services');
const { getBranchContext } = require('../utils/branchFilter');

const getScope = (req) => ({ organizationId: req.organizationId || req.user.organizationId });

/** POST /notifications — admin sends a notification to teachers/students/parents. */
const createNotification = catchAsync(async (req, res) => {
  const branchCtx = getBranchContext(req);
  const doc = await notificationService.createNotification({
    organizationId: req.user.organizationId,
    branchId: branchCtx.branchId,
    title: req.body.title,
    message: req.body.message,
    audience: req.body.audience,
    type: req.body.type,
    createdBy: req.user.id,
  });
  res.status(httpStatus.CREATED).send(doc);
});

/** GET /notifications — notifications visible to the current user. */
const getMyNotifications = catchAsync(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const items = await notificationService.listForUser(req.user, getScope(req), { limit });
  res.send(items);
});

/** GET /notifications/unread-count — unseen count for the current user. */
const getUnreadCount = catchAsync(async (req, res) => {
  const count = await notificationService.unreadCountForUser(req.user, getScope(req));
  res.send({ count });
});

/** POST /notifications/:id/read — mark a single notification as read. */
const markRead = catchAsync(async (req, res) => {
  await notificationService.markRead(req.user, req.params.id);
  res.send({ ok: true });
});

/** POST /notifications/read-all — mark all visible notifications as read. */
const markAllRead = catchAsync(async (req, res) => {
  const result = await notificationService.markAllRead(req.user, getScope(req));
  res.send(result);
});

/** GET /notifications/sent — admin list of sent notifications. */
const getSent = catchAsync(async (req, res) => {
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await notificationService.querySent(getScope(req), options);
  res.send(result);
});

/** DELETE /notifications/:id — admin removes a notification. */
const deleteNotification = catchAsync(async (req, res) => {
  await notificationService.deleteNotification(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createNotification,
  getMyNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  getSent,
  deleteNotification,
};
