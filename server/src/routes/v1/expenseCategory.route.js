const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const expenseCategoryController = require('../../controllers/expenseCategory.controller');

const router = express.Router();
router.use(auth(), branchScope());

router.route('/')
  .get(auth('viewAccounting', 'manageExpenses', 'viewPayments', 'createPayments', 'managePersonalWallet'), expenseCategoryController.getCategories)
  .post(auth('manageExpenses'), expenseCategoryController.createCategory);

router.route('/:id')
  .patch(auth('manageExpenses'), expenseCategoryController.updateCategory)
  .delete(auth('manageExpenses'), expenseCategoryController.deleteCategory);

module.exports = router;
