const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { timeSlotValidation } = require('../../validations');
const { timeSlotController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'));

// Bulk seed — must come before /:id to avoid route ambiguity
router
  .route('/bulk')
  .post(auth('manageSchool'), validate(timeSlotValidation.bulkCreateTimeSlots), timeSlotController.bulkCreateTimeSlots);

// Active slots list — used by timetable grid and auto-generation
router
  .route('/active')
  .get(auth('getSchool'), timeSlotController.getActiveTimeSlots);

router
  .route('/')
  .post(auth('manageSchool'), validate(timeSlotValidation.createTimeSlot), timeSlotController.createTimeSlot)
  .get(auth('getSchool'), validate(timeSlotValidation.getTimeSlots), timeSlotController.getTimeSlots);

router
  .route('/:id')
  .get(auth('getSchool'), validate(timeSlotValidation.getTimeSlot), timeSlotController.getTimeSlot)
  .patch(auth('manageSchool'), validate(timeSlotValidation.updateTimeSlot), timeSlotController.updateTimeSlot)
  .delete(auth('manageSchool'), validate(timeSlotValidation.deleteTimeSlot), timeSlotController.deleteTimeSlot);

module.exports = router;
