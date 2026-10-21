const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const cashBookValidation = require('../../validations/cashBook.validation');
const cashBookController = require('../../controllers/cashBook.controller');

const router = express.Router();

router.use(auth(), branchScope());

router.route('/').get(auth('viewCashBook'), validate(cashBookValidation.getCashBookEntries), cashBookController.getCashBookEntries);

router.route('/summary').get(auth('viewCashBook'), validate(cashBookValidation.getCashBookSummary), cashBookController.getCashBookSummary);

router
  .route('/opening-balance')
  .get(auth('viewCashBook'), cashBookController.getOpeningBalance)
  .post(auth('manageCashBook'), validate(cashBookValidation.setOpeningBalance), cashBookController.setOpeningBalance);

module.exports = router;
