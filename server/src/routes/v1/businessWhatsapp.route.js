const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const businessWhatsappValidation = require('../../validations/businessWhatsapp.validation');
const businessWhatsappController = require('../../controllers/businessWhatsapp.controller');

const router = express.Router();

router.get('/status', auth('viewInvoices'), businessWhatsappController.getStatus);
router.get('/cloud-config', auth('viewInvoices'), businessWhatsappController.getCloudConfig);
router.patch(
  '/cloud-config',
  auth('manageInvoices'),
  validate(businessWhatsappValidation.updateCloudConfig),
  businessWhatsappController.updateCloudConfig,
);

router.post('/connect', auth('manageInvoices'), businessWhatsappController.connect);
router.post('/disconnect', auth('manageInvoices'), businessWhatsappController.disconnectWhatsApp);
router.post('/clear-session', auth('manageInvoices'), businessWhatsappController.clearSession);

router.post(
  '/send-invoice-pdf',
  auth('viewInvoices'),
  validate(businessWhatsappValidation.sendInvoicePdf),
  businessWhatsappController.sendInvoicePdf,
);

module.exports = router;
