const catchAsync = require('../utils/catchAsync');
const { verifyWebhookChallenge } = require('../middlewares/whatsappWebhookVerify');
const webhookService = require('../services/whatsapp/webhook.service');

const verify = catchAsync(async (req, res) => verifyWebhookChallenge(req, res));

const receive = catchAsync(async (req, res) => {
  await webhookService.processWebhookPayload(req.body);
  res.sendStatus(200);
});

module.exports = { verify, receive };
