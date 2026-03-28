const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const { departmentValidation } = require('../../validations');
const { departmentController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('createDepartments'), validate(departmentValidation.createDepartment), departmentController.createDepartment)
  .get(auth('getDepartments'), validate(departmentValidation.getDepartments), departmentController.getDepartments);

router
  .route('/:departmentId')
  .get(auth('getDepartments'), validate(departmentValidation.getDepartment), departmentController.getDepartment)
  .patch(auth('manageDepartments'), validate(departmentValidation.updateDepartment), departmentController.updateDepartment)
  .delete(auth('deleteDepartments'), validate(departmentValidation.deleteDepartment), departmentController.deleteDepartment);

module.exports = router;
