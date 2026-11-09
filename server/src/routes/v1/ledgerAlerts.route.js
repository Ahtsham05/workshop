const express = require('express');
const { CUSTOMER_PICKERS } = require('../../config/permissionSets');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const ledgerAlertsValidation = require('../../validations/ledgerAlerts.validation');
const ledgerAlertsController = require('../../controllers/ledgerAlerts.controller');

/** Invoice due dates + overdue ledger colours — see services/ledgerAlerts.service.js. */
const router = express.Router();
router.use(auth(), branchScope());

// Everyone who sees customer lists, ledgers or customer reports sees the colours, and the
// invoice screen reads the due-date defaults — so reading is as wide as picking a customer.
const ALERT_READERS = [
  ...CUSTOMER_PICKERS,
  'viewReports',
  'viewCustomerReports',
  'viewSettings',
  'editSettings',
  'manageBusinessProfile',
];
const SETTINGS_EDITORS = ['editSettings', 'manageBusinessProfile'];

router
  .route('/settings')
  .get(auth(...ALERT_READERS), validate(ledgerAlertsValidation.getSettings), ledgerAlertsController.getSettings)
  .patch(auth(...SETTINGS_EDITORS), validate(ledgerAlertsValidation.updateSettings), ledgerAlertsController.updateSettings);

router
  .route('/status')
  .get(auth(...ALERT_READERS), validate(ledgerAlertsValidation.getStatusBoard), ledgerAlertsController.getStatusBoard);

router
  .route('/customers/:customerId')
  .get(auth(...ALERT_READERS), validate(ledgerAlertsValidation.getCustomerAging), ledgerAlertsController.getCustomerAging);

module.exports = router;
