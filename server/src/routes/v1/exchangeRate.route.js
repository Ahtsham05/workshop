const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const exchangeRateValidation = require('../../validations/exchangeRate.validation');
const exchangeRateController = require('../../controllers/exchangeRate.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(
    auth('createExchangeRates'),
    validate(exchangeRateValidation.createOrUpdateRate),
    exchangeRateController.createOrUpdateRate
  )
  .get(auth('viewExchangeRates'), validate(exchangeRateValidation.getRates), exchangeRateController.getRates);

// Registered before the `/:exchangeRateId` catch-all below so `/latest` isn't swallowed
// as an exchangeRateId.
router
  .route('/latest')
  .get(auth('viewExchangeRates'), validate(exchangeRateValidation.getLatestRate), exchangeRateController.getLatestRate);

router
  .route('/:exchangeRateId')
  .get(auth('viewExchangeRates'), validate(exchangeRateValidation.getRate), exchangeRateController.getRate)
  .patch(auth('editExchangeRates'), validate(exchangeRateValidation.updateRate), exchangeRateController.updateRate)
  .delete(auth('deleteExchangeRates'), validate(exchangeRateValidation.deleteRate), exchangeRateController.deleteRate);

module.exports = router;
