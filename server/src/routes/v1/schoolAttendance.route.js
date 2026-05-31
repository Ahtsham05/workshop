const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { schoolAttendanceValidation } = require('../../validations');
const { schoolAttendanceController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

router
  .route('/scan')
  .post(auth('manageSchool'), validate(schoolAttendanceValidation.scanAttendance), schoolAttendanceController.scanAttendance);

router
  .route('/')
  .post(auth('manageSchool'), validate(schoolAttendanceValidation.createAttendance), schoolAttendanceController.createAttendance)
  .get(auth('getSchool'), validate(schoolAttendanceValidation.getAttendances), schoolAttendanceController.getAttendances);

router
  .route('/bulk')
  .post(auth('manageSchool'), validate(schoolAttendanceValidation.markBulkAttendance), schoolAttendanceController.markBulkAttendance);

router
  .route('/class/:classId')
  .get(auth('getSchool'), validate(schoolAttendanceValidation.getAttendanceByClass), schoolAttendanceController.getAttendanceByClass);

router
  .route('/:id')
  .get(auth('getSchool'), validate(schoolAttendanceValidation.getAttendance), schoolAttendanceController.getAttendance)
  .patch(auth('manageSchool'), validate(schoolAttendanceValidation.updateAttendance), schoolAttendanceController.updateAttendance)
  .delete(auth('manageSchool'), validate(schoolAttendanceValidation.deleteAttendance), schoolAttendanceController.deleteAttendance);

module.exports = router;
