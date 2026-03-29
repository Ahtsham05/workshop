const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const paymentValidation = require('../../validations/payment.validation');
const paymentController = require('../../controllers/payment.controller');
const { upload } = require('../../middlewares/upload');

const router = express.Router();

// GET /v1/payments/bank-details — public info about bank transfer (auth still required for security)
router.get('/bank-details', auth(), paymentController.getBankDetails);

// GET /v1/payments/subscription/usage — subscription status + branch/user usage
router.get('/subscription/usage', auth(), paymentController.getSubscriptionUsage);

// POST /v1/payments/screenshot — upload screenshot, returns { url, publicId }
router.post('/screenshot', auth(), upload.single('screenshot'), paymentController.uploadScreenshot);

// POST /v1/payments — submit payment proof
router.post(
  '/',
  auth(),
  validate(paymentValidation.submitPayment),
  paymentController.submitPayment
);

// GET /v1/payments/my — org payment history
router.get('/my', auth(), validate(paymentValidation.getPayments), paymentController.getMyPayments);

// GET /v1/payments/:paymentId — single payment
router.get('/:paymentId', auth(), validate(paymentValidation.getPayment), paymentController.getPayment);

module.exports = router;
