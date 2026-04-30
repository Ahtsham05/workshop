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
  .post(validate(serviceValidation.createService), serviceController.createService)
  .get(validate(serviceValidation.getServices), serviceController.getServices);

router
  .route('/:serviceId')
  .patch(validate(serviceValidation.updateService), serviceController.updateService)
  .delete(validate(serviceValidation.deleteService), serviceController.deleteService);

router
  .route('/invoices')
  .post(validate(serviceValidation.createServiceInvoice), serviceController.createServiceInvoice)
  .get(validate(serviceValidation.getServiceInvoices), serviceController.getServiceInvoices);

router
  .route('/invoices/:invoiceId')
  .patch(validate(serviceValidation.updateServiceInvoice), serviceController.updateServiceInvoice)
  .delete(validate(serviceValidation.deleteServiceInvoice), serviceController.deleteServiceInvoice);

module.exports = router;
