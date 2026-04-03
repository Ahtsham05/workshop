const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { leaveValidation } = require('../../validations');
const { leaveController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(), checkFeatureAccess('hr_management'));

router
  .route('/')
  .post(auth('createLeaves'), validate(leaveValidation.createLeave), leaveController.createLeave)
  .get(auth('getLeaves'), validate(leaveValidation.getLeaves), leaveController.getLeaves);

router
  .route('/:leaveId/approve')
  .patch(auth('approveLeaves'), validate(leaveValidation.approveLeave), leaveController.approveLeave);

router
  .route('/:leaveId/reject')
  .patch(auth('rejectLeaves'), validate(leaveValidation.rejectLeave), leaveController.rejectLeave);

router
  .route('/:leaveId/cancel')
  .patch(auth('manageLeaves'), leaveController.cancelLeave);

router
  .route('/employee/:employeeId')
  .get(auth('getLeaves'), leaveController.getEmployeeLeaves);

router
  .route('/employee/:employeeId/balance/:leaveType')
  .get(auth('getLeaves'), leaveController.getLeaveBalance);

router
  .route('/:leaveId')
  .get(auth('getLeaves'), validate(leaveValidation.getLeave), leaveController.getLeave)
  .patch(auth('manageLeaves'), validate(leaveValidation.updateLeave), leaveController.updateLeave)
  .delete(auth('deleteLeaves'), validate(leaveValidation.deleteLeave), leaveController.deleteLeave);

module.exports = router;
