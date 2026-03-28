const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const supplierValidation = require('../../validations/supplier.validation');
const supplierController = require('../../controllers/supplier.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('createSuppliers'), validate(supplierValidation.createSupplier), supplierController.createSupplier)
  .get(auth('viewSuppliers'), validate(supplierValidation.getSuppliers), supplierController.getSuppliers);

router
  .route('/all')
  .get(auth('viewSuppliers'), validate(supplierValidation.getAllSuppliers), supplierController.getAllSuppliers);

// Bulk add (import) route
router
  .route('/bulk')
  .post(auth('createSuppliers'), validate(supplierValidation.bulkAddSuppliers), supplierController.bulkAddSuppliers);
  
router
  .route('/:supplierId')
  .get(auth('viewSuppliers'), validate(supplierValidation.getSupplier), supplierController.getSupplier)
  .patch(auth('editSuppliers'), validate(supplierValidation.updateSupplier), supplierController.updateSupplier)
  .delete(auth('deleteSuppliers'), validate(supplierValidation.deleteSupplier), supplierController.deleteSupplier);

module.exports = router;
