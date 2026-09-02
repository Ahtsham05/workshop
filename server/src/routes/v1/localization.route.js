const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const localizationController = require('../../controllers/localization.controller');

const router = express.Router();
router.use(auth(), branchScope());

// Read-only country/currency reference catalog — no organizationId scoping needed (see
// localization.service.js), so these are plain GETs with no Joi validation beyond the
// path param, which is a free string safely passed through to getCountryDefaults (an
// unknown code just falls back to its own defaults rather than erroring).
router.route('/countries').get(auth('viewLocalizationSettings'), localizationController.getCountries);

router.route('/currencies').get(auth('viewLocalizationSettings'), localizationController.getCurrencies);

router
  .route('/countries/:code/defaults')
  .get(auth('viewLocalizationSettings'), localizationController.getCountryDefaults);

module.exports = router;
