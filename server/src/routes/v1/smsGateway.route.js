const express = require('express');
const { SMS_SENDERS } = require('../../config/permissionSets');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const smsGatewayController = require('../../controllers/smsGateway.controller');

const router = express.Router();

router.use(auth(), branchScope());

// Device management
router.get('/devices', auth('viewSmsLog', 'editSettings'), smsGatewayController.listDevices);
router.post('/devices', auth('editSettings'), smsGatewayController.registerDevice);
router.delete('/devices/:deviceId', auth('editSettings'), smsGatewayController.deleteDevice);

// Sending
router.post('/send', auth(...SMS_SENDERS), smsGatewayController.sendSms);
router.post('/send-bulk', auth(...SMS_SENDERS), smsGatewayController.sendBulkSms);

// History
router.get('/messages', auth('viewSmsLog'), smsGatewayController.getMessages);
router.post('/messages/:id/resend', auth('viewSmsLog'), smsGatewayController.resendSms);
router.delete('/messages/:id', auth('viewSmsLog'), smsGatewayController.deleteSms);

module.exports = router;
