const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const walletValidation = require('../../validations/wallet.validation');
const walletController = require('../../controllers/wallet.controller');

const router = express.Router();

// Wallets (bank/cash-in-hand) are available to every business type; access is
// gated by subscription plan only, not by business type.
router.use(auth(), branchScope(), checkFeatureAccess('wallet'));

router
  .route('/')
  .post(validate(walletValidation.upsertWallet), walletController.upsertWallet)
  .get(validate(walletValidation.getWallets), walletController.getWallets);

router.route('/:walletId').delete(validate(walletValidation.deleteWallet), walletController.deleteWallet);

module.exports = router;
