const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { schoolReportController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

router.get('/student/:studentId', auth('getSchool'), schoolReportController.getStudentProgressReport);
router.get('/class/:classId/bulk', auth('getSchool'), schoolReportController.getClassProgressReportsBulk);
router.get('/exam/:examId/result-sheet', auth('getSchool'), schoolReportController.getExamResultSheet);

module.exports = router;
