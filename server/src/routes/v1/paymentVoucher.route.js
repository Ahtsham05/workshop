const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const paymentVoucherValidation = require('../../validations/paymentVoucher.validation');
const paymentVoucherController = require('../../controllers/paymentVoucher.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('managePaymentVouchers'), validate(paymentVoucherValidation.createVoucher), paymentVoucherController.createVoucher)
  .get(auth('viewPaymentVouchers'), validate(paymentVoucherValidation.getVouchers), paymentVoucherController.getVouchers);

router
  .route('/:paymentVoucherId')
  .get(auth('viewPaymentVouchers'), validate(paymentVoucherValidation.getVoucher), paymentVoucherController.getVoucher)
  .delete(auth('managePaymentVouchers'), validate(paymentVoucherValidation.deleteVoucher), paymentVoucherController.deleteVoucher);

module.exports = router;
