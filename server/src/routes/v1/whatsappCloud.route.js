const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const validate = require('../../middlewares/validate');
const whatsappCloudValidation = require('../../validations/whatsappCloud.validation');
const whatsappCloudController = require('../../controllers/whatsappCloud.controller');

const router = express.Router();

router.get('/connection/callback', whatsappCloudController.oauthCallback);

router.use(auth(), branchScope());

const manageConnection = auth('editSettings', 'manageSchool', 'manageInvoices');

router.get('/connection', manageConnection, whatsappCloudController.getConnection);
router.post('/connection/embedded-signup/start', manageConnection, whatsappCloudController.startEmbeddedSignup);
router.post('/connection/reconnect', manageConnection, whatsappCloudController.reconnect);
router.post('/connection/disconnect', manageConnection, whatsappCloudController.disconnect);
router.post(
  '/connection/manual',
  manageConnection,
  validate(whatsappCloudValidation.manualConnect),
  whatsappCloudController.manualConnect,
);

module.exports = router;
