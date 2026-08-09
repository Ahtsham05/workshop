const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const commissionRuleValidation = require('../../validations/commissionRule.validation');
const commissionRuleController = require('../../controllers/commissionRule.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('manageCommissionRules'), validate(commissionRuleValidation.createCommissionRule), commissionRuleController.createCommissionRule)
  .get(auth('viewCommissionRules'), validate(commissionRuleValidation.getCommissionRules), commissionRuleController.getCommissionRules);

router
  .route('/resolve')
  .get(auth('viewCommissionRules'), validate(commissionRuleValidation.resolveCommissionRate), commissionRuleController.resolveCommissionRate);

router
  .route('/salesman-module-rates')
  .get(auth('viewCommissionRules'), validate(commissionRuleValidation.getSalesmanModuleRates), commissionRuleController.getSalesmanModuleRates);

router
  .route('/:commissionRuleId')
  .get(auth('viewCommissionRules'), validate(commissionRuleValidation.getCommissionRule), commissionRuleController.getCommissionRule)
  .patch(auth('manageCommissionRules'), validate(commissionRuleValidation.updateCommissionRule), commissionRuleController.updateCommissionRule)
  .delete(auth('manageCommissionRules'), validate(commissionRuleValidation.deleteCommissionRule), commissionRuleController.deleteCommissionRule);

module.exports = router;
