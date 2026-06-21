const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const imeiValidation = require('../../validations/imei.validation');
const imeiController = require('../../controllers/imei.controller');

const router = express.Router();

router.use(auth(), branchScope());

router.get('/available', validate(imeiValidation.getAvailableImeis), imeiController.getAvailableImeis);
router.get('/opening-stock', validate(imeiValidation.getOpeningStockImeis), imeiController.getOpeningStockImeis);

router.route('/').get(validate(imeiValidation.getImeis), imeiController.getImeis);

router
  .route('/:imeiId')
  .patch(validate(imeiValidation.updateImei), imeiController.updateImei)
  .delete(validate(imeiValidation.deleteImei), imeiController.deleteImei);

module.exports = router;
