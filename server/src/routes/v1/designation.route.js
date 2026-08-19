const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { designationValidation } = require('../../validations');
const { designationController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(), checkFeatureAccess('hr_management'));

router
  .route('/')
  .post(
    auth('createDesignations'),
    validate(designationValidation.createDesignation),
    designationController.createDesignation
  )
  .get(auth('getDesignations'), validate(designationValidation.getDesignations), designationController.getDesignations);

router
  .route('/:designationId')
  .get(auth('getDesignations'), validate(designationValidation.getDesignation), designationController.getDesignation)
  .patch(
    auth('manageDesignations'),
    validate(designationValidation.updateDesignation),
    designationController.updateDesignation
  )
  .delete(
    auth('deleteDesignations'),
    validate(designationValidation.deleteDesignation),
    designationController.deleteDesignation
  );

module.exports = router;
