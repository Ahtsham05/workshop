const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { schoolClassValidation } = require('../../validations');
const { schoolClassController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

router
  .route('/')
  .post(auth('manageSchool'), validate(schoolClassValidation.createClass), schoolClassController.createClass)
  .get(auth('getSchool'), validate(schoolClassValidation.getClasses), schoolClassController.getClasses);

router
  .route('/:id')
  .get(auth('getSchool'), validate(schoolClassValidation.getClass), schoolClassController.getClass)
  .patch(auth('manageSchool'), validate(schoolClassValidation.updateClass), schoolClassController.updateClass)
  .delete(auth('manageSchool'), validate(schoolClassValidation.deleteClass), schoolClassController.deleteClass);

module.exports = router;
