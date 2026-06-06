/**
 * Teacher Portal Routes — restricted to users with schoolRole=teacher
 * Teachers can only see their assigned classes/students.
 */
const express = require('express');
const auth = require('../../middlewares/auth');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolRole } = require('../../middlewares/schoolAccess');
const { teacherPortalController } = require('../../controllers');

const router = express.Router();
router.use(
  auth(),
  branchScope(false),
  checkFeatureAccess('school_management'),
  requireSchoolRole('teacher'),
);

router.get('/me', teacherPortalController.getTeacherMe);
router.get('/dashboard', teacherPortalController.getDashboard);
router.get('/students', teacherPortalController.getMyStudents);
router.get('/exams', teacherPortalController.getMyExams);
router.get('/exam-students', teacherPortalController.getExamStudents);
router.get('/subjects', teacherPortalController.getMySubjects);
router.get('/attendance', teacherPortalController.getMyAttendance);
router.post('/attendance/bulk', teacherPortalController.markBulkAttendance);
router.get('/marks', teacherPortalController.getMyMarks);
router.post('/marks/bulk', teacherPortalController.saveBulkMarks);
router.get('/timetable', teacherPortalController.getMyTimetable);
router.get('/my-attendance', teacherPortalController.getMyOwnAttendance);
router.get('/diaries', teacherPortalController.getMyDiaries);
router.post('/diaries', teacherPortalController.createMyDiary);
router.delete('/diaries/:id', teacherPortalController.deleteMyDiary);

module.exports = router;
