const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const customerValidation = require('../../validations/customer.validation');
const customerController = require('../../controllers/customer.controller');
const { upload } = require('../../middlewares/upload');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/upload-image')
  .post(auth('createCustomers'), upload.single('image'), customerController.uploadCustomerImage);

router
  .route('/scan-image')
  .post(auth('createCustomers'), upload.single('image'), customerController.scanCustomerImage);

router
  .route('/')
  .post(auth('createCustomers'), validate(customerValidation.createCustomer), customerController.createCustomer)
  .get(auth('viewCustomers'), validate(customerValidation.getCustomers), customerController.getCustomers);

router
  .route('/all')
  .get(auth('viewCustomers'), customerController.getAllCustomers);

router
  .route('/stats')
  .get(auth('viewCustomers'), customerController.getCustomerStats);

// Bulk add (import) route
router
  .route('/bulk')
  .post(auth('createCustomers'), validate(customerValidation.bulkAddCustomers), customerController.bulkAddCustomers);

// Bulk update route (Activate/Deactivate selected)
router
  .route('/bulk-update')
  .patch(auth('editCustomers'), validate(customerValidation.bulkUpdateCustomers), customerController.bulkUpdateCustomers);

// Bulk delete route — registered before the `/:customerId` catch-all below so
// `/bulk-delete` isn't swallowed as a customerId.
router
  .route('/bulk-delete')
  .delete(auth('deleteCustomers'), validate(customerValidation.bulkDeleteCustomers), customerController.bulkDeleteCustomers);

router
  .route('/:customerId')
  .get(auth('viewCustomers'), validate(customerValidation.getCustomer), customerController.getCustomer)
  .patch(auth('editCustomers'), validate(customerValidation.updateCustomer), customerController.updateCustomer)
  .delete(auth('deleteCustomers'), validate(customerValidation.deleteCustomer), customerController.deleteCustomer);

module.exports = router;
