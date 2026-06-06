/**
 * Notification routes.
 *
 * - Recipient endpoints (list / unread-count / mark-read) are open to any
 *   authenticated user; non-recipients simply get empty results / 0.
 * - Admin endpoints (send / sent list / delete) require school admin.
 */
const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { notificationValidation } = require('../../validations');
const { notificationController } = require('../../controllers');

const router = express.Router();

router.use(auth(), branchScope(false), checkFeatureAccess('school_management'));

// ── Recipient (any authenticated school user) ──
router.get('/', notificationController.getMyNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.post('/read-all', notificationController.markAllRead);
router.post('/:id/read', validate(notificationValidation.idParam), notificationController.markRead);

// ── Admin ──
router.post('/', requireSchoolAdmin(), validate(notificationValidation.createNotification), notificationController.createNotification);
router.get('/sent', requireSchoolAdmin(), validate(notificationValidation.getSent), notificationController.getSent);
router.delete('/:id', requireSchoolAdmin(), validate(notificationValidation.idParam), notificationController.deleteNotification);

module.exports = router;
