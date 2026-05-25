const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Exam, Mark, FeeVoucher, SchoolTransaction, StudentCreditLedger } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = data.organizationId;
  if (data.branchId) filter.branchId = data.branchId;
  return filter;
};

const createExam = async (body) => {
  const { classIds, classId, ...examData } = body;
  const ids = classIds?.length ? classIds : classId ? [classId] : [];

  if (!ids.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'At least one class is required');
  }

  const payload = { ...examData, type: examData.type || 'other' };
  const createOne = (id) => Exam.create({ ...payload, classId: id });

  if (ids.length === 1) {
    return createOne(ids[0]);
  }

  const results = await Promise.all(ids.map(createOne));
  return { results, total: results.length };
};

const queryExams = async (filter, options) => {
  // paginate plugin supports array of populate objects for nested paths
  const populateOptions = [
    { path: 'classId', select: 'name' },
    { path: 'subjects.subjectId', select: 'name code' },
  ];
  options.populate = populateOptions;
  return Exam.paginate(filter, options);
};

const getExamById = async (id, scope = {}) => {
  return Exam.findOne({ _id: id, ...getTenantFilter(scope) })
    .populate('classId', 'name')
    .populate({ path: 'subjects.subjectId', select: 'name code' });
};

const updateExamById = async (id, updateBody, scope = {}) => {
  const doc = await getExamById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Exam not found');
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const toObjectIds = (ids) =>
  (Array.isArray(ids) ? ids : [ids])
    .filter(Boolean)
    .map((id) => (id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(id)));

/**
 * Remove all data linked to one or more exams: marks, exam fee vouchers,
 * and related accounting rows. Roll slips are generated on print only — nothing to delete.
 */
const deleteExamLinkedData = async (examIds, scope = {}) => {
  const tf = getTenantFilter(scope);
  const ids = toObjectIds(examIds);
  if (!ids.length) {
    return { deletedMarks: 0, deletedVouchers: 0, deletedTransactions: 0, deletedLedgerRows: 0 };
  }

  const [marksResult, examVouchers] = await Promise.all([
    Mark.deleteMany({ ...tf, examId: { $in: ids } }),
    FeeVoucher.find({ ...tf, examId: { $in: ids } }).select('_id transactionId').lean(),
  ]);

  const voucherIds = examVouchers.map((v) => v._id);
  const transactionIds = examVouchers.map((v) => v.transactionId).filter(Boolean);

  let deletedVouchers = 0;
  let deletedTransactions = 0;
  let deletedLedgerRows = 0;

  if (voucherIds.length) {
    const [txnByRef, txnById, ledger, vouchers] = await Promise.all([
      SchoolTransaction.deleteMany({
        ...tf,
        referenceModel: 'FeeVoucher',
        referenceId: { $in: voucherIds },
      }),
      transactionIds.length
        ? SchoolTransaction.deleteMany({ ...tf, _id: { $in: transactionIds } })
        : Promise.resolve({ deletedCount: 0 }),
      StudentCreditLedger.deleteMany({ ...tf, voucherId: { $in: voucherIds } }),
      FeeVoucher.deleteMany({ ...tf, _id: { $in: voucherIds } }),
    ]);
    deletedTransactions = (txnByRef.deletedCount || 0) + (txnById.deletedCount || 0);
    deletedLedgerRows = ledger.deletedCount || 0;
    deletedVouchers = vouchers.deletedCount || 0;
  }

  return {
    deletedMarks: marksResult.deletedCount || 0,
    deletedVouchers,
    deletedTransactions,
    deletedLedgerRows,
  };
};

const deleteExamById = async (id, scope = {}) => {
  const doc = await getExamById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Exam not found');
  const linked = await deleteExamLinkedData([id], scope);
  await doc.deleteOne();
  return { deleted: 1, ...linked };
};

const bulkDeleteExams = async (ids, scope = {}) => {
  const filter = { _id: { $in: ids }, ...getTenantFilter(scope) };
  const linked = await deleteExamLinkedData(ids, scope);
  const result = await Exam.deleteMany(filter);
  return { deleted: result.deletedCount, ...linked };
};

const bulkUpdateExams = async (ids, updateBody, scope = {}) => {
  const filter = { _id: { $in: ids }, ...getTenantFilter(scope) };
  const payload = { ...updateBody };
  if (payload.startDate === '') payload.startDate = null;
  if (payload.endDate === '') payload.endDate = null;
  const result = await Exam.updateMany(filter, { $set: payload });
  return { updated: result.modifiedCount };
};

module.exports = {
  createExam,
  queryExams,
  getExamById,
  updateExamById,
  deleteExamById,
  bulkUpdateExams,
  bulkDeleteExams,
};
