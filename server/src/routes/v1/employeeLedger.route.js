const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const employeeLedgerValidation = require('../../validations/employeeLedger.validation');
const employeeLedgerController = require('../../controllers/employeeLedger.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .get(validate(employeeLedgerValidation.getLedgerEntries), employeeLedgerController.getLedgerEntries);

router
  .route('/:ledgerId')
  .patch(validate(employeeLedgerValidation.updateLedgerEntry), employeeLedgerController.updateLedgerEntry)
  .delete(validate(employeeLedgerValidation.deleteLedgerEntry), employeeLedgerController.deleteLedgerEntry);

router
  .route('/employees-with-balances')
  .get(employeeLedgerController.getEmployeesWithBalances);

router
  .route('/employee/:employeeId/summary')
  .get(validate(employeeLedgerValidation.getEmployeeSummary), employeeLedgerController.getEmployeeLedgerSummary);

router
  .route('/advance')
  .post(validate(employeeLedgerValidation.createAdvancePayment), employeeLedgerController.createAdvancePayment);

router
  .route('/pay')
  .post(validate(employeeLedgerValidation.payEmployee), employeeLedgerController.payEmployee);

module.exports = router;
