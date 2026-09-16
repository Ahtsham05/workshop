const express = require('express');
const multer = require('multer');
const auth = require('../../middlewares/auth');
const validate = require('../../middlewares/validate');
const branchScope = require('../../middlewares/branchScope');
const checkFeatureAccess = require('../../middlewares/checkFeatureAccess');
const { requireSchoolAdmin } = require('../../middlewares/schoolAccess');
const { studentValidation } = require('../../validations');
const { studentController } = require('../../controllers');
const { upload } = require('../../middlewares/upload');

const router = express.Router();
router.use(auth(), branchScope(false), checkFeatureAccess('school_management'), requireSchoolAdmin());

// Separate multer instance for spreadsheet uploads. The extension list matches what the
// parser can actually read (utils/importSheet.js reads all of these), including CSV —
// plenty of school software exports CSV, and rejecting it sent people back to Excel to
// re-save a file that would have imported perfectly well. Matching is case-insensitive:
// a file named LIST.XLSX is the same file as list.xlsx.
const SPREADSHEET_PATTERN = /\.(xlsx|xlsm|xlsb|xls|csv|ods)$/i;
const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/vnd.oasis.opendocument.spreadsheet',
      'text/csv',
      'application/csv',
      'application/octet-stream',
    ];
    if (allowed.includes(file.mimetype) || SPREADSHEET_PATTERN.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error(`"${file.originalname}" is not a spreadsheet — upload an Excel (.xlsx, .xls) or .csv file`), false);
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

// Must be before /:id route to avoid conflicts
router.post('/import', auth('manageSchool'), xlsxUpload.single('file'), studentController.bulkImport);
router.post('/admit', auth('manageSchool'), upload.single('photo'), validate(studentValidation.createStudent), studentController.admitStudent);
router.post('/promote', auth('manageSchool'), validate(studentValidation.promoteStudents), studentController.promoteStudents);
router.get('/promotion-eligibility/:classId', auth('getSchool'), validate(studentValidation.getPromotionEligibility), studentController.getPromotionEligibility);

router
  .route('/')
  .post(auth('manageSchool'), upload.single('photo'), validate(studentValidation.createStudent), studentController.createStudent)
  .get(auth('getSchool'), validate(studentValidation.getStudents), studentController.getStudents);

router
  .route('/:id')
  .get(auth('getSchool'), validate(studentValidation.getStudent), studentController.getStudent)
  .patch(auth('manageSchool'), upload.single('photo'), validate(studentValidation.updateStudent), studentController.updateStudent)
  .delete(auth('manageSchool'), validate(studentValidation.deleteStudent), studentController.deleteStudent);

router
  .route('/:id/admission-form')
  .get(auth('getSchool'), validate(studentValidation.getStudent), studentController.getAdmissionForm);

router
  .route('/class/:classId')
  .get(auth('getSchool'), validate(studentValidation.getStudentsByClass), studentController.getStudentsByClass);

module.exports = router;
