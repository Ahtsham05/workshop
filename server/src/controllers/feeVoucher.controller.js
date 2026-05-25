const httpStatus = require('http-status');
const pick = require('../utils/pick');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { feeVoucherService, feeStructureService } = require('../services');
const { Student } = require('../models');

const createVoucher = catchAsync(async (req, res) => {
  const voucher = await feeVoucherService.createVoucher({
    ...req.body,
    organizationId: req.user.organizationId,
    branchId: req.branchId,
    createdBy: req.user._id,
  });
  res.status(httpStatus.CREATED).send(voucher);
});

/**
 * Bulk generate vouchers for all students in a class for a given month/year.
 * feeSource:
 *   'fee_structure'  — use the class-level fee structure (legacy, default)
 *   'admission_form' — use each student's individual fees set at admission
 *   'mixed'          — prefer student individual fees; fall back to fee structure
 */
const bulkGenerateVouchers = catchAsync(async (req, res) => {
  const { classId, feeStructureId, month, year, feeSource = 'fee_structure' } = req.body;
  const scope = {
    organizationId: req.user.organizationId,
    branchId: req.branchId,
    createdBy: req.user._id,
  };

  // Load the fee structure (required for 'fee_structure' and 'mixed'; optional for 'admission_form')
  let feeStructure = null;
  if (feeSource !== 'admission_form') {
    if (!feeStructureId) throw new ApiError(httpStatus.BAD_REQUEST, 'feeStructureId is required when feeSource is not admission_form');
    feeStructure = await feeStructureService.getFeeStructureById(feeStructureId, scope);
    if (!feeStructure) throw new ApiError(httpStatus.NOT_FOUND, 'Fee structure not found');
  } else if (feeStructureId) {
    // Optional fallback even in admission_form mode
    feeStructure = await feeStructureService.getFeeStructureById(feeStructureId, scope).catch(() => null);
  }

  // Load all active students in this class (always include feeStructure field)
  const students = await Student.find({
    organizationId: scope.organizationId,
    branchId: scope.branchId,
    classId,
    status: 'active',
  })
    .select('_id sectionId classId feeStructure creditBalance')
    .lean();

  if (!students.length) throw new ApiError(httpStatus.BAD_REQUEST, 'No active students found in this class');

  const result = await feeVoucherService.bulkGenerateVouchersV2(students, feeStructure, month, year, scope, feeSource);

  res.status(httpStatus.CREATED).send({
    message: `Vouchers generated successfully`,
    generated: result.insertedCount ?? 0,
    skipped: result.skipped ?? 0,
    skippedDuplicates: result.skippedDuplicates ?? 0,
    autoAppliedCount: result.autoAppliedCount ?? 0,
    autoAppliedAmount: result.autoAppliedAmount ?? 0,
    total: students.length,
  });
});

const getVouchers = catchAsync(async (req, res) => {
  // Self-heal old data: remove vouchers whose student record is already deleted.
  await feeVoucherService.cleanupOrphanVouchers({
    organizationId: req.user.organizationId,
    branchId: req.branchId,
  });

  const filter = {
    organizationId: req.user.organizationId,
    branchId: req.branchId,
  };

  if (req.query.classId) filter.classId = req.query.classId;
  if (req.query.studentId) filter.studentId = req.query.studentId;
  if (req.query.examId) filter.examId = req.query.examId;
  if (req.query.voucherType) filter.voucherType = req.query.voucherType;
  if (req.query.month) filter.month = req.query.month;
  if (req.query.year) filter.year = parseInt(req.query.year, 10);
  if (req.query.status) filter.status = req.query.status;

  // Name / admission-number search: resolve matching studentIds first
  if (req.query.search && req.query.search.trim()) {
    const term = req.query.search.trim();
    const regex = new RegExp(term, 'i');
    const termParts = term.split(/\s+/).filter(Boolean);
    const fullNameClauses = [];
    if (termParts.length >= 2) {
      const first = new RegExp(termParts[0], 'i');
      const last = new RegExp(termParts.slice(1).join(' '), 'i');
      fullNameClauses.push({ $and: [{ firstName: first }, { lastName: last }] });
      fullNameClauses.push({ $and: [{ firstName: last }, { lastName: first }] });
    }
    const matchingStudents = await Student.find({
      organizationId: req.user.organizationId,
      branchId: req.branchId,
      $or: [
        { firstName: regex },
        { lastName: regex },
        { admissionNumber: regex },
        { rollNumber: regex },
        { 'parent.phone': regex },
        { 'parent.guardianName': regex },
        { 'parent.fatherName': regex },
        ...fullNameClauses,
      ],
    }).select('_id').lean();
    filter.studentId = { $in: matchingStudents.map((s) => s._id) };
  }

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  if (!options.sortBy) options.sortBy = 'createdAt:desc';

  const result = await feeVoucherService.queryVouchers(filter, options);
  res.send(result);
});

const getVoucher = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const voucher = await feeVoucherService.getVoucherById(req.params.voucherId, scope);
  if (!voucher) return res.status(httpStatus.NOT_FOUND).send({ message: 'Voucher not found' });
  res.send(voucher);
});

