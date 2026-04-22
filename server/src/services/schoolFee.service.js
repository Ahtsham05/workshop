const httpStatus = require('http-status');
const { SchoolFee, SchoolTransaction, FeeCategory } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = data.organizationId;
  if (data.branchId) filter.branchId = data.branchId;
  return filter;
};

const createFee = async (body) => {
  return SchoolFee.create(body);
};

const createBulkFees = async (records, context) => {
  const docs = records.map((r) => ({
    ...r,
    organizationId: context.organizationId,
    branchId: context.branchId,
    createdBy: context.createdBy,
  }));
  return SchoolFee.insertMany(docs);
};

const queryFees = async (filter, options) => {
  return SchoolFee.paginate(filter, options);
};

const getFeeById = async (id, scope = {}) => {
  return SchoolFee.findOne({ _id: id, ...getTenantFilter(scope) })
    .populate('studentId')
    .populate('classId');
};

const getStudentFees = async (studentId, scope = {}) => {
  return SchoolFee.find({ ...getTenantFilter(scope), studentId })
    .populate('classId')
    .sort({ createdAt: -1 })
    .lean();
};

const getOverdueFees = async (scope = {}) => {
  return SchoolFee.find({
    ...getTenantFilter(scope),
    status: { $in: ['pending', 'overdue'] },
    dueDate: { $lt: new Date() },
  })
    .populate('studentId')
    .populate('classId')
    .lean();
};

const payFee = async (id, paymentData, scope = {}) => {
  const fee = await getFeeById(id, scope);
  if (!fee) throw new ApiError(httpStatus.NOT_FOUND, 'Fee not found');

  fee.paidAmount = (fee.paidAmount || 0) + paymentData.amount;
  fee.paymentMethod = paymentData.paymentMethod || fee.paymentMethod;
  fee.paidDate = new Date();

  if (fee.paidAmount >= fee.netAmount) {
    fee.status = 'paid';
  } else if (fee.paidAmount > 0) {
    fee.status = 'partial';
  }

  await fee.save();

  // Record in unified school transaction ledger
  try {
    const tenantFilter = getTenantFilter(scope);
    let categoryId = paymentData.categoryId;
    if (!categoryId) {
      const cat = await FeeCategory.findOne({ ...tenantFilter, name: 'Tuition Fee', type: 'INCOME' }).lean();
      categoryId = cat?._id;
    }
    if (categoryId) {
      await SchoolTransaction.create({
        organizationId: scope.organizationId,
        branchId: scope.branchId,
        type: 'INCOME',
        categoryId,
        amount: paymentData.amount,
        date: new Date(),
        referenceId: fee._id,
        referenceModel: 'SchoolFee',
        description: `Fee payment — ${fee.month || ''} ${fee.year || ''} | ${fee.feeType}`,
        paymentMethod: paymentData.paymentMethod || 'cash',
        createdBy: scope.createdBy,
      });
    }
  } catch (_err) {
    // Transaction recording is non-critical; do not fail the payment
  }

  return fee;
};

const updateFeeById = async (id, updateBody, scope = {}) => {
  const doc = await getFeeById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Fee not found');
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteFeeById = async (id, scope = {}) => {
  const doc = await getFeeById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Fee not found');
  await doc.deleteOne();
  return doc;
};

module.exports = {
  createFee,
  createBulkFees,
  queryFees,
  getFeeById,
  getStudentFees,
  getOverdueFees,
  payFee,
  updateFeeById,
  deleteFeeById,
};
