const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolRole } = require('../../middlewares/schoolAccess');
const { diaryValidation } = require('../../validations');
const { diaryController } = require('../../controllers');

const router = express.Router();
// Daily Diary management is for school admins and teachers.
router.use(
  auth(),
  branchScope(false),
  checkFeatureAccess('school_management'),
  requireSchoolRole('schoolAdmin', 'teacher'),
);

router
  .route('/')
  .post(validate(diaryValidation.createDiary), diaryController.createDiary)
  .get(validate(diaryValidation.getDiaries), diaryController.getDiaries);

router
  .route('/:id')
  .get(validate(diaryValidation.getDiary), diaryController.getDiary)
  .patch(validate(diaryValidation.updateDiary), diaryController.updateDiary)
  .delete(validate(diaryValidation.deleteDiary), diaryController.deleteDiary);

module.exports = router;
