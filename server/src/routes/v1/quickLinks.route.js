const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const quickLinksValidation = require('../../validations/quickLinks.validation');
const quickLinksController = require('../../controllers/quickLinks.controller');

const router = express.Router();
router.use(auth(), branchScope());

router.get('/actions', quickLinksController.getAvailableActions);

router
  .route('/')
  .get(quickLinksController.getMyQuickLinks)
  .put(validate(quickLinksValidation.updateQuickLinks), quickLinksController.updateQuickLinks);

router.post('/reset', quickLinksController.resetQuickLinks);

module.exports = router;
