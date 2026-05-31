const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { schoolFeeValidation } = require('../../validations');
const { schoolFeeController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

router
  .route('/')
  .post(auth('manageSchool'), validate(schoolFeeValidation.createFee), schoolFeeController.createFee)
  .get(auth('getSchool'), validate(schoolFeeValidation.getFees), schoolFeeController.getFees);

router
  .route('/bulk')
  .post(auth('manageSchool'), validate(schoolFeeValidation.createBulkFees), schoolFeeController.createBulkFees);

router
  .route('/overdue')
  .get(auth('getSchool'), schoolFeeController.getOverdueFees);

router
  .route('/student/:studentId')
  .get(auth('getSchool'), validate(schoolFeeValidation.getStudentFees), schoolFeeController.getStudentFees);

router
  .route('/:id')
  .get(auth('getSchool'), validate(schoolFeeValidation.getFee), schoolFeeController.getFee)
  .patch(auth('manageSchool'), validate(schoolFeeValidation.updateFee), schoolFeeController.updateFee)
  .delete(auth('manageSchool'), validate(schoolFeeValidation.deleteFee), schoolFeeController.deleteFee);

router
  .route('/:id/pay')
  .post(auth('manageSchool'), validate(schoolFeeValidation.payFee), schoolFeeController.payFee);

module.exports = router;
