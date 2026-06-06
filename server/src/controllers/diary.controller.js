const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { diaryService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getScope = (req) => ({
  organizationId: req.organizationId,
  branchId: req.branchId,
});

const createDiary = catchAsync(async (req, res) => {
  const body = { ...req.body, ...getBranchContext(req), createdBy: req.user.id };
  const doc = await diaryService.createDiary(body);
  res.status(httpStatus.CREATED).send(doc);
});

const getDiaries = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['classId', 'sectionId']);
  applyBranchFilter(filter, req);

  if (req.query.dateFrom || req.query.dateTo) {
    filter.date = {};
    if (req.query.dateFrom) filter.date.$gte = new Date(req.query.dateFrom);
    if (req.query.dateTo) {
      const end = new Date(req.query.dateTo);
      end.setHours(23, 59, 59, 999);
      filter.date.$lte = end;
    }
  }

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  if (!options.sortBy) options.sortBy = 'date:desc';
  options.populate = 'classId,sectionId';

  const result = await diaryService.queryDiaries(filter, options);
  res.send(result);
});

const getDiary = catchAsync(async (req, res) => {
  const doc = await diaryService.getDiaryById(req.params.id, getScope(req));
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Diary entry not found');
  res.send(doc);
});

const updateDiary = catchAsync(async (req, res) => {
  const doc = await diaryService.updateDiaryById(req.params.id, req.body, getScope(req));
  res.send(doc);
});

const deleteDiary = catchAsync(async (req, res) => {
  await diaryService.deleteDiaryById(req.params.id, getScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createDiary,
  getDiaries,
  getDiary,
  updateDiary,
  deleteDiary,
};
