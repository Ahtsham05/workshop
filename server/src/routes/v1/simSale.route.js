const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const simSaleValidation = require('../../validations/simSale.validation');
const simSaleController = require('../../controllers/simSale.controller');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('mobile_shop'));

router
  .route('/')
  .post(auth('manageSimSales'), validate(simSaleValidation.createSimSale), simSaleController.createSimSale)
  .get(auth('viewSimSales'), validate(simSaleValidation.getSimSales), simSaleController.getSimSales);

router
  .route('/:saleId')
  .get(auth('viewSimSales'), validate(simSaleValidation.getSimSale), simSaleController.getSimSale)
  .patch(auth('manageSimSales'), validate(simSaleValidation.updateSimSale), simSaleController.updateSimSale)
  .delete(auth('manageSimSales'), validate(simSaleValidation.deleteSimSale), simSaleController.deleteSimSale);

module.exports = router;
