const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { visitorValidation } = require('../../validations');
const { visitorController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'));

router.get('/stats', auth('getSchool'), visitorController.getDashboardStats);
router.get('/check-duplicate', auth('getSchool'), visitorController.checkDuplicate);

router
  .route('/')
  .post(auth('manageSchool'), validate(visitorValidation.createVisitor), visitorController.createVisitor)
  .get(auth('getSchool'), validate(visitorValidation.getVisitors), visitorController.getVisitors);

router
  .route('/:id')
  .get(auth('getSchool'), validate(visitorValidation.getVisitor), visitorController.getVisitor)
  .patch(auth('manageSchool'), validate(visitorValidation.updateVisitor), visitorController.updateVisitor)
  .delete(auth('manageSchool'), validate(visitorValidation.deleteVisitor), visitorController.deleteVisitor);

router
  .route('/:id/follow-up')
  .post(auth('manageSchool'), validate(visitorValidation.addFollowUp), visitorController.addFollowUp);

module.exports = router;
