const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const { departmentValidation } = require('../../validations');
const { departmentController } = require('../../controllers');

const router = express.Router();

router
  .route('/')
  .post(auth(), validate(departmentValidation.createDepartment), departmentController.createDepartment)
  .get(auth(), validate(departmentValidation.getDepartments), departmentController.getDepartments);

router
  .route('/:departmentId')
  .get(auth(), validate(departmentValidation.getDepartment), departmentController.getDepartment)
  .patch(auth(), validate(departmentValidation.updateDepartment), departmentController.updateDepartment)
  .delete(auth(), validate(departmentValidation.deleteDepartment), departmentController.deleteDepartment);

module.exports = router;
