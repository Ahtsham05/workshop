const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { teacherValidation } = require('../../validations');
const { teacherController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

router
  .route('/')
  .post(auth('manageSchool'), validate(teacherValidation.createTeacher), teacherController.createTeacher)
  .get(auth('getSchool'), validate(teacherValidation.getTeachers), teacherController.getTeachers);

router
  .route('/:id')
  .get(auth('getSchool'), validate(teacherValidation.getTeacher), teacherController.getTeacher)
  .patch(auth('manageSchool'), validate(teacherValidation.updateTeacher), teacherController.updateTeacher)
  .delete(auth('manageSchool'), validate(teacherValidation.deleteTeacher), teacherController.deleteTeacher);

module.exports = router;
