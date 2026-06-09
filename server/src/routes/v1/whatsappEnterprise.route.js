const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const { sseAuth, sseBranchScope } = require('../../middlewares/sseAuth');
const validate = require('../../middlewares/validate');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { whatsappSendLimiter } = require('../../middlewares/whatsappRateLimit');
const whatsappCloudValidation = require('../../validations/whatsappCloud.validation');
const whatsappInboxController = require('../../controllers/whatsappInbox.controller');
const whatsappEnterpriseController = require('../../controllers/whatsappEnterprise.controller');

const router = express.Router();

router.get('/events/stream', sseAuth(), sseBranchScope(), whatsappInboxController.streamEvents);

router.use(auth(), branchScope());

router.get('/conversations/unread-count', whatsappInboxController.getUnreadCount);
router.get('/conversations', whatsappInboxController.listConversations);
router.get('/conversations/:id', whatsappInboxController.getConversation);
router.get('/conversations/:id/messages', whatsappInboxController.getMessages);
router.patch(
  '/conversations/:id',
  validate(whatsappCloudValidation.updateConversation),
  whatsappInboxController.updateConversation,
);
router.post('/conversations/:id/read', whatsappInboxController.markRead);
router.post(
  '/messages/send',
  whatsappSendLimiter,
  validate(whatsappCloudValidation.sendMessage),
  whatsappInboxController.sendMessage,
);

router.get('/templates', whatsappEnterpriseController.listTemplates);
router.post('/templates/sync', auth('editSettings', 'manageSchool'), whatsappEnterpriseController.syncTemplates);
router.get('/templates/:id', whatsappEnterpriseController.getTemplate);

router.get('/campaigns', whatsappEnterpriseController.listCampaigns);
router.post(
  '/campaigns',
  auth('manageSchool', 'editSettings'),
  validate(whatsappCloudValidation.createCampaign),
  whatsappEnterpriseController.createCampaign,
);
router.post('/campaigns/:id/run', auth('manageSchool', 'editSettings'), whatsappEnterpriseController.runCampaign);
router.get('/campaigns/:id/report', whatsappEnterpriseController.getCampaignReport);

router.get('/analytics/overview', whatsappEnterpriseController.getAnalyticsOverview);
router.get('/analytics/messages', whatsappEnterpriseController.getAnalyticsTimeSeries);

router.post(
  '/pos/send-invoice',
  auth('viewInvoices'),
  whatsappSendLimiter,
  validate(whatsappCloudValidation.sendInvoicePdf),
  whatsappEnterpriseController.sendInvoicePdf,
);
router.post('/pos/payment-reminder', auth('viewInvoices'), whatsappEnterpriseController.sendPaymentReminder);

const schoolOnly = [checkFeatureAccess('school_management'), requireSchoolAdmin(), auth('manageSchool')];

router.post('/school/attendance-alert', ...schoolOnly, whatsappEnterpriseController.sendAttendanceAlert);
router.post('/school/fee-reminder', ...schoolOnly, whatsappEnterpriseController.sendFeeReminder);
router.post('/school/result-notification', ...schoolOnly, whatsappEnterpriseController.sendResultNotification);
router.post('/school/holiday-notice', ...schoolOnly, whatsappEnterpriseController.sendHolidayNotice);

module.exports = router;
