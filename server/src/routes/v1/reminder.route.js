const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const reminderValidation = require('../../validations/reminder.validation');
const reminderController = require('../../controllers/reminder.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('createReminders'), validate(reminderValidation.createReminder), reminderController.createReminder)
  .get(auth('viewReminders'), validate(reminderValidation.getReminders), reminderController.getReminders);

router
  .route('/:id')
  .get(auth('viewReminders'), validate(reminderValidation.getReminder), reminderController.getReminder)
  .patch(auth('editReminders'), validate(reminderValidation.updateReminder), reminderController.updateReminder)
  .delete(auth('deleteReminders'), validate(reminderValidation.deleteReminder), reminderController.deleteReminder);

router
  .route('/:id/complete')
  .post(auth('editReminders'), validate(reminderValidation.getReminder), reminderController.completeReminder);

router
  .route('/:id/snooze')
  .post(auth('editReminders'), validate(reminderValidation.snoozeReminder), reminderController.snoozeReminder);

module.exports = router;
