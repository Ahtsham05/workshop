const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const priceCheckerValidation = require('../../validations/priceChecker.validation');
const priceCheckerController = require('../../controllers/priceChecker.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/check')
  .post(auth('viewPriceChecker'), validate(priceCheckerValidation.checkPrice), priceCheckerController.checkPrice);

router
  .route('/sources')
  .post(
    auth('managePriceCheckerSources'),
    validate(priceCheckerValidation.createSource),
    priceCheckerController.createSource
  )
  .get(auth('viewPriceChecker'), validate(priceCheckerValidation.getSources), priceCheckerController.getSources);

router
  .route('/sources/all')
  .get(auth('viewPriceChecker'), validate(priceCheckerValidation.getAllSources), priceCheckerController.getAllSources);

// Registered before the `/sources/:sourceId` catch-all below so `/sources/test` and
// `/sources/auto-detect` aren't swallowed as a sourceId.
router
  .route('/sources/test')
  .post(
    auth('managePriceCheckerSources'),
    validate(priceCheckerValidation.testSource),
    priceCheckerController.testSource
  );

router
  .route('/sources/auto-detect')
  .post(
    auth('managePriceCheckerSources'),
    validate(priceCheckerValidation.autoDetect),
    priceCheckerController.autoDetect
  );

router
  .route('/sources/:sourceId')
  .get(auth('viewPriceChecker'), validate(priceCheckerValidation.getSource), priceCheckerController.getSource)
  .patch(
    auth('managePriceCheckerSources'),
    validate(priceCheckerValidation.updateSource),
    priceCheckerController.updateSource
  )
  .delete(
    auth('managePriceCheckerSources'),
    validate(priceCheckerValidation.deleteSource),
    priceCheckerController.deleteSource
  );

module.exports = router;
