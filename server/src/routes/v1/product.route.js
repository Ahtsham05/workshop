const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const productValidation = require('../../validations/product.validation');
const productController = require('../../controllers/product.controller');
const { upload } = require('../../middlewares/upload');

const router = express.Router();
router.use(auth(), branchScope());

// Read access for anyone who can legitimately browse the product catalog to do their
// job, not just full product management — covers the Invoice, Fast Billing, Purchase
// Invoice, Purchase Orders, Stock Adjustment, and Stock Transfer item pickers, all of
// which hit /all or /purchasable. Purchase cost is redacted server-side for roles that
// have none of the product/purchasing permissions below — see getAllProducts and
// getPurchasableCatalog.
const CATALOG_READ_PERMISSIONS = [
  'viewProducts',
  'viewInvoices', 'createInvoices', 'editInvoices',
  'viewPurchases', 'createPurchases', 'editPurchases',
  'viewPurchaseOrders', 'createPurchaseOrders', 'editPurchaseOrders',
];

router
  .route('/')
  .post(
    auth('createProducts'),
    upload.single('image'),
    validate(productValidation.createProduct),
    productController.createProduct
  )
  .get(auth('viewProducts'), validate(productValidation.getProducts), productController.getProducts);

router
  .route('/all')
  .get(auth(...CATALOG_READ_PERMISSIONS), validate(productValidation.getAllProducts), productController.getAllProducts);

router.route('/purchasable').get(
  auth(...CATALOG_READ_PERMISSIONS),
  validate(productValidation.getAllProducts),
  productController.getPurchasableCatalog
);

// Bulk update route
router
  .route('/bulk-update')
  .patch(auth('editProducts'), validate(productValidation.bulkUpdateProducts), productController.bulkUpdateProducts);

// Bulk add (import) route
router
  .route('/bulk')
  .post(auth('createProducts'), validate(productValidation.bulkAddProducts), productController.bulkAddProducts);

router
  .route('/scan-image')
  .post(auth('createProducts'), upload.single('image'), productController.scanProductImage);

// Image upload routes
router
  .route('/upload-image')
  .post(auth('createProducts'), upload.single('image'), productController.uploadProductImage);

router
  .route('/delete-image')
  .delete(auth('deleteProducts'), productController.deleteProductImage);

router
  .route('/fetch-image-from-search')
  .post(
    auth('createProducts'),
    validate(productValidation.fetchImageFromSearch),
    productController.fetchImageFromSearch,
  );

router
  .route('/:productId')
  .get(auth('viewProducts'), validate(productValidation.getProduct), productController.getProduct)
  .patch(
    auth('editProducts'), 
    upload.single('image'), 
    validate(productValidation.updateProduct), 
    productController.updateProduct
  )
  .delete(auth('deleteProducts'), validate(productValidation.deleteProduct), productController.deleteProduct);

module.exports = router;
