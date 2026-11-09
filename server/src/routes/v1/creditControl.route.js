const express = require('express');
const { CUSTOMER_PICKERS } = require('../../config/permissionSets');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const creditControlValidation = require('../../validations/creditControl.validation');
const creditControlController = require('../../controllers/creditControl.controller');

/** Customer credit control — see services/creditControl.service.js. */
const router = express.Router();
router.use(auth(), branchScope());

const CREDIT_READERS = ['viewCustomers', 'manageCreditLimits', 'viewCustomerReports', 'viewAccounting'];

router
  .route('/settings')
  .get(auth('manageCreditLimits'), validate(creditControlValidation.getSettings), creditControlController.getSettings)
  .patch(auth('manageCreditLimits'), validate(creditControlValidation.updateSettings), creditControlController.updateSettings);

router
  .route('/overview')
  .get(auth(...CREDIT_READERS), validate(creditControlValidation.getOverview), creditControlController.getOverview);

router
  .route('/overrides')
  .get(auth(...CREDIT_READERS), validate(creditControlValidation.getOverrides), creditControlController.getOverrides);

router
  .route('/bulk')
  .post(auth('manageCreditLimits'), validate(creditControlValidation.bulkUpdate), creditControlController.bulkUpdate);

router
  .route('/overdue-customers')
  .get(auth(...CREDIT_READERS), validate(creditControlValidation.getOverdueCustomers), creditControlController.getOverdueCustomers);

// Customer list Excel export (same columns as the import, plus live credit figures).
router
  .route('/export')
  .get(auth('viewCustomers'), validate(creditControlValidation.exportCustomers), creditControlController.exportCustomers);

// The invoice screen reads this for whichever customer is picked, so every role that can
// pick a customer may read it.
router
  .route('/customers/:customerId/status')
  .get(auth(...CUSTOMER_PICKERS), validate(creditControlValidation.getStatus), creditControlController.getStatus);

router
  .route('/customers/:customerId/limit')
  .post(auth('manageCreditLimits'), validate(creditControlValidation.changeLimit), creditControlController.changeLimit);

router
  .route('/customers/:customerId/temporary-limit/clear')
  .post(auth('manageCreditLimits'), validate(creditControlValidation.clearTemporary), creditControlController.clearTemporary);

router
  .route('/customers/:customerId/hold')
  .post(auth('manageCreditLimits'), validate(creditControlValidation.setHold), creditControlController.setHold);

router
  .route('/customers/:customerId/history')
  .get(auth(...CREDIT_READERS), validate(creditControlValidation.getHistory), creditControlController.getHistory);

module.exports = router;
