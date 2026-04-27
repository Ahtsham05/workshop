const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const expenseCategoryController = require('../../controllers/expenseCategory.controller');

const router = express.Router();
router.use(auth(), branchScope());

router.route('/')
  .get(expenseCategoryController.getCategories)
  .post(expenseCategoryController.createCategory);

router.route('/:id')
  .patch(expenseCategoryController.updateCategory)
  .delete(expenseCategoryController.deleteCategory);

module.exports = router;
