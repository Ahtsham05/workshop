const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { teacherLeaveValidation } = require('../../validations');
const { teacherLeaveController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'));

router
  .route('/')
  .post(auth('manageSchool'), validate(teacherLeaveValidation.applyLeave), teacherLeaveController.applyLeave)
  .get(auth('getSchool'), validate(teacherLeaveValidation.getLeaves), teacherLeaveController.getLeaves);

router
  .route('/:id')
  .get(auth('getSchool'), validate(teacherLeaveValidation.getLeave), teacherLeaveController.getLeave)
  .delete(auth('manageSchool'), validate(teacherLeaveValidation.deleteLeave), teacherLeaveController.deleteLeave);

router.patch('/:id/approve', auth('manageSchool'), validate(teacherLeaveValidation.approveLeave), teacherLeaveController.approveLeave);
router.patch('/:id/reject', auth('manageSchool'), validate(teacherLeaveValidation.rejectLeave), teacherLeaveController.rejectLeave);
router.patch('/:id/cancel', auth('getSchool'), validate(teacherLeaveValidation.cancelLeave), teacherLeaveController.cancelLeave);

module.exports = router;
