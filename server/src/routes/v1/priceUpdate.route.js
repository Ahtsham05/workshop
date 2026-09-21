const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const ApiError = require('../../utils/ApiError');
const { attachmentUpload } = require('../../middlewares/attachmentUpload');
const priceUpdateValidation = require('../../validations/priceUpdate.validation');
const priceUpdateController = require('../../controllers/priceUpdate.controller');

const router = express.Router();
router.use(auth(), branchScope());

// Turns multer's raw errors (wrong type, too large) into a clear 400 the UI can show as-is.
const uploadPriceList = (req, res, next) =>
  attachmentUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large (10 MB maximum)' : err.message || 'Upload failed';
    return next(new ApiError(400, message));
  });

// Reading a supplier's list and applying it both need the dedicated permission: it changes prices
// (and so margins) across the catalog, which is more than "can edit a product".
router.post('/analyze', auth('managePriceUpdates'), validate(priceUpdateValidation.analyze), priceUpdateController.analyze);
router.post('/extract', auth('managePriceUpdates'), uploadPriceList, priceUpdateController.extract);
router.get('/products/search', auth('managePriceUpdates'), validate(priceUpdateValidation.searchProducts), priceUpdateController.searchProducts);
router.post('/apply', auth('managePriceUpdates'), validate(priceUpdateValidation.applyBatch), priceUpdateController.applyBatch);

router.get('/batches', auth('viewPriceUpdates'), validate(priceUpdateValidation.getBatches), priceUpdateController.getBatches);
router.get('/batches/:batchId', auth('viewPriceUpdates'), validate(priceUpdateValidation.getBatch), priceUpdateController.getBatch);
router.post(
  '/batches/:batchId/rollback',
  auth('managePriceUpdates'),
  validate(priceUpdateValidation.rollbackBatch),
  priceUpdateController.rollbackBatch
);

// A product's own price timeline is shown on its details page, so anyone who can open products
// (and already sees the cost there) may read it.
router.get(
  '/history/:productId',
  auth('viewPriceUpdates', 'viewProducts'),
  validate(priceUpdateValidation.getProductHistory),
  priceUpdateController.getProductHistory
);

router.get('/aliases', auth('viewPriceUpdates'), priceUpdateController.getAliases);
router.delete('/aliases/:aliasId', auth('managePriceUpdates'), validate(priceUpdateValidation.deleteAlias), priceUpdateController.deleteAlias);

module.exports = router;
