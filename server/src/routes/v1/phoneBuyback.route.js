const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const phoneBuybackValidation = require('../../validations/phoneBuyback.validation');
const phoneBuybackController = require('../../controllers/phoneBuyback.controller');
const { upload } = require('../../middlewares/upload');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('mobile_shop'), checkFeatureAccess('used_phones'));

router.get('/stats', auth('viewUsedPhones'), validate(phoneBuybackValidation.getStats), phoneBuybackController.getStats);

router
  .route('/upload-image')
  .post(auth('buyUsedPhones'), upload.single('image'), phoneBuybackController.uploadBuybackImage);

router
  .route('/')
  .post(auth('buyUsedPhones'), validate(phoneBuybackValidation.createBuyback), phoneBuybackController.createBuyback)
  .get(auth('viewUsedPhones'), validate(phoneBuybackValidation.getBuybacks), phoneBuybackController.getBuybacks);

router
  .route('/:buybackId')
  .get(auth('viewUsedPhones'), validate(phoneBuybackValidation.getBuyback), phoneBuybackController.getBuyback)
  .patch(auth('editUsedPhones'), validate(phoneBuybackValidation.updateBuyback), phoneBuybackController.updateBuyback)
  .delete(auth('deleteUsedPhones'), validate(phoneBuybackValidation.deleteBuyback), phoneBuybackController.deleteBuyback);

module.exports = router;
