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
  .get(auth('getPayroll', 'getEmployees'), validate(employeeLedgerValidation.getLedgerEntries), employeeLedgerController.getLedgerEntries);

router
  .route('/:ledgerId')
  .patch(auth('managePayroll', 'processPayroll'), validate(employeeLedgerValidation.updateLedgerEntry), employeeLedgerController.updateLedgerEntry)
  .delete(auth('managePayroll', 'processPayroll'), validate(employeeLedgerValidation.deleteLedgerEntry), employeeLedgerController.deleteLedgerEntry);

router
  .route('/employees-with-balances')
  .get(auth('getPayroll', 'getEmployees'), employeeLedgerController.getEmployeesWithBalances);

router
  .route('/employee/:employeeId/summary')
  .get(auth('getPayroll', 'getEmployees'), validate(employeeLedgerValidation.getEmployeeSummary), employeeLedgerController.getEmployeeLedgerSummary);

router
  .route('/advance')
  .post(auth('managePayroll', 'processPayroll'), validate(employeeLedgerValidation.createAdvancePayment), employeeLedgerController.createAdvancePayment);

router
  .route('/pay')
  .post(auth('managePayroll', 'processPayroll'), validate(employeeLedgerValidation.payEmployee), employeeLedgerController.payEmployee);

module.exports = router;
