const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const validate = require('../../middlewares/validate');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const whatsappValidation = require('../../validations/whatsapp.validation');
const { whatsappController } = require('../../controllers');

const router = express.Router();

router.use(auth(), branchScope(false));

const manageConnection = auth('editSettings', 'manageSchool', 'manageInvoices', 'viewRoles');

// ── Connection (QR scan — whatsapp-web.js, no official API) ─────────────────
router.get('/status', whatsappController.getStatus);
router.post('/connect', manageConnection, whatsappController.connect);
router.post('/disconnect', manageConnection, whatsappController.disconnectWhatsApp);
router.post('/clear-session', manageConnection, whatsappController.clearSession);
router.post('/test', manageConnection, whatsappController.sendTest);

// ── Messaging (available to all authenticated users when connected) ───────
router.post('/send', whatsappController.sendMessage);
router.post(
  '/send-document',
  validate(whatsappValidation.sendDocument),
  whatsappController.sendDocument,
);
router.post(
  '/send-invoice-pdf',
  validate(whatsappValidation.sendInvoicePdf),
  whatsappController.sendInvoicePdf,
);

// ── School bulk messaging (school orgs only) ────────────────────────────────
const schoolOnly = [
  checkFeatureAccess('school_management'),
  requireSchoolAdmin(),
  auth('manageSchool'),
];

router.post('/send-bulk', ...schoolOnly, whatsappController.sendBulkMessages);
router.post('/send-to-class', ...schoolOnly, whatsappController.sendToClass);
router.post('/send-to-all', ...schoolOnly, whatsappController.sendToAll);
router.post('/fee-alerts', ...schoolOnly, whatsappController.sendFeeAlerts);

module.exports = router;
