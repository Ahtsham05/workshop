const express = require('express');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { timetableValidation } = require('../../validations');
const { timetableController } = require('../../controllers');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'));

// ── Conflict Detection (stateless, no DB writes) ─────────────────────────
router
  .route('/check-conflict')
  .post(
    auth('getSchool'),
    validate(timetableValidation.checkConflict),
    timetableController.checkConflict
  );

// ── Auto Generation ───────────────────────────────────────────────────────
router
  .route('/auto-generate')
  .post(
    auth('manageSchool'),
    validate(timetableValidation.autoGenerateTimetable),
    timetableController.autoGenerateTimetable
  );

// ── Bulk Generation (all classes, one click) ─────────────────────────────
router
  .route('/bulk-generate')
  .post(
    auth('manageSchool'),
    validate(timetableValidation.bulkGenerateTimetables),
    timetableController.bulkGenerateTimetables
  );

// ── Teacher Schedule & Availability ──────────────────────────────────────
// Weekly schedule: GET /timetables/teacher/:teacherId
router
  .route('/teacher/:teacherId')
  .get(
    auth('getSchool'),
    validate(timetableValidation.getTimetableByTeacher),
    timetableController.getTimetableByTeacher
  );

// Day availability: GET /timetables/teacher/:teacherId/availability/:day
router
  .route('/teacher/:teacherId/availability/:day')
  .get(
    auth('getSchool'),
    validate(timetableValidation.getTeacherAvailability),
    timetableController.getTeacherAvailability
  );

// ── Class Timetable ───────────────────────────────────────────────────────
router
  .route('/class/:classId')
  .get(
    auth('getSchool'),
    validate(timetableValidation.getTimetableByClass),
    timetableController.getTimetableByClass
  );

// ── Core CRUD ─────────────────────────────────────────────────────────────
router
  .route('/')
  .post(auth('manageSchool'), validate(timetableValidation.createTimetable), timetableController.createTimetable)
  .get(auth('getSchool'), validate(timetableValidation.getTimetables), timetableController.getTimetables);

router
  .route('/:id')
  .get(auth('getSchool'), validate(timetableValidation.getTimetable), timetableController.getTimetable)
  .patch(auth('manageSchool'), validate(timetableValidation.updateTimetable), timetableController.updateTimetable)
  .delete(auth('manageSchool'), validate(timetableValidation.deleteTimetable), timetableController.deleteTimetable);

module.exports = router;
