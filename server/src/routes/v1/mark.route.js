const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { markValidation } = require('../../validations');
const { markController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

router
  .route('/')
  .post(auth('manageSchool'), validate(markValidation.createMark), markController.createMark)
  .get(auth('getSchool'), validate(markValidation.getMarks), markController.getMarks);

router
  .route('/bulk')
  .post(auth('manageSchool'), validate(markValidation.createBulkMarks), markController.createBulkMarks);

router
  .route('/exam/:examId')
  .get(auth('getSchool'), validate(markValidation.getMarksByExam), markController.getMarksByExam);

router
  .route('/result/:studentId/:examId')
  .get(auth('getSchool'), validate(markValidation.getStudentResult), markController.getStudentResult);

router
  .route('/:id')
  .get(auth('getSchool'), validate(markValidation.getMark), markController.getMark)
  .patch(auth('manageSchool'), validate(markValidation.updateMark), markController.updateMark)
  .delete(auth('manageSchool'), validate(markValidation.deleteMark), markController.deleteMark);

module.exports = router;
