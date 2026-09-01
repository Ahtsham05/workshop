const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const purchaseValidation = require('../../validations/purchase.validation');
const purchaseController = require('../../controllers/purchase.controller');
const { upload } = require('../../middlewares/upload');
const { attachmentUpload } = require('../../middlewares/attachmentUpload');

const router = express.Router();
router.use(auth(), branchScope());

router
  .route('/scan-image')
  .post(auth('createPurchases'), upload.single('image'), purchaseController.scanPurchaseImage);

router
  .route('/upload-attachment')
  .post(auth('createPurchases'), attachmentUpload.single('file'), purchaseController.uploadPurchaseAttachment);

router
  .route('/delete-attachment')
  .delete(auth('createPurchases'), purchaseController.deletePurchaseAttachment);

router
  .route('/')
  .post(auth('createPurchases'), validate(purchaseValidation.createPurchase), purchaseController.createPurchase)
  .get(auth('viewPurchases'), validate(purchaseValidation.getPurchases), purchaseController.getPurchases);

router
  .route('/date')
  .get(auth('viewPurchases'), validate(purchaseValidation.getPurchaseByDate), purchaseController.getPurchaseByDate);

router
  .route('/next-number')
  .get(auth('viewPurchases'), purchaseController.getNextPurchaseInvoiceNumber);

// Purchase price intelligence — bulk "last purchase price" lookup for the New Purchase
// form's price-change indicator. Registered ahead of the /:purchaseId catch-all below.
router
  .route('/price-comparison/bulk')
  .post(
    auth('viewPurchases', 'createPurchases', 'editPurchases'),
    validate(purchaseValidation.getBulkPriceComparison),
    purchaseController.getBulkPriceComparison
  );

router
  .route('/:purchaseId')
  .get(auth('viewPurchases'), validate(purchaseValidation.getPurchase), purchaseController.getPurchase)
  .patch(auth('editPurchases'), validate(purchaseValidation.updatePurchase), purchaseController.updatePurchase)
  .delete(auth('deletePurchases'), validate(purchaseValidation.deletePurchase), purchaseController.deletePurchase);

module.exports = router;
