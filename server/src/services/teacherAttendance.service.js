const httpStatus = require('http-status');
const { TeacherAttendance, Teacher } = require('../models');
const ApiError = require('../utils/ApiError');

const toDayStart = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid date');
  d.setHours(0, 0, 0, 0);
  return d;
};

const getDayRange = (value) => {
  const start = toDayStart(value);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const getTenantFilter = (scope = {}) => {
  const f = {};
  if (scope.organizationId) f.organizationId = scope.organizationId;
  if (scope.branchId) f.branchId = scope.branchId;
  return f;
};

const markAttendance = async (body, scope) => {
  const { start, end } = getDayRange(body.date || new Date());
  const filter = {
    ...getTenantFilter(scope),
    teacherId: body.teacherId,
    date: { $gte: start, $lt: end },
  };
  const update = {
    $set: {
      ...body,
      date: start,
      organizationId: scope.organizationId,
      branchId: scope.branchId,
    },
  };
  return TeacherAttendance.findOneAndUpdate(filter, update, { upsert: true, new: true });
};

const markBulkAttendance = async (records, scope) => {
  const ops = records.map((r) => {
    const { start, end } = getDayRange(r.date || new Date());
    return {
      updateOne: {
        filter: {
          organizationId: scope.organizationId,
          branchId: scope.branchId,
          teacherId: r.teacherId,
          date: { $gte: start, $lt: end },
        },
        update: {
          $set: {
            ...r,
            date: start,
            organizationId: scope.organizationId,
            branchId: scope.branchId,
            markedBy: scope.userId,
          },
        },
        upsert: true,
      },
    };
  });
  return TeacherAttendance.bulkWrite(ops);
};

const queryAttendance = async (filter, options) => {
  // Convert a date string/value to a day range so UTC-stored local-midnight dates are matched correctly
  if (filter.date) {
    const { start, end } = getDayRange(filter.date);
    filter.date = { $gte: start, $lt: end };
  }
  return TeacherAttendance.paginate(filter, options);
};

const getAttendanceById = async (id, scope = {}) => {
  return TeacherAttendance.findOne({ _id: id, ...getTenantFilter(scope) }).populate('teacherId');
};

const updateAttendanceById = async (id, updateBody, scope = {}) => {
  const doc = await getAttendanceById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Attendance record not found');
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteAttendanceById = async (id, scope = {}) => {
  const doc = await getAttendanceById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Attendance record not found');
  await doc.deleteOne();
  return doc;
};

/**
 * Get today's attendance summary (present/absent/late/on_leave totals)
 */
const getTodayStats = async (scope = {}) => {
  const { start, end } = getDayRange(new Date());
  const tf = getTenantFilter(scope);
  const totalTeachers = await Teacher.countDocuments({ ...tf, status: 'active' });
  const records = await TeacherAttendance.find({
    ...tf,
    date: { $gte: start, $lt: end },
  }).lean();

  const stats = { present: 0, absent: 0, late: 0, on_leave: 0, holiday: 0, marked: records.length, total: totalTeachers };
  for (const r of records) {
    if (stats[r.status] !== undefined) stats[r.status]++;
  }
  return stats;
};

module.exports = {
  markAttendance,
  markBulkAttendance,
  queryAttendance,
  getAttendanceById,
  updateAttendanceById,
  deleteAttendanceById,
  getTodayStats,
};
