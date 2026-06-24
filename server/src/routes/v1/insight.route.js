const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const insightValidation = require('../../validations/insight.validation');
const insightController = require('../../controllers/insight.controller');

const router = express.Router();

router.use(auth(), branchScope());

// Fixed, dashboard-card-shaped views — checked before the generic '/:insightId' route.
router.get('/today', insightController.getTodayInsights);
router.get('/alerts', insightController.getAlerts);
router.get('/sales', insightController.getSalesInsights);
router.get('/inventory', insightController.getInventoryInsights);
router.get('/profit', insightController.getProfitInsights);
router.get('/customers', insightController.getCustomerInsights);
router.get('/branches', insightController.getBranchInsights);
router.post('/run', insightController.runInsightsNow);

router.route('/').get(validate(insightValidation.getInsights), insightController.getInsights);

router.route('/:insightId').patch(validate(insightValidation.updateInsight), insightController.updateInsight);

module.exports = router;
