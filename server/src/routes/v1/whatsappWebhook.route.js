const express = require('express');
const { verifyWebhookSignature } = require('../../middlewares/whatsappWebhookVerify');
const whatsappWebhookController = require('../../controllers/whatsappWebhook.controller');

const router = express.Router();

router.get('/', whatsappWebhookController.verify);
router.post('/', verifyWebhookSignature, whatsappWebhookController.receive);

module.exports = router;
