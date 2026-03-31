const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const cashBookValidation = require('../../validations/cashBook.validation');
const cashBookController = require('../../controllers/cashBook.controller');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('mobile_shop'));

router.route('/').get(validate(cashBookValidation.getCashBookEntries), cashBookController.getCashBookEntries);

router.route('/summary').get(validate(cashBookValidation.getCashBookSummary), cashBookController.getCashBookSummary);

module.exports = router;
