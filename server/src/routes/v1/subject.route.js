const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { subjectValidation } = require('../../validations');
const { subjectController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

router
  .route('/')
  .post(auth('manageSchool'), validate(subjectValidation.createSubject), subjectController.createSubject)
  .get(auth('getSchool'), validate(subjectValidation.getSubjects), subjectController.getSubjects);

router
  .route('/:id')
  .get(auth('getSchool'), validate(subjectValidation.getSubject), subjectController.getSubject)
  .patch(auth('manageSchool'), validate(subjectValidation.updateSubject), subjectController.updateSubject)
  .delete(auth('manageSchool'), validate(subjectValidation.deleteSubject), subjectController.deleteSubject);

module.exports = router;
