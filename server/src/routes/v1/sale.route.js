const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const saleValidation = require('../../validations/sale.validation');
const saleController = require('../../controllers/sale.controller');

const router = express.Router();

router
  .route('/')
  .post(auth('manageSales'), validate(saleValidation.createSale), saleController.createSale)
  .get(auth('getSales'), validate(saleValidation.getSales), saleController.getSales);

router
  .route('/date')
  .get(auth('manageSales'), validate(saleValidation.getSaleByDate), saleController.getSaleByDate); 

router
  .route('/invoice-number')
  .get(auth('getSales'), saleController.getInvoiceNumber); // Endpoint to get the next invoice number

router
  .route('/:saleId')
  .get(auth('getSales'), validate(saleValidation.getSale), saleController.getSale)
  .patch(auth('manageSales'), validate(saleValidation.updateSale), saleController.updateSale)
  .delete(auth('manageSales'), validate(saleValidation.deleteSale), saleController.deleteSale);

module.exports = router;
