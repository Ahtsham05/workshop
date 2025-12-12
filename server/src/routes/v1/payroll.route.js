const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const { payrollValidation } = require('../../validations');
const { payrollController } = require('../../controllers');

const router = express.Router();

router
  .route('/')
  .post(auth(), validate(payrollValidation.createPayroll), payrollController.createPayroll)
  .get(auth(), validate(payrollValidation.getPayrolls), payrollController.getPayrolls);

router
  .route('/generate')
  .post(auth(), validate(payrollValidation.generatePayroll), payrollController.generatePayroll);

router
  .route('/:payrollId/process')
  .patch(auth(), validate(payrollValidation.processPayroll), payrollController.processPayroll);

router
  .route('/:payrollId/paid')
  .patch(auth(), validate(payrollValidation.markPayrollPaid), payrollController.markPayrollPaid);

router
  .route('/:payrollId')
  .get(auth(), validate(payrollValidation.getPayroll), payrollController.getPayroll)
  .patch(auth(), validate(payrollValidation.updatePayroll), payrollController.updatePayroll)
  .delete(auth(), validate(payrollValidation.deletePayroll), payrollController.deletePayroll);

module.exports = router;
