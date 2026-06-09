const crypto = require('crypto');
const config = require('../config/config');

function verifyWebhookSignature(req, res, next) {
  const signature = req.headers['x-hub-signature-256'];
  const secret = config.whatsapp.webhookSecret;
  if (!secret) {
    return next();
  }
  if (!signature || !req.rawBody) {
    return res.sendStatus(401);
  }

  const expected = `sha256=${crypto.createHmac('sha256', secret).update(req.rawBody).digest('hex')}`;
  try {
    const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) return res.sendStatus(401);
  } catch {
    return res.sendStatus(401);
  }
  next();
}

function verifyWebhookChallenge(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = config.whatsapp.webhookVerifyToken;

  if (mode === 'subscribe' && token && verifyToken && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

module.exports = { verifyWebhookSignature, verifyWebhookChallenge };
