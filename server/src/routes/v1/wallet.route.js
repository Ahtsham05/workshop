const express = require('express');
const { WALLET_READERS } = require('../../config/permissionSets');
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
  .post(auth('manageWallet'), validate(walletValidation.upsertWallet), walletController.upsertWallet)
  // Every screen that takes or pays money lists the accounts — see config/permissionSets.
  .get(auth(...WALLET_READERS), validate(walletValidation.getWallets), walletController.getWallets);

router
  .route('/:walletId')
  .delete(auth('manageWallet'), validate(walletValidation.deleteWallet), walletController.deleteWallet);

module.exports = router;
