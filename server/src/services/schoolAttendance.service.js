const httpStatus = require('http-status');
const { SchoolAttendance } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Normalise any date value to LOCAL midnight (start of that calendar day
 * in the server's timezone). This keeps writes and reads consistent regardless
 * of whether the server runs in UTC or a local timezone (e.g. PKT +5).
 */
const toDayStart = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid attendance date');
  }
  d.setHours(0, 0, 0, 0);
  return d;
};

const getDayRange = (value) => {
  const start = toDayStart(value);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = data.organizationId;
  if (data.branchId) filter.branchId = data.branchId;
  return filter;
};

const createAttendance = async (body) => {
  return SchoolAttendance.create(body);
};

const markBulkAttendance = async (records, context) => {
  const ops = records.map((r) => {
    const { start, end } = getDayRange(r.date);
    return {
      updateOne: {
        filter: {
          organizationId: context.organizationId,
          branchId: context.branchId,
          studentId: r.studentId,
          date: { $gte: start, $lt: end },
        },
        update: {
          $set: {
            ...r,
            date: start,
            organizationId: context.organizationId,
            branchId: context.branchId,
            createdBy: context.createdBy,
          },
        },
        upsert: true,
      },
    };
  });
  return SchoolAttendance.bulkWrite(ops);
};

const queryAttendance = async (filter, options) => {
  return SchoolAttendance.paginate(filter, options);
};

const getAttendanceById = async (id, scope = {}) => {
  return SchoolAttendance.findOne({ _id: id, ...getTenantFilter(scope) })
    .populate('studentId')
    .populate('classId');
};

const getAttendanceByClass = async (classId, date, scope = {}) => {
  const { start, end } = getDayRange(date);
  return SchoolAttendance.find({ ...getTenantFilter(scope), classId, date: { $gte: start, $lt: end } })
    .populate('studentId')
    .lean();
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
 * Barcode scan: find student by admissionNumber, mark present if not already done today.
 * Returns { status: 'present'|'already_marked'|'invalid', student? }
 */
const scanAttendance = async (admissionNumber, scope = {}) => {
  const { Student } = require('../models');

  const tenantFilter = getTenantFilter(scope);

  const student = await Student.findOne({
    ...tenantFilter,
    admissionNumber,
    status: 'active',
  })
    .populate('classId', 'name')
    .populate('sectionId', 'name')
    .lean();

  if (!student) return { status: 'invalid' };

  const { start: todayStart, end: todayEnd } = getDayRange(new Date());

  const existing = await SchoolAttendance.findOne({
    ...tenantFilter,
    studentId: student._id,
    date: { $gte: todayStart, $lt: todayEnd },
  }).lean();

  if (existing) {
    return {
      status: 'already_marked',
      student,
      attendanceStatus: existing.status,
      markedAt: existing.createdAt,
    };
  }

  const record = await SchoolAttendance.create({
    ...tenantFilter,
    studentId: student._id,
    classId: student.classId?._id || student.classId,
    sectionId: student.sectionId?._id || student.sectionId,
    date: new Date(todayStart),
    status: 'present',
  });

  return { status: 'present', student, record };
};

module.exports = {
  createAttendance,
  markBulkAttendance,
  queryAttendance,
  getAttendanceById,
  getAttendanceByClass,
  updateAttendanceById,
  deleteAttendanceById,
  scanAttendance,
};
