const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { employeeValidation } = require('../../validations');
const { employeeController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(true), checkFeatureAccess('hr_management'));

router
  .route('/')
  .post(auth('createEmployees'), validate(employeeValidation.createEmployee), employeeController.createEmployee)
  .get(auth('getEmployees'), validate(employeeValidation.getEmployees), employeeController.getEmployees);

router
  .route('/:employeeId')
  .get(auth('getEmployees'), validate(employeeValidation.getEmployee), employeeController.getEmployee)
  .patch(auth('manageEmployees'), validate(employeeValidation.updateEmployee), employeeController.updateEmployee)
  .delete(auth('deleteEmployees'), validate(employeeValidation.deleteEmployee), employeeController.deleteEmployee);

router
  .route('/department/:departmentId')
  .get(auth('getEmployees'), employeeController.getEmployeesByDepartment);

module.exports = router;
