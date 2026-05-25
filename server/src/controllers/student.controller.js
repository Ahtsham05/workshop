const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { studentService, userService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middlewares/upload');
const { Organization, User } = require('../models');

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

  // Auto-create a Parent portal User (email = parent email if provided, password = phone)
  const parentEmail = body.parent?.email;
  const parentPhone = body.parent?.phone;
  const parentName = body.parent?.fatherName || body.parent?.motherName || body.parent?.guardianName || 'Parent';
  if (parentEmail && parentPhone) {
    try {
      const rawPhone = parentPhone.replace(/\D/g, '') || '';
      const password = rawPhone.length >= 8 ? rawPhone : `P${rawPhone}2024!`;
      const emailTaken = await User.isEmailTaken(parentEmail);
      if (!emailTaken) {
        const parentUser = await userService.createUser({
          name: parentName,
          email: parentEmail,
          password,
          organizationId: body.organizationId,
          systemRole: 'staff',
          businessType: 'school',
          linkedStudentIds: [doc._id],
          schoolRole: 'parent',
          isEmailVerified: true,
        });
        await studentService.updateStudentById(doc._id, { parentUserId: parentUser.id }, getScope(req));
        doc.parentUserId = parentUser.id;
      }
    } catch (_err) {
      // Non-fatal — student record already saved
    }
  }

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

const bulkImport = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Excel file is required');
  }

  const XLSX = require('xlsx');
  const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Excel file has no sheets');
  }
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
  if (!rows.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Excel file is empty or has no data rows');
  }

  const scope = getBranchContext(req);
  const results = await studentService.bulkImportStudents(rows, scope);
  res.status(httpStatus.OK).send(results);
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

  // Auto-create parent portal user (same as createStudent)
  const parentEmail = body.parent?.email;
  const parentPhone = body.parent?.phone;
  const parentName = body.parent?.fatherName || body.parent?.motherName || body.parent?.guardianName || 'Parent';
  if (parentEmail && parentPhone) {
    try {
      const rawPhone = parentPhone.replace(/\D/g, '') || '';
      const password = rawPhone.length >= 8 ? rawPhone : `P${rawPhone}2024!`;
      const emailTaken = await User.isEmailTaken(parentEmail);
      if (!emailTaken) {
        const parentUser = await userService.createUser({
          name: parentName,
          email: parentEmail,
          password,
          organizationId: body.organizationId,
          systemRole: 'staff',
          businessType: 'school',
          linkedStudentIds: [result.student._id],
          schoolRole: 'parent',
          isEmailVerified: true,
        });
        await studentService.updateStudentById(result.student._id, { parentUserId: parentUser.id }, getScope(req));
      }
    } catch (_err) {
      // Non-fatal
    }
  }

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

module.exports = {
  createStudent, getStudents, getStudent, updateStudent, deleteStudent,
  getStudentsByClass, getAdmissionForm, bulkImport, admitStudent,
  promoteStudents, getPromotionEligibility,
};
