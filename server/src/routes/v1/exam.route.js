const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { examValidation } = require('../../validations');
const { examController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'));

router
  .route('/')
  .post(auth('manageSchool'), validate(examValidation.createExam), examController.createExam)
  .get(auth('getSchool'), validate(examValidation.getExams), examController.getExams);

router
  .route('/bulk-update')
  .post(auth('manageSchool'), validate(examValidation.bulkUpdateExams), examController.bulkUpdateExams);

router
  .route('/bulk-delete')
  .post(auth('manageSchool'), validate(examValidation.bulkDeleteExams), examController.bulkDeleteExams);

router
  .route('/:id')
  .get(auth('getSchool'), validate(examValidation.getExam), examController.getExam)
  .patch(auth('manageSchool'), validate(examValidation.updateExam), examController.updateExam)
  .delete(auth('manageSchool'), validate(examValidation.deleteExam), examController.deleteExam);

module.exports = router;
