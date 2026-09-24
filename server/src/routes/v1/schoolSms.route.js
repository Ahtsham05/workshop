const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const validate = require('../../middlewares/validate');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const schoolSmsValidation = require('../../validations/schoolSms.validation');
const schoolSmsController = require('../../controllers/schoolSms.controller');

const router = express.Router();

// branchScope(true): an SMS gateway device is registered per branch, so every send here
// must know which branch's phone to dispatch from — an org-wide request has no answer.
router.use(auth(), branchScope(true));

const schoolOnly = [checkFeatureAccess('school_management'), requireSchoolAdmin(), auth('manageSchool')];

router.get('/status', schoolSmsController.getStatus);

router.get('/templates', ...schoolOnly, schoolSmsController.listTemplates);
router.post('/templates', ...schoolOnly, validate(schoolSmsValidation.createTemplate), schoolSmsController.createTemplate);
router.delete('/templates/:id', ...schoolOnly, schoolSmsController.deleteTemplate);

router.post('/send', ...schoolOnly, validate(schoolSmsValidation.sendMessage), schoolSmsController.sendMessage);
router.post('/send-bulk', ...schoolOnly, validate(schoolSmsValidation.sendBulk), schoolSmsController.sendBulkMessages);
router.post('/send-to-class', ...schoolOnly, validate(schoolSmsValidation.sendToClass), schoolSmsController.sendToClass);
router.post('/send-to-all', ...schoolOnly, validate(schoolSmsValidation.sendToAll), schoolSmsController.sendToAll);
router.post(
  '/fee-alerts/preview',
  ...schoolOnly,
  validate(schoolSmsValidation.feeAlerts),
  schoolSmsController.previewFeeAlerts
);
router.post('/fee-alerts', ...schoolOnly, validate(schoolSmsValidation.feeAlerts), schoolSmsController.sendFeeAlerts);

module.exports = router;
