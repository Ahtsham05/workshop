const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { schoolReportController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'));

router.get('/student/:studentId', auth('getSchool'), schoolReportController.getStudentProgressReport);
router.get('/exam/:examId/result-sheet', auth('getSchool'), schoolReportController.getExamResultSheet);

module.exports = router;
