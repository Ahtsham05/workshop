const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const stockCountValidation = require('../../validations/stockCount.validation');
const stockCountController = require('../../controllers/stockCount.controller');
const { STOCK_COUNT_PERMISSIONS: P } = require('../../config/stockCountPermissions');

const router = express.Router();
router.use(auth(), branchScope());

// Fixed paths before '/:countId'.
router.get('/plan', auth(...P.view), stockCountController.getPlan);
router.get('/categories', auth(...P.view), stockCountController.getCategories);
router.get('/plan/items', auth(...P.view), stockCountController.getPlanItems);
router
  .route('/policy')
  .get(auth(...P.view), stockCountController.getPolicy)
  .patch(auth(...P.approve), validate(stockCountValidation.updatePolicy), stockCountController.updatePolicy);
router.post('/policy/override', auth(...P.approve), validate(stockCountValidation.setOverride), stockCountController.setOverride);
router.get('/reports', auth(...P.view), validate(stockCountValidation.getReports), stockCountController.getReports);
router.get(
  '/product/:productId/history',
  auth(...P.view),
  validate(stockCountValidation.productHistory),
  stockCountController.getProductHistory
);

router
  .route('/')
  .get(auth(...P.view), validate(stockCountValidation.getCounts), stockCountController.getCounts)
  .post(auth(...P.count), validate(stockCountValidation.createCount), stockCountController.createCount);

router.get('/:countId', auth(...P.view), validate(stockCountValidation.getCount), stockCountController.getCount);
router.post('/:countId/counts', auth(...P.count), validate(stockCountValidation.recordCounts), stockCountController.recordCounts);
router.post('/:countId/lines', auth(...P.count), validate(stockCountValidation.addLines), stockCountController.addLines);
router.post('/:countId/submit', auth(...P.count), validate(stockCountValidation.submitCount), stockCountController.submitCount);
router.post('/:countId/recount', auth(...P.approve), validate(stockCountValidation.recount), stockCountController.recount);
router.post('/:countId/post', auth(...P.approve), validate(stockCountValidation.postCount), stockCountController.postCount);
router.post('/:countId/cancel', auth(...P.approve), validate(stockCountValidation.cancelCount), stockCountController.cancelCount);

module.exports = router;
