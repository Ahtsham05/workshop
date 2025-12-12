const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const { employeeValidation } = require('../../validations');
const { employeeController } = require('../../controllers');

const router = express.Router();

router
  .route('/')
  .post(auth(), validate(employeeValidation.createEmployee), employeeController.createEmployee)
  .get(auth(), validate(employeeValidation.getEmployees), employeeController.getEmployees);

router
  .route('/:employeeId')
  .get(auth(), validate(employeeValidation.getEmployee), employeeController.getEmployee)
  .patch(auth(), validate(employeeValidation.updateEmployee), employeeController.updateEmployee)
  .delete(auth(), validate(employeeValidation.deleteEmployee), employeeController.deleteEmployee);

router
  .route('/department/:departmentId')
  .get(auth(), employeeController.getEmployeesByDepartment);

module.exports = router;
