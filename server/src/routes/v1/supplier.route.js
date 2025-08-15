const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const supplierValidation = require('../../validations/supplier.validation');
const supplierController = require('../../controllers/supplier.controller');

const router = express.Router();

router
  .route('/')
  .post(auth('manageSuppliers'), validate(supplierValidation.createSupplier), supplierController.createSupplier)
  .get(auth('getSuppliers'), validate(supplierValidation.getSuppliers), supplierController.getSuppliers);

router
  .route('/all')
  .get(auth('getSuppliers'), validate(supplierValidation.getAllSuppliers), supplierController.getAllSuppliers);
  
router
  .route('/ledger')
  .get(auth('getLedger'), validate(supplierValidation.getSupplierPurchaseAndTransactions), supplierController.getSupplierPurchaseAndTransactions)
  
router
  .route('/:supplierId')
  .get(auth('getSuppliers'), validate(supplierValidation.getSupplier), supplierController.getSupplier)
  .patch(auth('manageSuppliers'), validate(supplierValidation.updateSupplier), supplierController.updateSupplier)
  .delete(auth('manageSuppliers'), validate(supplierValidation.deleteSupplier), supplierController.deleteSupplier);

module.exports = router;
