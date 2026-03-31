const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const repairJobValidation = require('../../validations/repairJob.validation');
const repairJobController = require('../../controllers/repairJob.controller');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('mobile_shop'));

router
  .route('/')
  .post(validate(repairJobValidation.createRepairJob), repairJobController.createRepairJob)
  .get(validate(repairJobValidation.getRepairJobs), repairJobController.getRepairJobs);

router
  .route('/:repairJobId')
  .patch(validate(repairJobValidation.updateRepairJob), repairJobController.updateRepairJob)
  .delete(validate(repairJobValidation.deleteRepairJob), repairJobController.deleteRepairJob);

module.exports = router;
