const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const purchaseSuggestionsValidation = require('../../validations/purchaseSuggestions.validation');
const purchaseSuggestionsController = require('../../controllers/purchaseSuggestions.controller');

const router = express.Router();

router.use(auth(), branchScope());

router.get('/purchase-suggestions', validate(purchaseSuggestionsValidation.getPurchaseSuggestions), purchaseSuggestionsController.getPurchaseSuggestions);
router.get('/inventory-insights', purchaseSuggestionsController.getInventoryInsights);
router.get('/supplier-recommendations', validate(purchaseSuggestionsValidation.getSupplierRecommendations), purchaseSuggestionsController.getSupplierRecommendations);
router.get('/stockout-predictions', purchaseSuggestionsController.getStockoutPredictions);
router.get('/dead-stock', purchaseSuggestionsController.getDeadStock);
router.get('/demand-trends', purchaseSuggestionsController.getDemandTrends);
router.get('/transfer-suggestions', purchaseSuggestionsController.getTransferSuggestions);
router.post('/purchase-suggestions/run', purchaseSuggestionsController.runNow);

module.exports = router;
