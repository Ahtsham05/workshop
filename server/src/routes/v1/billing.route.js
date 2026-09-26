const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const httpStatus = require('http-status');
const auth = require('../../middlewares/auth');
const validateZod = require('../../middlewares/validateZod');
const { requireOrgOwner } = require('../../middlewares/entitlement');
const { checkSystemAdmin } = require('../../middlewares/subscription');
const ApiError = require('../../utils/ApiError');
const billingValidation = require('../../validations/billing.validation');
const billingController = require('../../controllers/billing.controller');
const { PROOF_UPLOAD } = require('../../config/billing');

// NOTE: this router is deliberately NOT in routes/v1/index.js protectedPaths — billing must
// keep working while an account is read-only (that is how customers renew).
// The Polar webhook is mounted separately in app.js because it needs the raw body.
const router = express.Router();

/** Per-user (falls back to IP) limiter with the app's standard error shape. */
const limiter = (max, windowMinutes, what) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    keyGenerator: (req) => (req.user ? `u:${req.user._id || req.user.id}` : `ip:${req.ip}`),
    handler: (req, res, next) => {
      const err = new ApiError(httpStatus.TOO_MANY_REQUESTS, `Too many ${what}. Please wait a few minutes and try again.`);
      err.errorCode = 'RATE_LIMITED';
      next(err);
    },
  });

const checkoutLimiter = limiter(10, 15, 'checkout attempts');
const intentLimiter = limiter(20, 60, 'payment references');
const uploadLimiter = limiter(10, 60, 'payment submissions');

const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PROOF_UPLOAD.maxBytes, files: 1, fields: 20 },
}).single('proof');

/** multer errors (too large, unexpected field) → 400 in the app's error shape. */
const handleProofUpload = (req, res, next) =>
  proofUpload(req, res, (err) => {
    if (!err) return next();
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? `The file is too large (max ${PROOF_UPLOAD.maxBytes / 1024 / 1024} MB).`
        : err.message;
    return next(new ApiError(httpStatus.BAD_REQUEST, message));
  });

// ── Unauthenticated ──
router.post('/cron/run', billingController.runCron);

// ── Admin (platform) ──
const admin = express.Router();
admin.use(auth(), checkSystemAdmin);
admin.get(
  '/manual-payments',
  validateZod(billingValidation.adminListManualPayments),
  billingController.adminListManualPayments
);
admin.get(
  '/manual-payments/:paymentId',
  validateZod(billingValidation.paymentIdParam),
  billingController.adminGetManualPayment
);
admin.post(
  '/manual-payments/:paymentId/approve',
  validateZod(billingValidation.paymentIdParam),
  billingController.adminApprove
);
admin.post('/manual-payments/:paymentId/reject', validateZod(billingValidation.adminReject), billingController.adminReject);
admin.get('/settings', billingController.adminGetSettings);
admin.patch('/settings', validateZod(billingValidation.adminUpdateSettings), billingController.adminUpdateSettings);
admin.get('/plans', billingController.adminListPlans);
admin.patch('/plans/:key', validateZod(billingValidation.adminUpdatePlan), billingController.adminUpdatePlan);
admin.patch(
  '/organizations/:orgId/subscription',
  validateZod(billingValidation.adminOverrideSubscription),
  billingController.adminOverrideSubscription
);
admin.get('/audit', validateZod(billingValidation.adminAudit), billingController.adminAudit);
router.use('/admin', admin);

// ── Customer ──
router.use(auth());
router.get('/summary', billingController.getSummary);

// Paying and changing plans is for the organization owner only.
router.post(
  '/plan-change/preview',
  requireOrgOwner,
  validateZod(billingValidation.planOnly),
  billingController.previewPlanChange
);
router.post(
  '/polar/checkout',
  requireOrgOwner,
  checkoutLimiter,
  validateZod(billingValidation.planOnly),
  billingController.createCheckout
);
router.post('/polar/portal', requireOrgOwner, checkoutLimiter, billingController.createPortalSession);
router.post(
  '/polar/change-plan',
  requireOrgOwner,
  checkoutLimiter,
  validateZod(billingValidation.planOnly),
  billingController.changePolarPlan
);
router.post(
  '/manual/intents',
  requireOrgOwner,
  intentLimiter,
  validateZod(billingValidation.createIntent),
  billingController.createManualIntent
);
router.post(
  '/manual/payments',
  requireOrgOwner,
  uploadLimiter,
  handleProofUpload,
  validateZod(billingValidation.submitManualPayment),
  billingController.submitManualPayment
);
router.get(
  '/manual/payments',
  requireOrgOwner,
  validateZod(billingValidation.listMyPayments),
  billingController.listMyManualPayments
);

/** Test hook: clear the in-memory rate-limit counters for one user. */
router.resetRateLimitsForUser = (userId) =>
  [checkoutLimiter, intentLimiter, uploadLimiter].forEach((l) => l.resetKey(`u:${userId}`));

module.exports = router;
