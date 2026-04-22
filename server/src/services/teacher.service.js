const httpStatus = require('http-status');
const { Teacher } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) filter.organizationId = data.organizationId;
  if (data.branchId) filter.branchId = data.branchId;
  return filter;
};

const createTeacher = async (body) => {
  const scope = getTenantFilter(body);
  if (await Teacher.findOne({ ...scope, email: body.email })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }

  // Auto-generate employeeId if not provided
  if (!body.employeeId) {
    const year = new Date().getFullYear();
    const count = await Teacher.countDocuments(scope);
    body.employeeId = `EMP-${year}-${String(count + 1).padStart(4, '0')}`;
    // Ensure uniqueness in case of race conditions
    while (await Teacher.findOne({ ...scope, employeeId: body.employeeId })) {
      body.employeeId = `EMP-${year}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    }
  } else if (await Teacher.findOne({ ...scope, employeeId: body.employeeId })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Employee ID already exists');
  }

  const teacher = await Teacher.create(body);
  return teacher;
};

const queryTeachers = async (filter, options) => {
  return Teacher.paginate(filter, options);
};

const getTeacherById = async (id, scope = {}) => {
  return Teacher.findOne({ _id: id, ...getTenantFilter(scope) });
};

const updateTeacherById = async (id, updateBody, scope = {}) => {
  const doc = await getTeacherById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Teacher not found');
  if (updateBody.email && (await Teacher.findOne({ ...getTenantFilter(scope), email: updateBody.email, _id: { $ne: id } }))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  Object.assign(doc, updateBody);
  await doc.save();
  return doc;
};

const deleteTeacherById = async (id, scope = {}) => {
  const doc = await getTeacherById(id, scope);
  if (!doc) throw new ApiError(httpStatus.NOT_FOUND, 'Teacher not found');
  await doc.deleteOne();
  return doc;
};

module.exports = {
  createTeacher,
  queryTeachers,
  getTeacherById,
  updateTeacherById,
  deleteTeacherById,
};
