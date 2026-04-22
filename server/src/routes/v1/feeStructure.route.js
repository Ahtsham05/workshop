const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { feeStructureValidation } = require('../../validations');
const { feeStructureController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'));

router
  .route('/')
  .post(validate(feeStructureValidation.createFeeStructure), feeStructureController.createFeeStructure)
  .get(validate(feeStructureValidation.getFeeStructures), feeStructureController.getFeeStructures);

router
  .route('/class/:classId')
  .get(validate(feeStructureValidation.getFeeStructureByClass), feeStructureController.getFeeStructureByClass);

router
  .route('/:structureId')
  .get(validate(feeStructureValidation.getFeeStructure), feeStructureController.getFeeStructure)
  .patch(validate(feeStructureValidation.updateFeeStructure), feeStructureController.updateFeeStructure)
  .delete(validate(feeStructureValidation.deleteFeeStructure), feeStructureController.deleteFeeStructure);

module.exports = router;
