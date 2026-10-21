const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const purchaseSuggestionsValidation = require('../../validations/purchaseSuggestions.validation');
const purchaseSuggestionsController = require('../../controllers/purchaseSuggestions.controller');

const router = express.Router();

router.use(auth(), branchScope());

router.get('/purchase-suggestions', auth('viewPurchaseSuggestions', 'viewInsights'), validate(purchaseSuggestionsValidation.getPurchaseSuggestions), purchaseSuggestionsController.getPurchaseSuggestions);
router.get('/inventory-insights', auth('viewPurchaseSuggestions', 'viewInsights'), purchaseSuggestionsController.getInventoryInsights);
router.get('/supplier-recommendations', auth('viewPurchaseSuggestions', 'viewInsights'), validate(purchaseSuggestionsValidation.getSupplierRecommendations), purchaseSuggestionsController.getSupplierRecommendations);
router.get('/stockout-predictions', auth('viewPurchaseSuggestions', 'viewInsights'), purchaseSuggestionsController.getStockoutPredictions);
router.get('/dead-stock', auth('viewPurchaseSuggestions', 'viewInsights'), purchaseSuggestionsController.getDeadStock);
router.get('/demand-trends', auth('viewPurchaseSuggestions', 'viewInsights'), purchaseSuggestionsController.getDemandTrends);
router.get('/transfer-suggestions', auth('viewPurchaseSuggestions', 'viewInsights', 'viewStockTransfers', 'manageStockTransfers'), purchaseSuggestionsController.getTransferSuggestions);
router.post('/purchase-suggestions/run', auth('viewPurchaseSuggestions', 'viewInsights'), purchaseSuggestionsController.runNow);

module.exports = router;
