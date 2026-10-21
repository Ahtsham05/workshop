const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const checkBusinessType = require('../../middlewares/checkBusinessType');
const mobileReportsController = require('../../controllers/mobileReports.controller');

const router = express.Router();

router.use(auth(), branchScope(), checkBusinessType('mobile_shop'));

router.get('/sales', auth('viewReports'), mobileReportsController.getSalesReport);
router.get('/load', auth('viewReports'), mobileReportsController.getLoadReport);
router.get('/load/wallet-balance-statement', auth('viewReports'), mobileReportsController.getWalletBalanceStatement);
router.get('/profit', auth('viewReports'), mobileReportsController.getProfitReport);
router.get('/expenses', auth('viewReports'), mobileReportsController.getExpenseReport);

module.exports = router;
