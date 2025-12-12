const httpStatus = require('http-status');
const { Department } = require('../models');
const ApiError = require('../utils/ApiError');

const createDepartment = async (departmentBody) => {
  if (await Department.findOne({ name: departmentBody.name })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Department name already exists');
  }
  if (await Department.findOne({ code: departmentBody.code })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Department code already exists');
  }
  return Department.create(departmentBody);
};

const queryDepartments = async (filter, options) => {
  const departments = await Department.paginate(filter, options);
  return departments;
};

const getDepartmentById = async (id) => {
  const department = await Department.findById(id).populate('manager').populate('parentDepartment');
  return department;
};

const updateDepartmentById = async (departmentId, updateBody) => {
  const department = await getDepartmentById(departmentId);
  if (!department) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Department not found');
  }
  if (updateBody.name && (await Department.findOne({ name: updateBody.name, _id: { $ne: departmentId } }))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Department name already exists');
  }
  if (updateBody.code && (await Department.findOne({ code: updateBody.code, _id: { $ne: departmentId } }))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Department code already exists');
  }
  Object.assign(department, updateBody);
  await department.save();
  return department;
};

const deleteDepartmentById = async (departmentId) => {
  const department = await getDepartmentById(departmentId);
  if (!department) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Department not found');
  }
  await department.remove();
  return department;
};

module.exports = {
  createDepartment,
  queryDepartments,
  getDepartmentById,
  updateDepartmentById,
  deleteDepartmentById,
};
