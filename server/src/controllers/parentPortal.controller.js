/**
 * Parent Portal Controller
 * All endpoints are scoped to the logged-in parent's linked children.
 */
const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { Student, Mark, SchoolAttendance, FeeVoucher, Exam, BankAccount, Branch } = require('../models');
const { schoolReportService, diaryService, feePaymentRequestService } = require('../services');
const { uploadToCloudinary } = require('../middlewares/upload');

/** Resolve a single linked student doc the caller is allowed to view. */
const getOwnedStudent = async (req, studentId, fields = '') => {
  const ids = getLinkedStudentIds(req);
  assertHasStudents(ids);
  const targetId = studentId ? String(studentId) : ids[0];
  if (!targetId || !ids.includes(targetId)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }
  const student = await Student.findOne({ _id: targetId, ...getScope(req) })
    .select(fields)
    .lean();
  if (!student) throw new ApiError(httpStatus.NOT_FOUND, 'Student not found');
  return student;
};

const getScope = (req) => {
  // Portal users (parent/student) are scoped to the organization, not a single
  // branch — they send no x-branch-id header. Omit undefined values so the
  // query never accidentally filters on { branchId: undefined } (which Mongoose
  // treats as null and would exclude every real student).
  const scope = {};
  if (req.organizationId) scope.organizationId = req.organizationId;
  if (req.branchId) scope.branchId = req.branchId;
  return scope;
};

/**
 * Return the list of studentIds this parent owns.
 */
const getLinkedStudentIds = (req) => {
  const ids = req.user.linkedStudentIds || [];
  return ids.map ? ids.map(String) : [String(ids)];
};

const assertHasStudents = (ids) => {
  if (!ids.length) throw new ApiError(httpStatus.FORBIDDEN, 'No students linked to this parent account');
};

/** GET /parent-portal/children — full student profiles */
const getMyChildren = catchAsync(async (req, res) => {
  const studentIds = getLinkedStudentIds(req);
  assertHasStudents(studentIds);

  const scope = getScope(req);
  const students = await Student.find({ ...scope, _id: { $in: studentIds } })
    .populate('classId', 'name')
    .populate('sectionId', 'name')
    .lean();
  res.send(students);
});

/** GET /parent-portal/results?studentId=&examId= */
const getMyChildResults = catchAsync(async (req, res) => {
  const studentIds = getLinkedStudentIds(req);
  assertHasStudents(studentIds);

  const { studentId, examId } = req.query;
  if (studentId && !studentIds.includes(String(studentId))) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }

  const scope = getScope(req);
  const filter = { ...scope, studentId: studentId ? studentId : { $in: studentIds } };
  if (examId) filter.examId = examId;

  const marks = await Mark.find(filter)
    .populate('subjectId', 'name code')
    .populate('examId', 'name type startDate totalMarks passingMarks')
    .sort({ createdAt: -1 })
    .lean();
  res.send(marks);
});

/** GET /parent-portal/attendance?studentId= */
const getMyChildAttendance = catchAsync(async (req, res) => {
  const studentIds = getLinkedStudentIds(req);
  assertHasStudents(studentIds);

  const { studentId } = req.query;
  if (studentId && !studentIds.includes(String(studentId))) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }

  const scope = getScope(req);
  const filter = { ...scope, studentId: studentId ? studentId : { $in: studentIds } };
  if (req.query.from || req.query.to) {
    filter.date = {};
    if (req.query.from) filter.date.$gte = new Date(req.query.from);
    if (req.query.to) filter.date.$lte = new Date(req.query.to);
  }

  const records = await SchoolAttendance.find(filter)
    .populate('studentId', 'firstName lastName admissionNumber')
    .sort({ date: -1 })
    .limit(365)
    .lean();
  res.send(records);
});

/** GET /parent-portal/fees?studentId= */
const getMyChildFees = catchAsync(async (req, res) => {
  const studentIds = getLinkedStudentIds(req);
  assertHasStudents(studentIds);

  const { studentId } = req.query;
  if (studentId && !studentIds.includes(String(studentId))) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }

  const scope = getScope(req);
  const filter = { ...scope, studentId: studentId ? studentId : { $in: studentIds } };

  const vouchers = await FeeVoucher.find(filter)
    .populate('studentId', 'firstName lastName admissionNumber')
    .sort({ dueDate: -1 })
    .lean();

  // Normalize FeeVoucher shape so the parent portal UI can keep using:
  // - f.amount
  // - f.paidAmount
  // - f.status (pending/paid/partial/overdue)
  // - f.dueDate
  const effectiveNetAmount = (v) => {
    if (v.netAmount && v.netAmount > 0) return v.netAmount;
    const sumItems = (v.feeItems || []).reduce((s, fi) => s + (fi.amount || 0), 0);
    return Math.max(0, sumItems - (v.discount || 0) + (v.fine || 0));
  };

  const normalized = vouchers.map((v) => {
    const amount = effectiveNetAmount(v);
    const status =
      v.status === 'unpaid' ? 'pending' :
        // FeeVoucher already uses partial/overdue/paid as-is
        v.status === 'pending' ? 'pending' :
          v.status;

    // Expose the full fee breakdown so the portal can show month + funds.
    const feeItems = (v.feeItems || []).map((fi) => ({
      name: fi.name,
      amount: fi.amount || 0,
    }));

    const typeLabel =
      v.voucherType === 'exam' ? 'Exam Fee' :
      v.voucherType === 'admission' ? 'Admission Fee' :
      v.voucherType === 'misc' ? 'Other Fee' :
      'Monthly Fee';

    return {
      id: v._id,
      voucherNumber: v.voucherNumber || null,
      month: v.month || null,
      year: v.year || null,
      // Human label e.g. "June 2026"
      period: v.month && v.year ? `${v.month} ${v.year}` : (v.month || ''),
      voucherType: v.voucherType || 'monthly',
      typeLabel,
      feeItems,
      discount: v.discount || 0,
      fine: v.fine || 0,
      amount,
      paidAmount: v.paidAmount || 0,
      status,
      dueDate: v.dueDate || null,
      paidDate: v.paidDate || null,
      // Back-compat fields the older UI relied on
      feeType: v.voucherType || 'tuition',
      description: v.month && v.year ? `${typeLabel} — ${v.month} ${v.year}` : typeLabel,
    };
  });

  res.send(normalized);
});

