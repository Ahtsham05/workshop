const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const { payrollValidation } = require('../../validations');
const { payrollController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('createPayroll'), validate(payrollValidation.createPayroll), payrollController.createPayroll)
  .get(auth('getPayroll'), validate(payrollValidation.getPayrolls), payrollController.getPayrolls);

router
  .route('/generate')
  .post(auth('createPayroll'), validate(payrollValidation.generatePayroll), payrollController.generatePayroll);

router
  .route('/:payrollId/process')
  .patch(auth('processPayroll'), validate(payrollValidation.processPayroll), payrollController.processPayroll);

router
  .route('/:payrollId/paid')
  .patch(auth('processPayroll'), validate(payrollValidation.markPayrollPaid), payrollController.markPayrollPaid);

router
  .route('/:payrollId')
  .get(auth('getPayroll'), validate(payrollValidation.getPayroll), payrollController.getPayroll)
  .patch(auth('managePayroll'), validate(payrollValidation.updatePayroll), payrollController.updatePayroll)
  .delete(auth('deletePayroll'), validate(payrollValidation.deletePayroll), payrollController.deletePayroll);

module.exports = router;
