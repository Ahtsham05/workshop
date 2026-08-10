const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const bankReconciliationValidation = require('../../validations/bankReconciliation.validation');
const bankReconciliationController = require('../../controllers/bankReconciliation.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/:walletId/summary')
  .get(auth('viewBankReconciliation'), validate(bankReconciliationValidation.getSummary), bankReconciliationController.getSummary);

router
  .route('/:walletId/unreconciled')
  .get(auth('viewBankReconciliation'), validate(bankReconciliationValidation.getUnreconciled), bankReconciliationController.getUnreconciled);

router
  .route('/:walletId/match')
  .post(auth('manageBankReconciliation'), validate(bankReconciliationValidation.matchStatement), bankReconciliationController.matchStatement);

router
  .route('/:walletId/confirm')
  .post(auth('manageBankReconciliation'), validate(bankReconciliationValidation.confirmReconciliation), bankReconciliationController.confirmReconciliation);

router
  .route('/:walletId/history')
  .get(auth('viewBankReconciliation'), validate(bankReconciliationValidation.getHistory), bankReconciliationController.getHistory);

router
  .route('/entries/:walletEntryId/unreconcile')
  .post(auth('manageBankReconciliation'), validate(bankReconciliationValidation.unreconcileEntry), bankReconciliationController.unreconcileEntry);

module.exports = router;
