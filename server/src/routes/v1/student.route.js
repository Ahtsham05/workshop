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

// Separate multer instance that accepts Excel files only
const xlsxUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'application/octet-stream',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(xlsx|xls)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx or .xls files are allowed'), false);
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
