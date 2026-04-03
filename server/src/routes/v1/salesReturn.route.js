const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const salesReturnValidation = require('../../validations/salesReturn.validation');
const salesReturnController = require('../../controllers/salesReturn.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('createInvoices'), validate(salesReturnValidation.createSalesReturn), salesReturnController.createSalesReturn)
  .get(auth('viewInvoices'), validate(salesReturnValidation.getSalesReturns), salesReturnController.getSalesReturns);

router
  .route('/:returnId')
  .get(auth('viewInvoices'), validate(salesReturnValidation.getSalesReturn), salesReturnController.getSalesReturn)
  .delete(auth('deleteInvoices'), validate(salesReturnValidation.deleteSalesReturn), salesReturnController.deleteSalesReturn);

router
  .route('/:returnId/status')
  .patch(auth('editInvoices'), validate(salesReturnValidation.updateSalesReturnStatus), salesReturnController.updateSalesReturnStatus);

module.exports = router;
