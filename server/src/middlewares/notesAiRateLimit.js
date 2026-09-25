const rateLimit = require('express-rate-limit');

/**
 * Every Notes AI action/ask call is a real Gemini API call — mirrors aiAssistantRateLimit.js's
 * reasoning (cost scales with usage, not just server load). Keyed per-user, same as the business
 * assistant limiter: notes are personal, so one user's usage shouldn't throttle a teammate.
 * Not applied to the related-notes endpoint, which is pure DB scoring with no AI call.
 */
const notesAiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || `${req.organizationId || 'anon'}:${req.branchId || 'none'}`,
  message: { message: 'Too many AI requests. Please wait a moment and try again.' },
});

module.exports = { notesAiLimiter };
