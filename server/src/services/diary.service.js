const httpStatus = require('http-status');
const { Diary } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (scope = {}) => {
  const filter = {};
  if (scope.organizationId) filter.organizationId = scope.organizationId;
  if (scope.branchId) filter.branchId = scope.branchId;
  return filter;
};

const dayRange = (value) => {
  const start = new Date(value);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const createDiary = async (body) => Diary.create(body);

const queryDiaries = async (filter, options) => Diary.paginate(filter, options);

/**
 * List diary entries for a class (and optional section), newest first.
 * A diary with sectionId=null is visible to the whole class; one with a
 * sectionId is only included when it matches the requested section.
 */
const getDiariesForClass = async ({ classId, sectionId, from, to, limit = 60 }, scope = {}) => {
  const filter = { ...getTenantFilter(scope), classId };

  if (sectionId) {
    filter.$or = [{ sectionId: null }, { sectionId }];
  }

  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }

  return Diary.find(filter)
    .populate('items.subjectId', 'name')
    .sort({ date: -1 })
    .limit(limit)
    .lean();
};

const getDiaryById = async (id, scope = {}) =>
  Diary.findOne({ _id: id, ...getTenantFilter(scope) })
    .populate('classId', 'name')
    .populate('sectionId', 'name')
    .populate('items.subjectId', 'name');

const updateDiaryById = async (id, updateBody, scope = {}) => {
  const doc = await getDiaryById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Diary entry not found');
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteDiaryById = async (id, scope = {}) => {
  const doc = await Diary.findOne({ _id: id, ...getTenantFilter(scope) });
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Diary entry not found');
  await doc.deleteOne();
  return doc;
};

module.exports = {
  createDiary,
  queryDiaries,
  getDiariesForClass,
  getDiaryById,
  updateDiaryById,
  deleteDiaryById,
  dayRange,
};
