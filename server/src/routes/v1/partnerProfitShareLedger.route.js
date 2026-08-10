const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const ledgerValidation = require('../../validations/partnerProfitShareLedger.validation');
const ledgerController = require('../../controllers/partnerProfitShareLedger.controller');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/')
  .get(auth('viewPartnerProfitShareLedger'), validate(ledgerValidation.getLedgerEntries), ledgerController.getLedgerEntries);

router
  .route('/balance')
  .get(auth('viewPartnerProfitShareLedger'), validate(ledgerValidation.getBalance), ledgerController.getBalance);

module.exports = router;
