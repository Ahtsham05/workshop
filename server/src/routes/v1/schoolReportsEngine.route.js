const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { schoolReportsController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

// Unified dispatcher
router.route('/').get(schoolReportsController.getReport);

// Financial
router.route('/financial/monthly').get(schoolReportsController.getMonthlyIncomeExpense);
router.route('/financial/daily').get(schoolReportsController.getDailyCollection);
router.route('/financial/categories').get(schoolReportsController.getCategoryReport);
router.route('/financial/pnl').get(schoolReportsController.getProfitAndLoss);

// Students
router.route('/students/list').get(schoolReportsController.getStudentList);
router.route('/students/fee-status').get(schoolReportsController.getStudentFeeStatus);
router.route('/students/attendance').get(schoolReportsController.getStudentAttendance);

// Teachers
router.route('/teachers/salary').get(schoolReportsController.getTeacherSalary);
router.route('/teachers/workload').get(schoolReportsController.getTeacherWorkload);

// Vouchers
router.route('/vouchers').get(schoolReportsController.getVoucherReport);

// Analytics
router.route('/analytics').get(schoolReportsController.getAnalytics);

// Fee Collection
router.route('/fee-collection/yearly').get(schoolReportsController.getYearlyFeeReport);
router.route('/fee-collection/receivable').get(schoolReportsController.getReceivableSummary);

module.exports = router;
