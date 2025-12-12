const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const { attendanceValidation } = require('../../validations');
const { attendanceController } = require('../../controllers');

const router = express.Router();

router
  .route('/')
  .post(auth(), validate(attendanceValidation.createAttendance), attendanceController.createAttendance)
  .get(auth(), validate(attendanceValidation.getAttendances), attendanceController.getAttendances);

router
  .route('/checkin')
  .post(auth(), validate(attendanceValidation.markCheckIn), attendanceController.markCheckIn);

router
  .route('/checkout')
  .post(auth(), validate(attendanceValidation.markCheckOut), attendanceController.markCheckOut);

router
  .route('/employee/:employeeId')
  .get(auth(), attendanceController.getEmployeeAttendance);

router
  .route('/:attendanceId')
  .get(auth(), validate(attendanceValidation.getAttendance), attendanceController.getAttendance)
  .patch(auth(), validate(attendanceValidation.updateAttendance), attendanceController.updateAttendance)
  .delete(auth(), validate(attendanceValidation.deleteAttendance), attendanceController.deleteAttendance);

module.exports = router;
