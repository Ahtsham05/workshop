const express = require('express');
const { SERIAL_PICKERS } = require('../../config/permissionSets');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const imeiValidation = require('../../validations/imei.validation');
const imeiController = require('../../controllers/imei.controller');

const router = express.Router();

router.use(auth(), branchScope());

router.get('/available', auth(...SERIAL_PICKERS), validate(imeiValidation.getAvailableImeis), imeiController.getAvailableImeis);
router.get('/opening-stock', auth('viewProducts', 'createProducts', 'editProducts', 'viewImeiTracking'), validate(imeiValidation.getOpeningStockImeis), imeiController.getOpeningStockImeis);
router.get('/in-stock', auth('viewProducts', 'createProducts', 'editProducts', 'viewImeiTracking'), validate(imeiValidation.getInStockImeis), imeiController.getInStockImeis);
router.get('/stats', auth('viewImeiTracking', 'viewNewPhones', 'viewReports', 'viewMobilePhoneReports'), imeiController.getStats);

router.route('/').get(auth('viewImeiTracking', 'viewNewPhones', 'viewReports', 'viewMobilePhoneReports'), validate(imeiValidation.getImeis), imeiController.getImeis);

router
  .route('/:imeiId')
  .get(auth('viewImeiTracking', 'viewNewPhones', 'viewProducts'), validate(imeiValidation.getImei), imeiController.getImei)
  .patch(auth('manageImeiTracking'), validate(imeiValidation.updateImei), imeiController.updateImei)
  .delete(auth('manageImeiTracking'), validate(imeiValidation.deleteImei), imeiController.deleteImei);

router.patch(
  '/:imeiId/lost-stolen',
  auth('manageImeiTracking'),
  validate(imeiValidation.markLostOrStolen),
  imeiController.markLostOrStolen,
);

module.exports = router;