/** GET /parent-portal/exams?studentId= — exams for the student's class */
const getMyChildExams = catchAsync(async (req, res) => {
  const student = await getOwnedStudent(req, req.query.studentId, 'classId');
  const exams = await Exam.find({ ...getScope(req), classId: student.classId })
    .select('name type startDate endDate totalMarks status')
    .sort({ startDate: -1, createdAt: -1 })
    .lean();
  res.send(exams);
});

/** GET /parent-portal/diary?studentId=&from=&to= — daily diary for the student's class */
const getMyChildDiary = catchAsync(async (req, res) => {
  const student = await getOwnedStudent(req, req.query.studentId, 'classId sectionId');
  const diaries = await diaryService.getDiariesForClass(
    {
      classId: student.classId,
      sectionId: student.sectionId,
      from: req.query.from,
      to: req.query.to,
    },
    getScope(req),
  );
  res.send(diaries);
});

/** GET /parent-portal/report/:studentId — full progress report */
const getMyChildReport = catchAsync(async (req, res) => {
  const studentIds = getLinkedStudentIds(req);
  assertHasStudents(studentIds);

  if (!studentIds.includes(String(req.params.studentId))) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }

  const report = await schoolReportService.getStudentProgressReport(
    req.params.studentId,
    getScope(req),
    req.query.examId || null
  );
  if (!report) throw new ApiError(httpStatus.NOT_FOUND, 'Student not found');
  res.send(report);
});

/** GET /parent-portal/bank-accounts — school accounts a parent can transfer fees to */
const getBankAccounts = catchAsync(async (req, res) => {
  // Primary source: bank accounts configured on the student's own branch(es).
  const studentIds = getLinkedStudentIds(req);
  let branchAccounts = [];
  if (studentIds.length) {
    const students = await Student.find({ ...getScope(req), _id: { $in: studentIds } })
      .select('branchId')
      .lean();
    const branchIds = [...new Set(students.map((s) => String(s.branchId)).filter(Boolean))];
    if (branchIds.length) {
      const branches = await Branch.find({ _id: { $in: branchIds } })
        .select('name bankAccounts')
        .lean();
      branches.forEach((b) => {
        (b.bankAccounts || [])
          .filter((acc) => acc.isActive !== false && (acc.accountNumber || acc.iban))
          .forEach((acc) => {
            branchAccounts.push({
              id: String(acc._id),
              name: acc.accountTitle || b.name,
              bankName: acc.bankName || '',
              accountNumber: acc.accountNumber || acc.iban || '',
              iban: acc.iban || '',
              branchName: acc.instructions || b.name,
              accountType: 'bank',
            });
          });
      });
    }
  }

  if (branchAccounts.length) {
    return res.send(branchAccounts);
  }

  // Fallback: legacy organization-level bank accounts from the accounts module.
  const accounts = await BankAccount.find({
    organizationId: req.organizationId,
    isActive: true,
    accountType: { $in: ['bank', 'mobile_wallet'] },
  })
    .select('name bankName accountNumber branchName accountType')
    .lean();
  res.send(accounts);
});

/** GET /parent-portal/payment-requests?studentId= — the family's own submissions */
const getMyPaymentRequests = catchAsync(async (req, res) => {
  const studentIds = getLinkedStudentIds(req);
  assertHasStudents(studentIds);
  const { studentId } = req.query;
  if (studentId && !studentIds.includes(String(studentId))) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Access denied');
  }
  const targetIds = studentId ? [studentId] : studentIds;
  const requests = await feePaymentRequestService.listForStudents(targetIds, getScope(req));
  res.send(requests);
});

/** POST /parent-portal/payment-requests — submit proof-of-payment for vouchers */
const createPaymentRequest = catchAsync(async (req, res) => {
  const student = await getOwnedStudent(req, req.body.studentId, '_id branchId');

  let voucherIds = req.body.voucherIds;
  if (typeof voucherIds === 'string') {
    try {
      voucherIds = JSON.parse(voucherIds);
    } catch {
      voucherIds = voucherIds.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }

  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Payment screenshot is required');
  }
  const uploaded = await uploadToCloudinary(req.file.buffer, { folder: 'fee-payments' });

  const request = await feePaymentRequestService.createRequest(
    {
      studentId: student._id,
      voucherIds,
      bankAccountId: req.body.bankAccountId || undefined,
      bankAccountLabel: req.body.bankAccountLabel,
      senderName: req.body.senderName,
      transactionRef: req.body.transactionRef,
      note: req.body.note,
      screenshot: { url: uploaded.secure_url, publicId: uploaded.public_id },
    },
    { ...getScope(req), branchId: student.branchId, submittedBy: req.user.id },
  );

  res.status(httpStatus.CREATED).send(request);
});

module.exports = {
  getMyChildren,
  getMyChildResults,
  getMyChildAttendance,
  getMyChildFees,
  getMyChildReport,
  getMyChildExams,
  getMyChildDiary,
  getBankAccounts,
  getMyPaymentRequests,
  createPaymentRequest,
};
