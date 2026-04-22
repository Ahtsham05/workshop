const httpStatus = require('http-status');
const { TeacherLeave, Teacher } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (scope = {}) => {
  const f = {};
  if (scope.organizationId) f.organizationId = scope.organizationId;
  if (scope.branchId) f.branchId = scope.branchId;
  return f;
};

const calcWorkingDays = (from, to) => {
  let count = 0;
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
};

const applyLeave = async (body, scope) => {
  const tf = getTenantFilter(scope);
  const teacher = await Teacher.findOne({ _id: body.teacherId, ...tf });
  if (!teacher) throw new ApiError(httpStatus.NOT_FOUND, 'Teacher not found');
  const totalDays = body.totalDays || calcWorkingDays(body.fromDate, body.toDate);
  return TeacherLeave.create({ ...body, ...tf, totalDays, status: 'pending' });
};

const queryLeaves = async (filter, options) => {
  return TeacherLeave.paginate(filter, options);
};

const getLeaveById = async (id, scope = {}) => {
  return TeacherLeave.findOne({ _id: id, ...getTenantFilter(scope) }).populate('teacherId').populate('approvedBy', 'name email');
};

const approveLeave = async (id, approverId, scope = {}) => {
  const doc = await getLeaveById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Leave not found');
  if (doc.status !== 'pending') throw new ApiError(httpStatus.BAD_REQUEST, 'Leave is no longer pending');
  doc.status = 'approved';
  doc.approvedBy = approverId;
  doc.approvedAt = new Date();
  await doc.save();
  return doc;
};

const rejectLeave = async (id, approverId, rejectionReason, scope = {}) => {
  const doc = await getLeaveById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Leave not found');
  if (doc.status !== 'pending') throw new ApiError(httpStatus.BAD_REQUEST, 'Leave is no longer pending');
  doc.status = 'rejected';
  doc.approvedBy = approverId;
  doc.approvedAt = new Date();
  doc.rejectionReason = rejectionReason;
  await doc.save();
  return doc;
};

const cancelLeave = async (id, scope = {}) => {
  const doc = await getLeaveById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Leave not found');
  if (!['pending', 'approved'].includes(doc.status)) throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot cancel this leave');
  doc.status = 'cancelled';
  await doc.save();
  return doc;
};

const deleteLeaveById = async (id, scope = {}) => {
  const doc = await getLeaveById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Leave not found');
  await doc.deleteOne();
  return doc;
};

module.exports = {
  applyLeave,
  queryLeaves,
  getLeaveById,
  approveLeave,
  rejectLeave,
  cancelLeave,
  deleteLeaveById,
};
