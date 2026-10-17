const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const productListValidation = require('../../validations/productList.validation');
const productListController = require('../../controllers/productList.controller');

const router = express.Router();
router.use(auth(), branchScope());

// Reading lists = browsing products; changing them = editing products.
router
  .route('/')
  .get(auth('viewProducts'), productListController.listProductLists)
  .post(auth('editProducts'), validate(productListValidation.createProductList), productListController.createProductList);

router.route('/memberships').get(auth('viewProducts'), validate(productListValidation.getMemberships), productListController.getMemberships);

// Products on a "Do not order" list — read by the purchase screens to warn before ordering.
router
  .route('/do-not-order')
  .get(auth('viewProducts', 'viewPurchases', 'createPurchases', 'createPurchaseOrders'), productListController.getDoNotOrder);

router
  .route('/:listId')
  .get(auth('viewProducts'), validate(productListValidation.getProductList), productListController.getProductList)
  .patch(auth('editProducts'), validate(productListValidation.updateProductList), productListController.updateProductList)
  .delete(auth('editProducts'), validate(productListValidation.deleteProductList), productListController.deleteProductList);

router
  .route('/:listId/products')
  .post(auth('editProducts'), validate(productListValidation.addProducts), productListController.addProducts)
  .delete(auth('editProducts'), validate(productListValidation.removeProducts), productListController.removeProducts);

router
  .route('/:listId/products/:productId')
  .patch(auth('editProducts'), validate(productListValidation.updateItem), productListController.updateItem);

// Read-only decision figures (stock health, value, sales) for a list.
router.route('/:listId/insights').get(auth('viewProducts'), validate(productListValidation.getInsights), productListController.getInsights);

router
  .route('/:listId/order-lines')
  .get(auth('viewProducts', 'createPurchases', 'createPurchaseOrders'), validate(productListValidation.getOrderLines), productListController.getOrderLines);

module.exports = router;
