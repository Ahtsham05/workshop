const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const smsGatewayController = require('../../controllers/smsGateway.controller');

const router = express.Router();

router.use(auth(), branchScope());

// Device management
router.get('/devices', smsGatewayController.listDevices);
router.post('/devices', smsGatewayController.registerDevice);
router.delete('/devices/:deviceId', smsGatewayController.deleteDevice);

// Sending
router.post('/send', smsGatewayController.sendSms);
router.post('/send-bulk', smsGatewayController.sendBulkSms);

// History
router.get('/messages', smsGatewayController.getMessages);

module.exports = router;
