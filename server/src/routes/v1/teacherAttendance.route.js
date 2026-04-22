const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { teacherAttendanceValidation } = require('../../validations');
const { teacherAttendanceController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'));

router.get('/today-stats', teacherAttendanceController.getTodayStats);

router
  .route('/')
  .post(auth('manageSchool'), validate(teacherAttendanceValidation.markAttendance), teacherAttendanceController.markAttendance)
  .get(auth('getSchool'), validate(teacherAttendanceValidation.getAttendances), teacherAttendanceController.getAttendances);

router
  .route('/bulk')
  .post(auth('manageSchool'), validate(teacherAttendanceValidation.markBulkAttendance), teacherAttendanceController.markBulkAttendance);

router
  .route('/:id')
  .get(auth('getSchool'), validate(teacherAttendanceValidation.getAttendance), teacherAttendanceController.getAttendance)
  .patch(auth('manageSchool'), validate(teacherAttendanceValidation.updateAttendance), teacherAttendanceController.updateAttendance)
  .delete(auth('manageSchool'), validate(teacherAttendanceValidation.deleteAttendance), teacherAttendanceController.deleteAttendance);

module.exports = router;
