const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { teacherAssignmentValidation } = require('../../validations');
const { teacherAssignmentController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(true), checkFeatureAccess('school_management'), requireSchoolAdmin());

// Class overview — aggregate endpoint
router.get('/class-overview', auth('getSchool'), teacherAssignmentController.getClassOverview);

// Assignments for a specific teacher
router.get(
  '/teacher/:teacherId',
  auth('getSchool'),
  validate(teacherAssignmentValidation.getTeacherAssignments),
  teacherAssignmentController.getTeacherAssignments
);

router
  .route('/')
  .post(
    auth('manageSchool'),
    validate(teacherAssignmentValidation.createAssignment),
    teacherAssignmentController.createAssignment
  )
  .get(
    auth('getSchool'),
    validate(teacherAssignmentValidation.getAssignments),
    teacherAssignmentController.getAssignments
  );

router
  .route('/:id')
  .get(
    auth('getSchool'),
    validate(teacherAssignmentValidation.getAssignment),
    teacherAssignmentController.getAssignment
  )
  .delete(
    auth('manageSchool'),
    validate(teacherAssignmentValidation.deleteAssignment),
    teacherAssignmentController.deleteAssignment
  );

module.exports = router;
