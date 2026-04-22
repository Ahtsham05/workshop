const httpStatus = require('http-status');
const { FeeStructure } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = scope.organizationId;
  if (scope.branchId) filter.branchId = scope.branchId;
  return filter;
};

const createFeeStructure = async (body) => {
  return FeeStructure.create(body);
};

const queryFeeStructures = async (filter, options) => {
  return FeeStructure.paginate(filter, {
    ...options,
    populate: 'classId',
  });
};

const getFeeStructureById = async (id, scope = {}) => {
  return FeeStructure.findOne({ _id: id, ...getTenantFilter(scope) })
    .populate('classId')
    .populate('feeItems.categoryId');
};

const getFeeStructureByClass = async (classId, scope = {}) => {
  return FeeStructure.findOne({
    ...getTenantFilter(scope),
    classId,
    isActive: true,
  })
    .populate('classId')
    .populate('feeItems.categoryId');
};

const updateFeeStructureById = async (id, updateBody, scope = {}) => {
  const doc = await getFeeStructureById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Fee structure not found');
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteFeeStructureById = async (id, scope = {}) => {
  const doc = await getFeeStructureById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Fee structure not found');
  await doc.deleteOne();
  return doc;
};

module.exports = {
  createFeeStructure,
  queryFeeStructures,
  getFeeStructureById,
  getFeeStructureByClass,
  updateFeeStructureById,
  deleteFeeStructureById,
};
