const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const walletTransferValidation = require('../../validations/walletTransfer.validation');
const walletTransferController = require('../../controllers/walletTransfer.controller');

const router = express.Router();

// Wallet transfers move money between a Wallet and "My Account" (PersonalLedger) — both
// available to every business type, so gated the same way as /wallets: by subscription
// plan only, not by business type.
router.use(auth(), branchScope(), checkFeatureAccess('wallet'));

router
  .route('/')
  .post(validate(walletTransferValidation.createWalletTransfer), walletTransferController.createWalletTransfer)
  .get(validate(walletTransferValidation.getWalletTransfers), walletTransferController.getWalletTransfers);

router
  .route('/:transferId')
  .get(validate(walletTransferValidation.getWalletTransfer), walletTransferController.getWalletTransfer)
  .delete(validate(walletTransferValidation.deleteWalletTransfer), walletTransferController.deleteWalletTransfer);

module.exports = router;
