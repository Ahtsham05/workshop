const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const repairJobValidation = require('../../validations/repairJob.validation');
const repairJobController = require('../../controllers/repairJob.controller');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('mobile_shop'), checkFeatureAccess('repair'));

router
  .route('/')
  .post(auth('manageRepairs'), validate(repairJobValidation.createRepairJob), repairJobController.createRepairJob)
  .get(auth('viewRepairs'), validate(repairJobValidation.getRepairJobs), repairJobController.getRepairJobs);

router
  .route('/:repairJobId')
  .patch(auth('manageRepairs'), validate(repairJobValidation.updateRepairJob), repairJobController.updateRepairJob)
  .delete(auth('manageRepairs'), validate(repairJobValidation.deleteRepairJob), repairJobController.deleteRepairJob);

module.exports = router;
