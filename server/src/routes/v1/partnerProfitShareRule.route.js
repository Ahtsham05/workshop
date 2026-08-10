const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const ruleValidation = require('../../validations/partnerProfitShareRule.validation');
const ruleController = require('../../controllers/partnerProfitShareRule.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('managePartnerProfitShareRules'), validate(ruleValidation.createProfitShareRule), ruleController.createProfitShareRule)
  .get(auth('viewPartnerProfitShareRules'), validate(ruleValidation.getProfitShareRules), ruleController.getProfitShareRules);

router
  .route('/resolve')
  .get(auth('viewPartnerProfitShareRules'), validate(ruleValidation.resolveProfitShareRules), ruleController.resolveProfitShareRules);

router
  .route('/:ruleId')
  .get(auth('viewPartnerProfitShareRules'), validate(ruleValidation.getProfitShareRule), ruleController.getProfitShareRule)
  .patch(auth('managePartnerProfitShareRules'), validate(ruleValidation.updateProfitShareRule), ruleController.updateProfitShareRule)
  .delete(auth('managePartnerProfitShareRules'), validate(ruleValidation.deleteProfitShareRule), ruleController.deleteProfitShareRule);

module.exports = router;
