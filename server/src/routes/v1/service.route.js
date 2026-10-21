const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const serviceValidation = require('../../validations/service.validation');
const serviceController = require('../../controllers/service.controller');

const router = express.Router();

router.use(auth(), branchScope());

router
  .route('/')
  .post(auth('manageServices'), validate(serviceValidation.createService), serviceController.createService)
  .get(auth('viewServices'), validate(serviceValidation.getServices), serviceController.getServices);

router
  .route('/:serviceId')
  .patch(auth('manageServices'), validate(serviceValidation.updateService), serviceController.updateService)
  .delete(auth('manageServices'), validate(serviceValidation.deleteService), serviceController.deleteService);

router
  .route('/invoices')
  .post(auth('manageServices'), validate(serviceValidation.createServiceInvoice), serviceController.createServiceInvoice)
  .get(auth('viewServices'), validate(serviceValidation.getServiceInvoices), serviceController.getServiceInvoices);

router
  .route('/invoices/:invoiceId')
  .patch(auth('manageServices'), validate(serviceValidation.updateServiceInvoice), serviceController.updateServiceInvoice)
  .delete(auth('manageServices'), validate(serviceValidation.deleteServiceInvoice), serviceController.deleteServiceInvoice);

module.exports = router;
