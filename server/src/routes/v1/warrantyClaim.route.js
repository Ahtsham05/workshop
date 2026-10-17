const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const v = require('../../validations/warrantyClaim.validation');
const controller = require('../../controllers/warrantyClaim.controller');

const router = express.Router();
router.use(auth(), branchScope());

// The dedicated permissions, or the product / IMEI ones a shop's roles already have.
const VIEW = ['viewWarrantyClaims', 'manageWarrantyClaims', 'viewImeiTracking', 'viewProducts'];
const MANAGE = ['manageWarrantyClaims', 'manageImeiTracking', 'editProducts'];

router.route('/').get(auth(...VIEW), validate(v.queryClaims), controller.queryClaims).post(auth(...MANAGE), validate(v.createClaim), controller.createClaim);
router.route('/stats').get(auth(...VIEW), controller.getStats);
router.route('/lookup').get(auth(...VIEW), validate(v.lookupUnit), controller.lookupUnit);
router.route('/:claimId').get(auth(...VIEW), validate(v.getClaim), controller.getClaim);
router.route('/:claimId/send').post(auth(...MANAGE), validate(v.sendToSupplier), controller.sendToSupplier);
router.route('/:claimId/replacement').post(auth(...MANAGE), validate(v.giveReplacement), controller.giveReplacement);
router.route('/:claimId/receive').post(auth(...MANAGE), validate(v.receiveBack), controller.receiveBack);
router.route('/:claimId/close').post(auth(...MANAGE), validate(v.closeClaim), controller.closeClaim);
router.route('/:claimId/cancel').post(auth(...MANAGE), validate(v.cancelClaim), controller.cancelClaim);

module.exports = router;
