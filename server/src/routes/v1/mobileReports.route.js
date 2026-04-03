const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const mobileReportsController = require('../../controllers/mobileReports.controller');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('mobile_shop'));

router.get('/sales', mobileReportsController.getSalesReport);
router.get('/load', mobileReportsController.getLoadReport);
router.get('/load/wallet-balance-statement', mobileReportsController.getWalletBalanceStatement);
router.get('/profit', mobileReportsController.getProfitReport);
router.get('/expenses', mobileReportsController.getExpenseReport);

module.exports = router;
