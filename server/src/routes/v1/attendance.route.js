const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { attendanceValidation } = require('../../validations');
const { attendanceController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(), checkFeatureAccess('hr_management'));

router
  .route('/')
  .post(auth('createAttendance'), validate(attendanceValidation.createAttendance), attendanceController.createAttendance)
  .get(auth('getAttendance'), validate(attendanceValidation.getAttendances), attendanceController.getAttendances);

router
  .route('/checkin')
  .post(auth('createAttendance'), validate(attendanceValidation.markCheckIn), attendanceController.markCheckIn);

router
  .route('/checkout')
  .post(auth('createAttendance'), validate(attendanceValidation.markCheckOut), attendanceController.markCheckOut);

router
  .route('/bulk')
  .post(auth('manageAttendance'), validate(attendanceValidation.markBulkAttendance), attendanceController.markBulkAttendance);

router
  .route('/daily-summary')
  .get(auth('getAttendance'), validate(attendanceValidation.getDailySummary), attendanceController.getDailySummary);

router
  .route('/employee/:employeeId/daily-breakdown')
  .get(auth('getAttendance'), validate(attendanceValidation.getEmployeeDailyBreakdown), attendanceController.getEmployeeDailyBreakdown);

router
  .route('/employee/:employeeId/stats')
  .get(auth('getAttendance'), validate(attendanceValidation.getEmployeeStats), attendanceController.getEmployeeStats);

router
  .route('/employee/:employeeId')
  .get(auth('getAttendance'), attendanceController.getEmployeeAttendance);

router
  .route('/:attendanceId')
  .get(auth('getAttendance'), validate(attendanceValidation.getAttendance), attendanceController.getAttendance)
  .patch(auth('manageAttendance'), validate(attendanceValidation.updateAttendance), attendanceController.updateAttendance)
  .delete(auth('deleteAttendance'), validate(attendanceValidation.deleteAttendance), attendanceController.deleteAttendance);

module.exports = router;
