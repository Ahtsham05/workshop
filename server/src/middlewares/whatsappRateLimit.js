const rateLimit = require('express-rate-limit');

const whatsappSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `${req.organizationId || 'anon'}:${req.branchId || 'none'}`,
  message: { message: 'WhatsApp send rate limit exceeded. Try again in a minute.' },
});

module.exports = { whatsappSendLimiter };