const getStudentVouchers = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const vouchers = await feeVoucherService.getStudentVouchers(req.params.studentId, scope);
  res.send(vouchers);
});

const getStudentFeeSummary = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const summary = await feeVoucherService.getStudentFeeSummary(req.params.studentId, scope);
  res.send(summary);
});

const getStudentFeeLedger = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const result = await feeVoucherService.getStudentFeeLedger(req.params.studentId, scope);
  res.send(result);
});

const payVoucher = catchAsync(async (req, res) => {
  const scope = {
    organizationId: req.user.organizationId,
    branchId: req.branchId,
    createdBy: req.user._id,
  };
  const voucher = await feeVoucherService.payVoucher(req.params.voucherId, req.body, scope);
  res.send(voucher);
});

const updateVoucher = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const voucher = await feeVoucherService.updateVoucherById(req.params.voucherId, req.body, scope);
  res.send(voucher);
});

const deleteVoucher = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  await feeVoucherService.deleteVoucherById(req.params.voucherId, scope);
  res.status(httpStatus.NO_CONTENT).send();
});

/**
 * Get vouchers formatted for print (populated, ready for PDF/print UI)
 */
const getVouchersForPrint = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const { ids } = req.body;
  const vouchers = await feeVoucherService.getVouchersForPrint(ids, scope);
  res.send(vouchers);
});

/**
 * Dashboard stats for fee vouchers
 */
const getDashboardStats = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const { month, year } = req.query;
  const stats = await feeVoucherService.getDashboardStats(scope, month, year ? parseInt(year, 10) : undefined);
  res.send(stats);
});

/**
 * Pay all pending vouchers for a student with a single lump-sum amount (oldest first).
 */
const bulkPayStudentVouchers = catchAsync(async (req, res) => {
  const scope = {
    organizationId: req.user.organizationId,
    branchId: req.branchId,
    createdBy: req.user._id,
  };
  const result = await feeVoucherService.bulkPayStudentVouchers(
    req.params.studentId,
    req.body,
    scope
  );
  res.send(result);
});

/**
 * Reconcile stale vouchers (netAmount=0 or no voucherNumber) by re-saving each one.
 */
const reconcileVouchers = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const result = await feeVoucherService.reconcileVouchers(scope);
  res.send({ message: `Reconcile complete. Fixed: ${result.fixed}, Failed: ${result.failed}`, ...result });
});

/**
 * Record an advance payment — adds to student credit wallet (no voucher required).
 */
const recordAdvancePayment = catchAsync(async (req, res) => {
  const scope = {
    organizationId: req.user.organizationId,
    branchId: req.branchId,
    createdBy: req.user._id,
  };
  const result = await feeVoucherService.recordAdvancePayment(req.params.studentId, req.body, scope);
  res.status(httpStatus.CREATED).send(result);
});

/**
 * Get a student's credit wallet transaction history.
 */
const getStudentCreditHistory = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const options = { page: req.query.page || 1, limit: req.query.limit || 20 };
  const result = await feeVoucherService.getStudentCreditHistory(req.params.studentId, scope, options);
  res.send(result);
});

/**
 * Batch fetch total outstanding + credit balance for a list of studentIds.
 * Accepts ?ids=...&month=April&year=2026 to split this-month vs arrears.
 */
const getStudentBalances = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const rawIds = (req.query.ids || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!rawIds.length) return res.send({});
  const result = await feeVoucherService.getStudentBalances(
    rawIds, scope, req.query.month, req.query.year
  );
  res.send(result);
});

/**
 * Org-level receivable summary for the stats header.
 * GET /fee-vouchers/receivable-summary?month=April&year=2026
 */
const getReceivableSummary = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const { month, year } = req.query;
  const result = await feeVoucherService.getReceivableSummary(scope, month, year ? Number(year) : undefined);
  res.send(result);
});

/**
 * Yearly fee report — class-wise student fee payment breakdown.
 * GET /fee-vouchers/yearly-report?year=2026&classId=optional
 */
const getYearlyFeeReport = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const { year, classId } = req.query;
  const result = await feeVoucherService.getYearlyFeeReport(scope, year || new Date().getFullYear(), classId);
  res.send(result);
});

const bulkGenerateExamVouchers = catchAsync(async (req, res) => {
  const scope = {
    organizationId: req.user.organizationId,
    branchId: req.branchId,
    createdBy: req.user._id,
  };
  const { examId, amount, dueDate } = req.body;
  const result = await feeVoucherService.bulkGenerateExamVouchers(examId, scope, { amount, dueDate });
  res.status(httpStatus.CREATED).send({
    message: 'Exam fee vouchers generated',
    ...result,
  });
});

module.exports = {
  createVoucher,
  bulkGenerateVouchers,
  bulkGenerateExamVouchers,
  getVouchers,
  getVoucher,
  getStudentVouchers,
  getStudentFeeSummary,
  getStudentFeeLedger,
  payVoucher,
  bulkPayStudentVouchers,
  recordAdvancePayment,
  getStudentCreditHistory,
  getStudentBalances,
  getReceivableSummary,
  getYearlyFeeReport,
  updateVoucher,
  deleteVoucher,
  getVouchersForPrint,
  getDashboardStats,
  reconcileVouchers,
};
