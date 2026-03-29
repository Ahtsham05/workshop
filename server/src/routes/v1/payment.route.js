const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const { trialGuard } = require('../../middlewares/trialGuard');
const paymentValidation = require('../../validations/payment.validation');
const paymentController = require('../../controllers/payment.controller');
const { upload } = require('../../middlewares/upload');

const router = express.Router();

// Apply trial guard to all routes so controllers have trial status
router.use(auth(), trialGuard);

// GET /v1/payments/bank-details — public info about bank transfer (auth still required for security)
router.get('/bank-details', paymentController.getBankDetails);

// GET /v1/payments/trial/status — trial/subscription expiration status
router.get('/trial/status', paymentController.getTrialStatus);

// GET /v1/payments/subscription/usage — subscription status + branch/user usage
router.get('/subscription/usage', paymentController.getSubscriptionUsage);

// POST /v1/payments/screenshot — upload screenshot, returns { url, publicId }
router.post('/screenshot', upload.single('screenshot'), paymentController.uploadScreenshot);

// POST /v1/payments — submit payment proof
router.post(
  '/',
  validate(paymentValidation.submitPayment),
  paymentController.submitPayment
);

// GET /v1/payments/my — org payment history
router.get('/my', validate(paymentValidation.getPayments), paymentController.getMyPayments);

// GET /v1/payments/:paymentId — single payment
router.get('/:paymentId', validate(paymentValidation.getPayment), paymentController.getPayment);

module.exports = router;
