const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { schoolAccountingController } = require('../../controllers');
const { objectId } = require('../../validations/custom.validation');
const Joi = require('joi');
const validate = require('../../middlewares/validate');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

// Accounting Dashboard
router.route('/dashboard').get(schoolAccountingController.getAccountingDashboard);

// Reports
router.route('/reports/monthly').get(schoolAccountingController.getMonthlyReport);
router.route('/reports/categories').get(schoolAccountingController.getCategoryReport);
router.route('/reports/teacher-salary').get(schoolAccountingController.getTeacherSalaryReport);
router
  .route('/reports/student/:studentId')
  .get(
    validate({ params: Joi.object().keys({ studentId: Joi.string().custom(objectId).required() }) }),
    schoolAccountingController.getStudentFeeReport
  );

module.exports = router;
