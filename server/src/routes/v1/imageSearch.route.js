const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const imageSearchValidation = require('../../validations/imageSearch.validation');
const imageSearchController = require('../../controllers/imageSearch.controller');

const router = express.Router();

// Shared by products, categories, sub-categories and brands — the picker is the same
// dialog everywhere, so it gets one route group instead of a near-identical pair of
// endpoints bolted onto each resource. Plain auth() (any signed-in user): searching
// stores nothing, and importing is capped at 8 images per call.
router.use(auth());

router.route('/search').post(validate(imageSearchValidation.searchImages), imageSearchController.searchImages);

router.route('/import').post(validate(imageSearchValidation.importImages), imageSearchController.importImages);

module.exports = router;
