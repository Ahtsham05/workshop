const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { teacherPayrollValidation } = require('../../validations');
const { teacherPayrollController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

router
  .route('/')
  .post(auth('manageSchool'), validate(teacherPayrollValidation.generatePayroll), teacherPayrollController.generatePayroll)
  .get(auth('getSchool'), validate(teacherPayrollValidation.getPayrolls), teacherPayrollController.getPayrolls);

router.patch('/:id/pay', auth('manageSchool'), validate(teacherPayrollValidation.markAsPaid), teacherPayrollController.markAsPaid);

router
  .route('/:id')
  .get(auth('getSchool'), validate(teacherPayrollValidation.getPayroll), teacherPayrollController.getPayroll)
  .patch(auth('manageSchool'), validate(teacherPayrollValidation.updatePayroll), teacherPayrollController.updatePayroll)
  .delete(auth('manageSchool'), validate(teacherPayrollValidation.deletePayroll), teacherPayrollController.deletePayroll);

module.exports = router;
