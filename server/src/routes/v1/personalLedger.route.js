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
  .post(validate(personalLedgerValidation.createEntry), personalLedgerController.createEntry)
  .get(validate(personalLedgerValidation.getEntries), personalLedgerController.getEntries);

router
  .route('/balance')
  .get(personalLedgerController.getBalance);

router
  .route('/summary')
  .get(personalLedgerController.getSummary);

router
  .route('/:entryId')
  .get(validate(personalLedgerValidation.getEntry), personalLedgerController.getEntry)
  .patch(validate(personalLedgerValidation.updateEntry), personalLedgerController.updateEntry)
  .delete(validate(personalLedgerValidation.deleteEntry), personalLedgerController.deleteEntry);

module.exports = router;
