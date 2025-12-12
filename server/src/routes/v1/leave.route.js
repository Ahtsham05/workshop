const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const { leaveValidation } = require('../../validations');
const { leaveController } = require('../../controllers');

const router = express.Router();

router
  .route('/')
  .post(auth(), validate(leaveValidation.createLeave), leaveController.createLeave)
  .get(auth(), validate(leaveValidation.getLeaves), leaveController.getLeaves);

router
  .route('/:leaveId/approve')
  .patch(auth(), validate(leaveValidation.approveLeave), leaveController.approveLeave);

router
  .route('/:leaveId/reject')
  .patch(auth(), validate(leaveValidation.rejectLeave), leaveController.rejectLeave);

router
  .route('/:leaveId/cancel')
  .patch(auth(), leaveController.cancelLeave);

router
  .route('/employee/:employeeId')
  .get(auth(), leaveController.getEmployeeLeaves);

router
  .route('/employee/:employeeId/balance/:leaveType')
  .get(auth(), leaveController.getLeaveBalance);

router
  .route('/:leaveId')
  .get(auth(), validate(leaveValidation.getLeave), leaveController.getLeave)
  .patch(auth(), validate(leaveValidation.updateLeave), leaveController.updateLeave)
  .delete(auth(), validate(leaveValidation.deleteLeave), leaveController.deleteLeave);

module.exports = router;
