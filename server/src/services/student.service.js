const httpStatus = require('http-status');
const mongoose = require('mongoose');
const {
  Student,
  User,
  FeeVoucher,
  SchoolClass,
  SchoolFee,
  SchoolAttendance,
  Mark,
  StudentCreditLedger,
  SchoolTransaction,
} = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = data.organizationId;
  if (data.branchId) filter.branchId = data.branchId;
  return filter;
};

/**
 * Cast tenant IDs to ObjectId for use inside aggregate() pipelines.
 * mongoose .find() auto-casts strings → ObjectId but aggregate() does NOT.
 */
const getAggregateFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = new mongoose.Types.ObjectId(scope.organizationId);
  if (scope.branchId) filter.branchId = new mongoose.Types.ObjectId(scope.branchId);
  return filter;
};

/**
 * Generate admission number: org-wide unique sequence (0001, 0002, 0003…)
 * Unique per organizationId ONLY — same number cannot appear in any branch of the same org.
 */
const generateAdmissionNumber = async (classId, scope = {}) => {
  // Query across ALL branches of this org to guarantee org-wide uniqueness
  const orgFilter = scope.organizationId ? { organizationId: scope.organizationId } : {};

  const lastStudent = await Student.findOne({
    ...orgFilter,
    admissionNumber: { $regex: /^\d+$/ },
  })
    .sort({ admissionNumber: -1 })
    .collation({ locale: 'en_US', numericOrdering: true })
    .lean();

  let nextNum = 1;
  if (lastStudent) {
    const lastNum = parseInt(lastStudent.admissionNumber, 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  return String(nextNum).padStart(4, '0');
};

/**
 * Generate roll number: ROLL-{CLASS_NAME}-{AUTO_INCREMENT}
 */
const generateRollNumber = async (classId, scope = {}) => {
  const tenantFilter = getTenantFilter(scope);
  // Get class name for roll prefix
  const SchoolClass = require('../models').SchoolClass;
  const cls = await SchoolClass.findById(classId).lean();
  const className = cls ? cls.name.replace(/\s+/g, '') : classId;
  const prefix = `ROLL-${className}-`;

  const lastStudent = await Student.findOne({
    ...tenantFilter,
    classId,
    rollNumber: { $regex: `^${prefix}` },
  })
    .sort({ rollNumber: -1 })
    .lean();

  let nextNum = 1;
  if (lastStudent && lastStudent.rollNumber) {
    const lastNum = parseInt(lastStudent.rollNumber.replace(prefix, ''), 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  return `${prefix}${String(nextNum).padStart(3, '0')}`;
};

/**
 * Generate numeric student user ID — globally unique (100001, 100002…)
 * Used for parent portal login and printed on fee vouchers.
 */
const generateStudentUserId = async () => {
  const lastStudent = await Student.findOne({
    studentUserId: { $regex: /^\d+$/ },
  })
    .sort({ studentUserId: -1 })
    .collation({ locale: 'en_US', numericOrdering: true })
    .lean();

  let nextNum = 100001;
  if (lastStudent?.studentUserId) {
    const lastNum = parseInt(lastStudent.studentUserId, 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  return String(nextNum);
};

/** Ensure a student has a studentUserId (backfill for existing records). */
const ensureStudentUserId = async (studentId, scope = {}) => {
  const student = await Student.findOne({ _id: studentId, ...getTenantFilter(scope) });
  if (!student) return null;
  if (student.studentUserId) return student.studentUserId;

  const studentUserId = await generateStudentUserId();
  student.studentUserId = studentUserId;
  await student.save();
  return studentUserId;
};

/**
 * Build the student portal password — the guardian's phone number (digits only).
 * Login ID is the numeric studentUserId; this phone is the password.
 */
const buildStudentPortalPassword = (phone) => String(phone || '').replace(/\D/g, '');

const createStudent = async (body) => {
  const scope = getTenantFilter(body);

  // Auto-generate admission number if not provided (unique across entire org)
  if (!body.admissionNumber) {
    if (!body.classId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'classId is required to generate admission number');
    }
    body.admissionNumber = await generateAdmissionNumber(body.classId, scope);
  } else {
    // Check uniqueness across the entire organization (all branches)
    const orgFilter = scope.organizationId ? { organizationId: scope.organizationId } : {};
    if (await Student.findOne({ ...orgFilter, admissionNumber: body.admissionNumber })) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Admission number already exists in this organization');
    }
  }

  // Auto-generate roll number if not provided
  if (!body.rollNumber && body.classId) {
    body.rollNumber = await generateRollNumber(body.classId, scope);
  }

  // Auto-generate numeric student user ID
  if (!body.studentUserId) {
    body.studentUserId = await generateStudentUserId();
  }

  const student = await Student.create(body);
  // Fire-and-forget: create the student's own portal login account
  createStudentPortalUser(student);
  return student;
};

/**
 * Auto-create a per-student portal login account.
 *   Login ID : studentUserId (numeric, e.g. 100019)
 *   Password : guardian phone number (digits only)
 *   Role     : student — sees only their own records
 *
 * Idempotent: re-runs refresh the password and keep the account linked.
 */
const createStudentPortalUser = async (student) => {
  try {
    const phone = student.parent?.phone;
    if (!phone) return null; // no phone → no password → cannot create a login

    const studentUserId = student.studentUserId
      || await ensureStudentUserId(student._id, { organizationId: student.organizationId, branchId: student.branchId });
    if (!studentUserId) return null;

    const rawPassword = buildStudentPortalPassword(phone);
    if (rawPassword.length < 8) return null; // bcrypt minimum length

    // Synthetic, unique-per-student email so siblings sharing a phone each get an account
    const loginEmail = `${studentUserId}@student.portal`;
    const studentName = `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Student';

    if (await User.isEmailTaken(loginEmail)) {
      const existingUser = await User.findOne({ email: loginEmail });
      if (existingUser) {
        existingUser.password = rawPassword;
        existingUser.schoolRole = 'student';
        existingUser.linkedStudentIds = [student._id];
        await existingUser.save();
        await Student.findByIdAndUpdate(student._id, { parentUserId: existingUser._id });
        return existingUser;
      }
      return null;
    }

    const user = await User.create({
      name: studentName,
      email: loginEmail,
      password: rawPassword,
      organizationId: student.organizationId,
      businessType: 'school',
      schoolRole: 'student',
      linkedStudentIds: [student._id],
      systemRole: 'staff',
      onboardingComplete: true,
      isEmailVerified: true,
    });

    await Student.findByIdAndUpdate(student._id, { parentUserId: user._id });
    return user;
  } catch (_err) {
    // Portal user creation is best-effort; never fail the main student creation
    return null;
  }
};

const queryStudents = async (filter, options) => {
  return Student.paginate(filter, options);
};

const getStudentById = async (id, scope = {}) => {
  const doc = await Student.findOne({ _id: id, ...getTenantFilter(scope) })
    .populate('classId')
    .populate('sectionId');
  if (doc && !doc.studentUserId) {
    doc.studentUserId = await ensureStudentUserId(doc._id, scope);
  }
  return doc;
};

const updateStudentById = async (id, updateBody, scope = {}) => {
  const doc = await getStudentById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Student not found');
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteStudentById = async (id, scope = {}) => {
  const doc = await getStudentById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Student not found');

  const tenantFilter = getTenantFilter(scope);
  const studentId = doc._id;

  // Collect linked accounting references first so we can remove their transactions too.
  const [voucherRows, feeRows] = await Promise.all([
    FeeVoucher.find({ ...tenantFilter, studentId }).select('_id').lean(),
    SchoolFee.find({ ...tenantFilter, studentId }).select('_id').lean(),
  ]);
  const voucherIds = voucherRows.map((v) => v._id);
  const feeIds = feeRows.map((f) => f._id);

  await Promise.all([
    // Remove fee vouchers shown in vouchers/reports/dashboard receivables.
    FeeVoucher.deleteMany({ ...tenantFilter, studentId }),
    // Remove legacy school-fee rows shown in fee reports.
    SchoolFee.deleteMany({ ...tenantFilter, studentId }),
    // Remove wallet audit rows tied to this student.
    StudentCreditLedger.deleteMany({ ...tenantFilter, studentId }),
    // Remove student-dependent academic records.
    SchoolAttendance.deleteMany({ ...tenantFilter, studentId }),
    Mark.deleteMany({ ...tenantFilter, studentId }),
    // Remove any transaction rows produced by voucher/fee payments.
    SchoolTransaction.deleteMany({
      ...tenantFilter,
      $or: [
        ...(voucherIds.length ? [{ referenceModel: 'FeeVoucher', referenceId: { $in: voucherIds } }] : []),
        ...(feeIds.length ? [{ referenceModel: 'SchoolFee', referenceId: { $in: feeIds } }] : []),
        { referenceModel: 'Student', referenceId: studentId },
      ],
    }),
    // Keep parent-portal links consistent.
    User.updateMany({ linkedStudentIds: studentId }, { $pull: { linkedStudentIds: studentId } }),
  ]);

  await doc.deleteOne();
  return doc;
};

const getStudentsByClass = async (classId, scope = {}) => {
  return Student.find({ ...getTenantFilter(scope), classId, status: 'active' })
    .populate('sectionId')
    .lean();
};

/**
 * Bulk import students from parsed Excel rows.
 * Expected columns (case-insensitive): First Name, Last Name, Gender, Date of Birth, Class, Section, Parent Phone, Father Name
 */
const bulkImportStudents = async (rows, scope = {}) => {
  const { SchoolClass, Section, SchoolFee } = require('../models');
  const tenantFilter = getTenantFilter(scope);

  // Build lookup maps
  const classes = await SchoolClass.find(tenantFilter).lean();
  const classMap = Object.fromEntries(classes.map((c) => [c.name.toLowerCase().trim(), c._id.toString()]));

  const sections = await Section.find(tenantFilter).lean();
  // Map sections by "classId|sectionName" to handle same section name across different classes
  const sectionMap = {};
  for (const s of sections) {
    const key = `${s.classId.toString()}|${s.name.toLowerCase().trim()}`;
    sectionMap[key] = s._id.toString();
  }

  const results = { success: [], failed: [], totalRows: rows.length };

  const normalize = (obj, ...keys) => {
    for (const key of keys) {
      for (const k of Object.keys(obj)) {
        if (k.toLowerCase().replace(/\s+/g, '') === key.toLowerCase().replace(/\s+/g, '')) {
          return String(obj[k] ?? '').trim();
        }
      }
    }
    return '';
  };

  // Current month/year for fee records
  const now = new Date();
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const currentMonth = months[now.getMonth()];
  const currentYear = now.getFullYear();

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 because row 1 is headers

    try {
      const firstName = normalize(row, 'firstname', 'first name', 'FirstName');
      const lastName = normalize(row, 'lastname', 'last name', 'LastName');
      const genderRaw = normalize(row, 'gender').toLowerCase();
      const gender = ['male', 'female', 'other'].includes(genderRaw) ? genderRaw : null;
      const dobRaw = normalize(row, 'dateofbirth', 'date of birth', 'dob', 'birthdate');
      const className = normalize(row, 'class', 'classname', 'class name');
      const sectionName = normalize(row, 'section', 'sectionname');
      const phone = normalize(row, 'parentphone', 'parent phone', 'phone', 'contactnumber');
      const fatherName = normalize(row, 'fathername', 'father name', 'father');

      // Fee columns
      const monthlyFeeRaw = normalize(row, 'monthlyfee', 'monthly fee', 'tuitionfee', 'tuition fee', 'fee');
      const transportFeeRaw = normalize(row, 'transportfee', 'transport fee', 'transport');
      const admissionFeeRaw = normalize(row, 'admissionfee', 'admission fee');
      const discountRaw = normalize(row, 'discount');

      const errors = [];
      if (!firstName) errors.push('First Name is required');
      if (!gender) errors.push(`Gender must be male/female/other (got: "${genderRaw || 'empty'}")`);
      if (!className) errors.push('Class is required');

      const classId = classMap[className.toLowerCase()];
      if (className && !classId) errors.push(`Class "${className}" not found`);

      // Look up section by class+name combination
      const sectionKey = classId && sectionName ? `${classId}|${sectionName.toLowerCase()}` : null;
      const sectionId = sectionKey ? sectionMap[sectionKey] : undefined;
      if (sectionName && !sectionId) errors.push(`Section "${sectionName}" not found`);

      if (errors.length > 0) {
        results.failed.push({ row: rowNum, errors });
        continue;
      }

      // Parse fee values
      const monthlyFee = monthlyFeeRaw ? Number(monthlyFeeRaw) || 0 : 0;
      const transportFee = transportFeeRaw ? Number(transportFeeRaw) || 0 : 0;
      const admissionFee = admissionFeeRaw ? Number(admissionFeeRaw) || 0 : 0;
      const discount = discountRaw ? Number(discountRaw) || 0 : 0;

      const studentData = {
        firstName,
        lastName: lastName || '',
        gender,
        dateOfBirth: dobRaw ? new Date(dobRaw) : new Date(),
        classId,
        ...(sectionId ? { sectionId } : {}),
        parent: { phone: phone || '', fatherName: fatherName || '' },
        feeStructure: { monthlyFee, transportFee, admissionFee, discount },
        status: 'active',
        ...scope,
      };

      const student = await createStudent(studentData);

      // Create monthly fee record for the current month if monthlyFee > 0
      if (monthlyFee > 0) {
        try {
          await SchoolFee.create({
            organizationId: scope.organizationId,
            branchId: scope.branchId,
            createdBy: scope.createdBy,
            studentId: student._id,
            classId,
            feeType: 'monthly',
            amount: monthlyFee,
            discount,
            month: currentMonth,
            year: currentYear,
            dueDate: new Date(currentYear, now.getMonth(), 10),
            status: 'pending',
          });
        } catch {
          // Fee creation failure shouldn't fail the student import
        }
      }

      results.success.push({
        row: rowNum,
        admissionNumber: student.admissionNumber,
        rollNumber: student.rollNumber,
        name: `${firstName} ${lastName}`.trim(),
      });
    } catch (err) {
      results.failed.push({ row: rowNum, errors: [err.message] });
    }
  }

  return results;
};

/**
 * Full admission flow:
 *  1. Create the student record
 *  2. Auto-generate an admission FeeVoucher containing:
 *     - Admission Fee (one-time)
 *     - Current month's Monthly Fee
 *     - Transport Fee (if any)
 *     All minus the student discount
 *  3. Return { student, voucher }
 */
const admitStudent = async (body) => {
  // 1. Create student (handles admission#, roll#, parent portal user)
  const student = await createStudent(body);

  const scope = getTenantFilter(body);
  const fee = student.feeStructure || {};
  const admissionFee = fee.admissionFee || 0;
  const monthlyFee = fee.monthlyFee || 0;
  const transportFee = fee.transportFee || 0;
  const discount = fee.discount || 0;

  // Proration: if student admitted mid-month, charge only remaining days of monthly fee.
  // Enabled by passing prorateFee=true in the request body.
  const prorateFee = body.prorateFee === true || body.prorateFee === 'true';
  const admissionDate = body.admissionDate ? new Date(body.admissionDate) : new Date();

  let effectiveMonthlyFee = monthlyFee;
  let monthlyFeeLabel = 'Monthly Fee';
  if (prorateFee && monthlyFee > 0 && admissionDate.getDate() > 1) {
    const yr = admissionDate.getFullYear();
    const mo = admissionDate.getMonth();
    const totalDays = new Date(yr, mo + 1, 0).getDate(); // last day of admission month
    const remainingDays = totalDays - admissionDate.getDate() + 1;
    effectiveMonthlyFee = Math.ceil((remainingDays / totalDays) * monthlyFee);
    monthlyFeeLabel = `Monthly Fee (${remainingDays}/${totalDays} days)`;
  }

  // Build fee items from student's fee structure
  const feeItems = [];
  if (admissionFee > 0) {
    feeItems.push({ name: 'Admission Fee', amount: admissionFee });
  }
  if (effectiveMonthlyFee > 0) {
    feeItems.push({ name: monthlyFeeLabel, amount: effectiveMonthlyFee });
  }
  if (transportFee > 0) {
    feeItems.push({ name: 'Transport Fee', amount: transportFee });
  }

  let voucher = null;
  if (feeItems.length > 0) {
    const now = new Date();
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const currentMonth = months[now.getMonth()];
    const currentYear = now.getFullYear();
    const dueDate = new Date(currentYear, now.getMonth(), 10);
    // If due date already passed, set to end of month
    if (dueDate < now) {
      dueDate.setTime(new Date(currentYear, now.getMonth() + 1, 0).getTime());
    }

    try {
      voucher = await FeeVoucher.create({
        organizationId: scope.organizationId,
        branchId: scope.branchId,
        studentId: student._id,
        classId: student.classId,
        sectionId: student.sectionId || undefined,
        month: currentMonth,
        year: currentYear,
        feeItems,
        discount,
        dueDate,
        createdBy: body.createdBy,
      });
      // Re-fetch to populate
      voucher = await FeeVoucher.findById(voucher._id)
        .populate('studentId', 'firstName lastName admissionNumber rollNumber')
        .populate('classId', 'name')
        .populate('sectionId', 'name')
        .lean();
    } catch (_err) {
      // Voucher creation is non-critical — student is already saved
    }
  }

  // Populate student for response
  const populatedStudent = await Student.findById(student._id)
    .populate('classId')
    .populate('sectionId')
    .lean();

  return { student: populatedStudent, voucher };
};

/**
 * Check pending dues for a list of students (or all active students in a class).
 * Returns an array of { student, pendingCount, pendingAmount } objects.
 * A student is "cleared" if they have zero unpaid/partial/overdue vouchers.
 */
const checkStudentPendingFees = async (studentIds, scope = {}) => {
  // aggregate() does NOT auto-cast strings → ObjectId, so we must do it manually.
  const aggFilter = getAggregateFilter(scope);
  const objectIds = studentIds.map((id) => new mongoose.Types.ObjectId(id.toString()));

  const pendingAgg = await FeeVoucher.aggregate([
    {
      $match: {
        ...aggFilter,
        studentId: { $in: objectIds },
        status: { $in: ['unpaid', 'partial', 'overdue'] },
      },
    },
    {
      $group: {
        _id: '$studentId',
        pendingCount: { $sum: 1 },
        // outstanding = what the student still owes on each voucher
        pendingAmount: {
          $sum: {
            $max: [0, { $subtract: ['$netAmount', { $ifNull: ['$paidAmount', 0] }] }],
          },
        },
      },
    },
  ]);

  const pendingMap = {};
  for (const row of pendingAgg) {
    pendingMap[row._id.toString()] = {
      pendingCount: row.pendingCount,
      pendingAmount: Math.max(0, row.pendingAmount),
    };
  }

  return pendingMap;
};

/**
 * Promote students to a target class.
 * - Only promotes students whose IDs are in `studentIds`.
 * - If `forcePromote` is false (default), skips students with pending fees.
 * - Updates classId (and clears sectionId unless a targetSectionId is provided).
 * - Optionally regenerates roll numbers for the new class.
 * Returns { promoted: [], skipped: [], errors: [] }
 */
const promoteStudents = async ({ studentIds, targetClassId, targetSectionId, forcePromote = false }, scope = {}) => {
  const tenantFilter = getTenantFilter(scope);

  if (!studentIds || studentIds.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No students selected for promotion');
  }

  // Verify target class exists within tenant
  const targetClass = await SchoolClass.findOne({ _id: targetClassId, ...tenantFilter }).lean();
  if (!targetClass) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Target class not found');
  }

  // Load all selected students
  const students = await Student.find({
    _id: { $in: studentIds },
    ...tenantFilter,
    status: 'active',
  }).lean();

  if (students.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No active students found for the given IDs');
  }

  // Check pending fees for all selected students
  const pendingMap = await checkStudentPendingFees(studentIds, scope);

  const promoted = [];
  const skipped = [];
  const errors = [];

  for (const student of students) {
    const sid = student._id.toString();
    const pending = pendingMap[sid];

    if (!forcePromote && pending && pending.pendingAmount > 0) {
      skipped.push({
        studentId: sid,
        name: `${student.firstName} ${student.lastName || ''}`.trim(),
        admissionNumber: student.admissionNumber,
        pendingCount: pending.pendingCount,
        pendingAmount: pending.pendingAmount,
        reason: 'Has pending fees',
      });
      continue;
    }

    try {
      // Always update classId.
      // sectionId: if a target section was explicitly chosen, set it.
      //            if null was passed (no section selected), $unset it so it doesn't linger.
      const $set = { classId: targetClassId };
      const $unset = {};

      if (targetSectionId) {
        $set.sectionId = targetSectionId;
      } else {
        $unset.sectionId = '';
      }

      const updateOp = { $set };
      if (Object.keys($unset).length) updateOp.$unset = $unset;

      await Student.updateOne({ _id: student._id }, updateOp);

      promoted.push({
        studentId: sid,
        name: `${student.firstName} ${student.lastName || ''}`.trim(),
        admissionNumber: student.admissionNumber,
        previousClassId: student.classId,
        newClassId: targetClassId,
      });
    } catch (err) {
      errors.push({ studentId: sid, name: `${student.firstName} ${student.lastName || ''}`.trim(), error: err.message });
    }
  }

  return { promoted, skipped, errors, targetClass: targetClass.name };
};

/**
 * Get promotion eligibility report for all active students in a class.
 * Returns students with their pending fee info so the UI can display a clear breakdown.
 */
const getPromotionEligibility = async (classId, scope = {}) => {
  const tenantFilter = getTenantFilter(scope);

  const students = await Student.find({ ...tenantFilter, classId, status: 'active' })
    .populate('classId', 'name order')
    .populate('sectionId', 'name')
    .lean();

  if (students.length === 0) return [];

  const studentIds = students.map((s) => s._id.toString());
  const pendingMap = await checkStudentPendingFees(studentIds, scope);

  return students.map((s) => {
    const sid = s._id.toString();
    const pending = pendingMap[sid] || { pendingCount: 0, pendingAmount: 0 };
    return {
      ...s,
      pendingCount: pending.pendingCount,
      pendingAmount: pending.pendingAmount,
      isEligible: pending.pendingAmount === 0,
    };
  });
};

module.exports = {
  generateAdmissionNumber,
  generateRollNumber,
  generateStudentUserId,
  ensureStudentUserId,
  buildStudentPortalPassword,
  createStudentPortalUser,
  createStudent,
  admitStudent,
  queryStudents,
  getStudentById,
  updateStudentById,
  deleteStudentById,
  getStudentsByClass,
  bulkImportStudents,
  promoteStudents,
  getPromotionEligibility,
};
