const rateLimit = require('express-rate-limit');

/**
 * Every message here can trigger up to MAX_TOOL_ROUNDS (6, see gemini.service.js) real Gemini
 * API calls plus their DB tool-call queries — unlike most routes, cost scales with usage, not
 * just server load. Keyed per-user (not org+branch like whatsappRateLimit.js) since AI
 * conversations are inherently per-user, not a shared resource — one person spamming shouldn't
 * throttle a coworker's legitimate use of the assistant in the same org/branch. Only applied to
 * the two endpoints that actually call Gemini (sendMessage/sendMessageStream) — confirm/cancel
 * -action and the read-only list/get endpoints don't, so they're left unlimited.
 */
const aiMessageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || `${req.organizationId || 'anon'}:${req.branchId || 'none'}`,
  message: { message: 'Too many messages sent to the AI assistant. Please wait a moment and try again.' },
});

module.exports = { aiMessageLimiter };
