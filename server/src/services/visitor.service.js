const httpStatus = require('http-status');
const { Visitor } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (scope = {}) => {
  const f = {};
  if (scope.organizationId) f.organizationId = scope.organizationId;
  if (scope.branchId) f.branchId = scope.branchId;
  return f;
};

/**
 * Check if a visitor with the same phone already exists in this branch.
 */
const isDuplicate = async (phone, scope = {}, excludeId = null) => {
  const query = { ...getTenantFilter(scope), phone };
  if (excludeId) query._id = { $ne: excludeId };
  return Visitor.exists(query);
};

const createVisitor = async (body) => {
  return Visitor.create(body);
};

const queryVisitors = async (filter, options) => {
  return Visitor.paginate(filter, options);
};

const getVisitorById = async (id, scope = {}) => {
  return Visitor.findOne({ _id: id, ...getTenantFilter(scope) });
};

const updateVisitorById = async (id, updateBody, scope = {}) => {
  const doc = await getVisitorById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Visitor not found');

  // Auto-stamp convertedAt when status is set to 'converted'
  if (updateBody.status === 'converted' && !doc.convertedAt) {
    updateBody.convertedAt = updateBody.convertedAt || new Date();
  }

  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteVisitorById = async (id, scope = {}) => {
  const doc = await getVisitorById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Visitor not found');
  await doc.deleteOne();
  return doc;
};

/**
 * Add a follow-up note and optionally update status + nextFollowUpDate.
 * Uses findOneAndUpdate with $push for atomicity — avoids full-document
 * save validation which could fail on unrelated required fields.
 */
const addFollowUp = async (id, followUpData, scope = {}) => {
  const exists = await getVisitorById(id, scope);
  if (!exists) throw new ApiError(httpStatus.NOT_FOUND, 'Visitor not found');

  const setFields = {};
  if (followUpData.statusAfter) setFields.status = followUpData.statusAfter;
  if (followUpData.nextFollowUpDate) setFields.nextFollowUpDate = followUpData.nextFollowUpDate;

  const subdoc = {
    note: followUpData.note,
    doneBy: followUpData.doneBy,
    doneAt: followUpData.doneAt || new Date(),
  };
  if (followUpData.statusAfter) subdoc.statusAfter = followUpData.statusAfter;
  if (followUpData.nextFollowUpDate) subdoc.nextFollowUpDate = followUpData.nextFollowUpDate;

  const doc = await Visitor.findOneAndUpdate(
    { _id: id, ...getTenantFilter(scope) },
    {
      $push: { followUps: subdoc },
      ...(Object.keys(setFields).length > 0 ? { $set: setFields } : {}),
    },
    { new: true, runValidators: false }
  );

  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Visitor not found');
  return doc;
};

/**
 * Dashboard stats for the visitors/CRM dashboard.
 */
const getDashboardStats = async (scope = {}) => {
  const filter = getTenantFilter(scope);

  const [byStatus, bySource, recentTotal, todayFollowUps] = await Promise.all([
    Visitor.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Visitor.aggregate([
      { $match: filter },
      { $group: { _id: '$source', count: { $sum: 1 } } },
    ]),
    Visitor.countDocuments(filter),
    // Visitors whose nextFollowUpDate is today
    Visitor.countDocuments({
      ...filter,
      nextFollowUpDate: {
        $gte: new Date(new Date().setHours(0, 0, 0, 0)),
        $lte: new Date(new Date().setHours(23, 59, 59, 999)),
      },
      status: { $nin: ['converted', 'lost'] },
    }),
  ]);

  const statusMap = {};
  byStatus.forEach(({ _id, count }) => { statusMap[_id] = count; });

  const sourceMap = {};
  bySource.forEach(({ _id, count }) => { sourceMap[_id] = count; });

  const converted = statusMap.converted || 0;
  const conversionRate = recentTotal > 0 ? Math.round((converted / recentTotal) * 100) : 0;

  return {
    total: recentTotal,
    byStatus: {
      new: statusMap.new || 0,
      contacted: statusMap.contacted || 0,
      interested: statusMap.interested || 0,
      converted,
      lost: statusMap.lost || 0,
    },
    bySource: sourceMap,
    conversionRate,
    todayFollowUps,
  };
};

module.exports = {
  isDuplicate,
  createVisitor,
  queryVisitors,
  getVisitorById,
  updateVisitorById,
  deleteVisitorById,
  addFollowUp,
  getDashboardStats,
};
