const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { studentService } = require('../services');
const { applyBranchFilter, getBranchContext, resolveWriteBranchId } = require('../utils/branchFilter');
const { readSheetRows } = require('../utils/importSheet');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middlewares/upload');
const { Organization } = require('../models');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

const createStudent = catchAsync(async (req, res) => {
  const body = { ...req.body, ...getBranchContext(req) };

  // Parse JSON fields from FormData (multipart sends them as strings)
  if (typeof body.parent === 'string') {
    try { body.parent = JSON.parse(body.parent); } catch { /* ignore */ }
  }
  if (typeof body.feeStructure === 'string') {
    try { body.feeStructure = JSON.parse(body.feeStructure); } catch { /* ignore */ }
  }

  // Handle photo upload
  if (req.file) {
    const result = await uploadToCloudinary(req.file.buffer, { folder: 'students' });
    body.photoUrl = { url: result.secure_url, publicId: result.public_id };
  }

  const doc = await studentService.createStudent(body);

  // Parent portal user is auto-created in studentService (password = studentUserId + phone)
  res.status(httpStatus.CREATED).send(doc);
});

const getStudents = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['classId', 'sectionId', 'status', 'admissionNumber']);
  applyBranchFilter(filter, req);

  // Free-text search across firstName, lastName, and parent.phone
  if (req.query.search) {
    const escaped = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { firstName: { $regex: escaped, $options: 'i' } },
      { lastName: { $regex: escaped, $options: 'i' } },
      { rollNumber: { $regex: escaped, $options: 'i' } },
      { 'parent.fatherName': { $regex: escaped, $options: 'i' } },
      { 'parent.phone': { $regex: escaped, $options: 'i' } },
      { admissionNumber: { $regex: escaped, $options: 'i' } },
      { studentUserId: { $regex: escaped, $options: 'i' } },
    ];
  }

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'classId,sectionId';
  const result = await studentService.queryStudents(filter, options);
  res.send(result);
});

const getStudent = catchAsync(async (req, res) => {
  const doc = await studentService.getStudentById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Student not found');
  res.send(doc);
});

const updateStudent = catchAsync(async (req, res) => {
  const body = { ...req.body };

  // Parse JSON fields from FormData
  if (typeof body.parent === 'string') {
    try { body.parent = JSON.parse(body.parent); } catch { /* ignore */ }
  }
  if (typeof body.feeStructure === 'string') {
    try { body.feeStructure = JSON.parse(body.feeStructure); } catch { /* ignore */ }
  }

  if (req.file) {
    // Delete old photo if exists
    const existing = await studentService.getStudentById(req.params.id, getScope(req));
    if (existing && existing.photoUrl && existing.photoUrl.publicId) {
      await deleteFromCloudinary(existing.photoUrl.publicId).catch(() => {});
    }
    const result = await uploadToCloudinary(req.file.buffer, { folder: 'students' });
    body.photoUrl = { url: result.secure_url, publicId: result.public_id };
  }

  const doc = await studentService.updateStudentById(req.params.id, body, getScope(req));
  res.send(doc);
});

