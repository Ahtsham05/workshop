const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { whatsappController } = require('../../controllers');

const router = express.Router();

// All WhatsApp routes require authentication, branch scope, and school_management feature
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

// Connection management (schoolAdmin only)
router.get('/status', auth('manageSchool'), whatsappController.getStatus);
router.post('/connect', auth('manageSchool'), whatsappController.connect);
router.post('/disconnect', auth('manageSchool'), whatsappController.disconnectWhatsApp);
router.post('/clear-session', auth('manageSchool'), whatsappController.clearSession);

// Messaging (schoolAdmin only)
router.post('/send', auth('manageSchool'), whatsappController.sendMessage);
router.post('/send-bulk', auth('manageSchool'), whatsappController.sendBulkMessages);
router.post('/send-to-class', auth('manageSchool'), whatsappController.sendToClass);
router.post('/send-to-all', auth('manageSchool'), whatsappController.sendToAll);
router.post('/fee-alerts', auth('manageSchool'), whatsappController.sendFeeAlerts);

module.exports = router;
