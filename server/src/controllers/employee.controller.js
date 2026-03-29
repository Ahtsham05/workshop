const httpStatus = require('http-status');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { employeeService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const getEmployeeScope = (req) => {
  const scope = {};
  if (req.organizationId) {
    scope.organizationId = req.organizationId;
  }
  if (req.branchId) {
    scope.branchId = req.branchId;
  }
  return scope;
};

const createEmployee = catchAsync(async (req, res) => {
  const employee = await employeeService.createEmployee({ ...req.body, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(employee);
});

const getEmployees = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['employeeId', 'firstName', 'lastName', 'email', 'department', 'designation', 'employmentStatus']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  options.populate = 'department,designation,shift,reportingManager';
  const result = await employeeService.queryEmployees(filter, options);
  res.send(result);
});

const getEmployee = catchAsync(async (req, res) => {
  const employee = await employeeService.getEmployeeById(req.params.employeeId, getEmployeeScope(req));
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }
  res.send(employee);
});

const updateEmployee = catchAsync(async (req, res) => {
  const employee = await employeeService.updateEmployeeById(req.params.employeeId, req.body, getEmployeeScope(req));
  res.send(employee);
});

const deleteEmployee = catchAsync(async (req, res) => {
  await employeeService.deleteEmployeeById(req.params.employeeId, getEmployeeScope(req));
  res.status(httpStatus.NO_CONTENT).send();
});

const getEmployeesByDepartment = catchAsync(async (req, res) => {
  const employees = await employeeService.getEmployeesByDepartment(req.params.departmentId, getEmployeeScope(req));
  res.send(employees);
});

module.exports = {
  createEmployee,
  getEmployees,
  getEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeesByDepartment,
};
