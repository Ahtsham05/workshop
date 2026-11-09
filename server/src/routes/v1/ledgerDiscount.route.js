const express = require('express');
const { CUSTOMER_PICKERS, SUPPLIER_PICKERS } = require('../../config/permissionSets');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const ledgerDiscountValidation = require('../../validations/ledgerDiscount.validation');
const ledgerDiscountController = require('../../controllers/ledgerDiscount.controller');

/** Ledger discounts (Discount Allowed / Received) — see services/ledgerDiscount.service.js. */
const router = express.Router();
router.use(auth(), branchScope());

// The ledger forms read the rules (limits, quick %), so reading is as wide as the ledgers.
const RULE_READERS = [
  ...new Set([
    ...CUSTOMER_PICKERS,
    ...SUPPLIER_PICKERS,
    'giveLedgerDiscount',
    'manageLedgers',
    'viewAccounting',
    'viewSettings',
    'editSettings',
    'manageBusinessProfile',
  ]),
];
const SETTINGS_EDITORS = ['editSettings', 'manageBusinessProfile'];
const REGISTER_READERS = [
  'viewReports',
  'viewCustomerReports',
  'viewSupplierReports',
  'viewProfitLossReports',
  'viewAccounting',
  'manageLedgers',
];

router
  .route('/settings')
  .get(auth(...RULE_READERS), validate(ledgerDiscountValidation.getSettings), ledgerDiscountController.getSettings)
  .patch(
    auth(...SETTINGS_EDITORS),
    validate(ledgerDiscountValidation.updateSettings),
    ledgerDiscountController.updateSettings
  );

router
  .route('/register')
  .get(auth(...REGISTER_READERS), validate(ledgerDiscountValidation.getRegister), ledgerDiscountController.getRegister);

module.exports = router;
