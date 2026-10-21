const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const personalLedgerValidation = require('../../validations/personalLedger.validation');
const personalLedgerController = require('../../controllers/personalLedger.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('managePersonalWallet'), validate(personalLedgerValidation.createEntry), personalLedgerController.createEntry)
  .get(auth('managePersonalWallet', 'viewAccounting', 'viewReports'), validate(personalLedgerValidation.getEntries), personalLedgerController.getEntries);

router
  .route('/balance')
  .get(auth('managePersonalWallet', 'viewAccounting', 'viewReports'), personalLedgerController.getBalance);

router
  .route('/summary')
  .get(auth('managePersonalWallet', 'viewAccounting', 'viewReports'), personalLedgerController.getSummary);

router
  .route('/:entryId')
  .get(auth('managePersonalWallet', 'viewAccounting', 'viewReports'), validate(personalLedgerValidation.getEntry), personalLedgerController.getEntry)
  .patch(auth('managePersonalWallet'), validate(personalLedgerValidation.updateEntry), personalLedgerController.updateEntry)
  .delete(auth('managePersonalWallet'), validate(personalLedgerValidation.deleteEntry), personalLedgerController.deleteEntry);

module.exports = router;