const deleteStudent = catchAsync(async (req, res) => {
  const doc = await studentService.getStudentById(req.params.id, getScope(req));
  if (doc && doc.photoUrl && doc.photoUrl.publicId) {
    await deleteFromCloudinary(doc.photoUrl.publicId).catch(() => {});
  }
  await studentService.deleteStudentById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

const getStudentsByClass = catchAsync(async (req, res) => {
  const students = await studentService.getStudentsByClass(req.params.classId, getScope(req));
  res.send(students);
});

const getAdmissionForm = catchAsync(async (req, res) => {
  const student = await studentService.getStudentById(req.params.id, getScope(req));
  if (!student) throw new ApiError(httpStatus.NOT_FOUND, 'Student not found');

  // Fetch organization (school) details
  const org = await Organization.findById(req.organizationId).lean();

  const school = {
    name: org?.name || 'School Name',
    address: org?.address || '',
    phone: org?.phone || '',
    email: org?.email || '',
    logo: org?.logo?.url || null,
  };

  const s = student.toObject ? student.toObject() : student;

  const response = {
    student: {
      admissionNumber: s.admissionNumber,
      rollNumber: s.rollNumber || '',
      firstName: s.firstName,
      lastName: s.lastName || '',
      gender: s.gender,
      dateOfBirth: s.dateOfBirth,
      admissionDate: s.admissionDate,
      bloodGroup: s.bloodGroup || '',
      nationality: s.nationality || '',
      religion: s.religion || '',
      previousSchool: s.previousSchool || '',
      status: s.status,
      photoUrl: s.photoUrl?.url || null,
    },
    parent: {
      fatherName: s.parent?.fatherName || '',
      motherName: s.parent?.motherName || '',
      phone: s.parent?.phone || '',
      email: s.parent?.email || '',
      address: s.parent?.address || '',
    },
    academic: {
      className: s.classId?.name || '',
      sectionName: s.sectionId?.name || '',
    },
    fees: {
      monthlyFee: s.feeStructure?.monthlyFee || 0,
      transportFee: s.feeStructure?.transportFee || 0,
      admissionFee: s.feeStructure?.admissionFee || 0,
      discount: s.feeStructure?.discount || 0,
    },
    school,
  };

  res.send(response);
});

/**
 * Columns the student import understands, with the spellings people actually use. Order
 * doubles as the assumed column order for a file that has no header row at all.
 */
const STUDENT_IMPORT_FIELDS = [
  { key: 'firstName', label: 'First Name', required: true, aliases: ['Name', 'Student Name', 'Student', 'Given Name'] },
  { key: 'lastName', label: 'Last Name', aliases: ['Surname', 'Family Name'] },
  { key: 'gender', label: 'Gender', required: true, aliases: ['Sex', 'M/F'] },
  { key: 'dateOfBirth', label: 'Date of Birth', aliases: ['DOB', 'Birth Date', 'Birthday'] },
  { key: 'class', label: 'Class', required: true, aliases: ['Class Name', 'Grade', 'Standard'] },
  { key: 'section', label: 'Section', aliases: ['Section Name', 'Sec'] },
  { key: 'parentPhone', label: 'Parent Phone', aliases: ['Phone', 'Contact Number', 'Mobile', 'Guardian Phone', 'Father Phone'] },
  { key: 'fatherName', label: 'Father Name', aliases: ['Father', "Father's Name", 'Guardian Name', 'Parent Name'] },
  { key: 'monthlyFee', label: 'Monthly Fee', aliases: ['Tuition Fee', 'Fee', 'Fees'] },
  { key: 'transportFee', label: 'Transport Fee', aliases: ['Transport', 'Van Fee', 'Bus Fee'] },
  { key: 'admissionFee', label: 'Admission Fee', aliases: ['Admission'] },
  { key: 'discount', label: 'Discount', aliases: ['Concession', 'Rebate'] },
];

const bulkImport = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Excel file is required');
  }

  // Tolerant read: the header row is found wherever it is (files usually open with a
  // school name or a blank row), columns are matched however they're spelled, and the
  // sheet that actually holds data is picked rather than blindly the first one — see
  // utils/importSheet.js. Rows come back keyed by the field names bulkImportStudents
  // expects, each carrying its real Excel row number.
  const { rows, headerRow, sheetName, missingFields } = readSheetRows(
    req.file.buffer,
    STUDENT_IMPORT_FIELDS,
  );

  if (!rows.length) {
    throw new ApiError(
      httpStatus.BAD_REQUEST,
      missingFields.length
        ? `No student rows found. These columns are needed: ${missingFields
            .map((key) => (STUDENT_IMPORT_FIELDS.find((field) => field.key === key) || {}).label || key)
            .join(', ')}.`
        : 'No student rows found in this file. Check that the data is on one of the sheets and try again.',
    );
  }

  // Students require a branch. Without this, a request that arrives before the branch
  // switcher has resolved would fail every single row on `branchId: required` — the same
  // fix products and customers needed.
  await resolveWriteBranchId(req);

  const scope = getBranchContext(req);
  const results = await studentService.bulkImportStudents(rows, scope);
  res.status(httpStatus.OK).send({ ...results, headerRow, sheetName });
});

/**
 * Full admission: create student + auto-generate admission fee voucher.
 * Returns { student, voucher }.
 */
const admitStudent = catchAsync(async (req, res) => {
  const body = { ...req.body, ...getBranchContext(req) };

  // Parse JSON fields from FormData (multipart sends them as strings)
  if (typeof body.parent === 'string') {
    try { body.parent = JSON.parse(body.parent); } catch { /* ignore */ }
  }
  if (typeof body.feeStructure === 'string') {
    try { body.feeStructure = JSON.parse(body.feeStructure); } catch { /* ignore */ }
  }

  // Handle photo upload
  if (req.file) {
    const result = await uploadToCloudinary(req.file.buffer, { folder: 'students' });
    body.photoUrl = { url: result.secure_url, publicId: result.public_id };
  }

  const result = await studentService.admitStudent(body);

  res.status(httpStatus.CREATED).send(result);
});

// ── Promotion ─────────────────────────────────────────────────────────────────

const getPromotionEligibility = catchAsync(async (req, res) => {
  const students = await studentService.getPromotionEligibility(req.params.classId, getScope(req));
  res.send({ results: students, total: students.length });
});

const promoteStudents = catchAsync(async (req, res) => {
  const result = await studentService.promoteStudents(req.body, getScope(req));
  res.send(result);
});

// ── Struck Off / Left Students ──────────────────────────────────────────────

const struckOffStudent = catchAsync(async (req, res) => {
  const result = await studentService.struckOffStudent(req.params.id, req.body, getScope(req), req.user._id);
  res.send(result);
});

const reinstateStudent = catchAsync(async (req, res) => {
  const doc = await studentService.reinstateStudent(req.params.id, getScope(req), req.user._id);
  res.send(doc);
});

module.exports = {
  createStudent, getStudents, getStudent, updateStudent, deleteStudent,
  getStudentsByClass, getAdmissionForm, bulkImport, admitStudent,
  promoteStudents, getPromotionEligibility,
  struckOffStudent, reinstateStudent,
};
