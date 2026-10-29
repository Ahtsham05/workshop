const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const quickLinksValidation = require('../../validations/quickLinks.validation');
const quickLinksController = require('../../controllers/quickLinks.controller');

const router = express.Router();
router.use(auth(), branchScope());

router.get('/actions', validate(quickLinksValidation.boardQuery), quickLinksController.getAvailableActions);

router
  .route('/')
  .get(validate(quickLinksValidation.boardQuery), quickLinksController.getMyQuickLinks)
  .put(validate(quickLinksValidation.updateQuickLinks), quickLinksController.updateQuickLinks);

router.post('/reset', validate(quickLinksValidation.boardQuery), quickLinksController.resetQuickLinks);

module.exports = router;
