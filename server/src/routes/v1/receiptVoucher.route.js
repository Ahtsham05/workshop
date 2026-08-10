const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const receiptVoucherValidation = require('../../validations/receiptVoucher.validation');
const receiptVoucherController = require('../../controllers/receiptVoucher.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('managePaymentVouchers'), validate(receiptVoucherValidation.createVoucher), receiptVoucherController.createVoucher)
  .get(auth('viewPaymentVouchers'), validate(receiptVoucherValidation.getVouchers), receiptVoucherController.getVouchers);

router
  .route('/:receiptVoucherId')
  .get(auth('viewPaymentVouchers'), validate(receiptVoucherValidation.getVoucher), receiptVoucherController.getVoucher)
  .delete(auth('managePaymentVouchers'), validate(receiptVoucherValidation.deleteVoucher), receiptVoucherController.deleteVoucher);

module.exports = router;
