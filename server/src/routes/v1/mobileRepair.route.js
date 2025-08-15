const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const mobileRepairValidation = require('../../validations/mobileRepair.validation');
const mobileRepairController = require('../../controllers/mobileRepair.controller');

const router = express.Router();

router
  .route('/')
  .post(auth('manageMobileRepairs'), validate(mobileRepairValidation.createMobileRepair), mobileRepairController.createMobileRepair)
  .get(auth('getMobileRepairs'), validate(mobileRepairValidation.getMobileRepairs), mobileRepairController.getMobileRepairs);

router
  .route('/:repairId')
  .get(auth('getMobileRepairs'), validate(mobileRepairValidation.getMobileRepair), mobileRepairController.getMobileRepair)
  .patch(auth('manageMobileRepairs'), validate(mobileRepairValidation.updateMobileRepair), mobileRepairController.updateMobileRepair)
  .delete(auth('manageMobileRepairs'), validate(mobileRepairValidation.deleteMobileRepair), mobileRepairController.deleteMobileRepair);

module.exports = router;
