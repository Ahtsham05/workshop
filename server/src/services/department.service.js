const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Department } = require('../models');
const ApiError = require('../utils/ApiError');

const getTenantFilter = (data = {}) => {
  const filter = {};
  if (data.organizationId) {
    filter.organizationId = data.organizationId;
  }
  if (data.branchId) {
    filter.branchId = data.branchId;
  }
  return filter;
};

let indexesEnsured = false;

/**
 * Migrate from the legacy global name_1/code_1 unique indexes (pre-multi-tenant
 * schema) to the per-org+branch compound unique indexes now defined on the schema.
 * Without this, Mongo keeps enforcing the old global-unique constraint forever —
 * dropping a field's `unique: true` from the schema doesn't drop the index Mongo
 * already built for it.
 */
const ensureDepartmentIndexes = async () => {
  if (indexesEnsured) return;

  const collection = mongoose.connection.collection('departments');
  try {
    const indexes = await collection.indexes();
    const legacyNameIndex = indexes.find(
      (idx) => idx.key?.name === 1 && idx.unique && !idx.key?.organizationId
    );
    if (legacyNameIndex) {
      await collection.dropIndex(legacyNameIndex.name);
    }
    const legacyCodeIndex = indexes.find(
      (idx) => idx.key?.code === 1 && idx.unique && !idx.key?.organizationId
    );
    if (legacyCodeIndex) {
      await collection.dropIndex(legacyCodeIndex.name);
    }
  } catch (err) {
    if (err.codeName !== 'IndexNotFound') {
      // Non-fatal — syncIndexes below will still create the compound index.
    }
  }

  await Department.syncIndexes();
  indexesEnsured = true;
};

const createDepartment = async (departmentBody) => {
  await ensureDepartmentIndexes();
  const tenantFilter = getTenantFilter(departmentBody);
  if (await Department.findOne({ ...tenantFilter, name: departmentBody.name })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Department name already exists');
  }
  if (await Department.findOne({ ...tenantFilter, code: departmentBody.code })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Department code already exists');
  }
  return Department.create(departmentBody);
};

const queryDepartments = async (filter, options) => {
  const departments = await Department.paginate(filter, options);
  return departments;
};

const getDepartmentById = async (id, scope = {}) => {
  const tenantFilter = getTenantFilter(scope);
  const department = await Department.findOne({ _id: id, ...tenantFilter })
    .populate('manager')
    .populate('parentDepartment');
  return department;
};

const updateDepartmentById = async (departmentId, updateBody, scope = {}) => {
  const department = await getDepartmentById(departmentId, scope);
  if (!department) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Department not found');
  }
  const tenantFilter = getTenantFilter(department);
  if (
    updateBody.name
    && (await Department.findOne({ ...tenantFilter, name: updateBody.name, _id: { $ne: departmentId } }))
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Department name already exists');
  }
  if (
    updateBody.code
    && (await Department.findOne({ ...tenantFilter, code: updateBody.code, _id: { $ne: departmentId } }))
  ) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Department code already exists');
  }
  Object.assign(department, updateBody);
  await department.save();
  return department;
};

const deleteDepartmentById = async (departmentId, scope = {}) => {
  const department = await getDepartmentById(departmentId, scope);
  if (!department) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Department not found');
  }
  await department.deleteOne();
  return department;
};

module.exports = {
  createDepartment,
  queryDepartments,
  getDepartmentById,
  updateDepartmentById,
  deleteDepartmentById,
};
