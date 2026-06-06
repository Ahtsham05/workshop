/**
 * Family Portal Routes — for users with schoolRole=parent or schoolRole=student.
 * Both can only see data for the students linked to their account
 * (a parent sees their children; a student sees only their own record).
 */
const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolRole } = require('../../middlewares/schoolAccess');
const { upload } = require('../../middlewares/upload');
const { parentPortalController } = require('../../controllers');

const router = express.Router();
router.use(
  auth(),
  branchScope(false),
  checkFeatureAccess('school_management'),
  requireSchoolRole('parent', 'student'),
);

router.get('/children', parentPortalController.getMyChildren);
router.get('/results', parentPortalController.getMyChildResults);
router.get('/exams', parentPortalController.getMyChildExams);
router.get('/attendance', parentPortalController.getMyChildAttendance);
router.get('/fees', parentPortalController.getMyChildFees);
router.get('/diary', parentPortalController.getMyChildDiary);
router.get('/bank-accounts', parentPortalController.getBankAccounts);
router
  .route('/payment-requests')
  .get(parentPortalController.getMyPaymentRequests)
  .post(upload.single('screenshot'), parentPortalController.createPaymentRequest);
router.get('/report/:studentId', parentPortalController.getMyChildReport);

module.exports = router;
