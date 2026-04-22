const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { sectionValidation } = require('../../validations');
const { sectionController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'));

router
  .route('/')
  .post(auth('manageSchool'), validate(sectionValidation.createSection), sectionController.createSection)
  .get(auth('getSchool'), validate(sectionValidation.getSections), sectionController.getSections);

router
  .route('/:id')
  .get(auth('getSchool'), validate(sectionValidation.getSection), sectionController.getSection)
  .patch(auth('manageSchool'), validate(sectionValidation.updateSection), sectionController.updateSection)
  .delete(auth('manageSchool'), validate(sectionValidation.deleteSection), sectionController.deleteSection);

module.exports = router;
