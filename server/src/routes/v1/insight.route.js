const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const insightValidation = require('../../validations/insight.validation');
const insightController = require('../../controllers/insight.controller');

const router = express.Router();

router.use(auth(), branchScope());

// Fixed, dashboard-card-shaped views — checked before the generic '/:insightId' route.
router.get('/today', auth('viewInsights'), insightController.getTodayInsights);
router.get('/alerts', auth('viewInsights'), insightController.getAlerts);
router.get('/sales', auth('viewInsights'), insightController.getSalesInsights);
router.get('/inventory', auth('viewInsights'), insightController.getInventoryInsights);
router.get('/profit', auth('viewInsights'), insightController.getProfitInsights);
router.get('/customers', auth('viewInsights'), insightController.getCustomerInsights);
router.get('/branches', auth('viewInsights'), insightController.getBranchInsights);
router.post('/run', auth('viewInsights'), insightController.runInsightsNow);

router.route('/').get(auth('viewInsights'), validate(insightValidation.getInsights), insightController.getInsights);

router
  .route('/:insightId')
  .patch(auth('viewInsights'), validate(insightValidation.updateInsight), insightController.updateInsight);

module.exports = router;
