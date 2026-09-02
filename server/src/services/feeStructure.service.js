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
  const { classIds, classId, ...rest } = body;
  const ids = classIds?.length ? classIds : classId ? [classId] : [];
  if (!ids.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'At least one class is required');
  }

  // A class can have several simultaneously-active fund-specific structures (e.g. a
  // "Standard Fee Structure" for tuition alongside a separate "Paper Fund"), so only
  // skip a class when it already has an active structure with this SAME name — that's
  // the actual duplicate to guard against, not "any" active structure for the class.
  const name = (rest.name || 'Standard Fee Structure').trim();
  const existing = await FeeStructure.find({
    ...getTenantFilter(rest),
    classId: { $in: ids },
    isActive: true,
    name,
  }).select('classId');
  const blocked = new Set(existing.map((doc) => String(doc.classId)));
  const targetIds = ids.filter((id) => !blocked.has(String(id)));
  const skippedCount = ids.length - targetIds.length;

  if (!targetIds.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, `All selected classes already have an active "${name}" structure`);
  }

  const createOne = (id) => FeeStructure.create({ ...rest, classId: id });
  if (targetIds.length === 1 && !skippedCount) {
    return createOne(targetIds[0]);
  }

  const results = await Promise.all(targetIds.map(createOne));
  return { results, total: results.length, skippedCount };
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
