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
router.get('/stats', imeiController.getStats);

router.route('/').get(validate(imeiValidation.getImeis), imeiController.getImeis);

router
  .route('/:imeiId')
  .get(validate(imeiValidation.getImei), imeiController.getImei)
  .patch(validate(imeiValidation.updateImei), imeiController.updateImei)
  .delete(validate(imeiValidation.deleteImei), imeiController.deleteImei);

router.patch(
  '/:imeiId/lost-stolen',
  validate(imeiValidation.markLostOrStolen),
  imeiController.markLostOrStolen,
);

module.exports = router;
