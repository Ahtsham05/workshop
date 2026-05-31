const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { schoolDashboardController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

router
  .route('/')
  .get(auth('getSchool'), schoolDashboardController.getDashboardStats);

router
  .route('/teacher-attendance-stats')
  .get(auth('getSchool'), schoolDashboardController.getTeacherAttendanceTodayStats);

module.exports = router;
