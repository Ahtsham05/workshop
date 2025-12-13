const httpStatus = require('http-status');
const { Employee } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create an employee
 * @param {Object} employeeBody
 * @returns {Promise<Employee>}
 */
const createEmployee = async (employeeBody) => {
  if (await Employee.findOne({ email: employeeBody.email })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  if (await Employee.findOne({ employeeId: employeeBody.employeeId })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Employee ID already exists');
  }
  if (employeeBody.cnic && await Employee.findOne({ cnic: employeeBody.cnic })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'CNIC already registered');
  }
  
  // Clean up invalid ObjectIds (for mock data compatibility)
  const cleanedBody = { ...employeeBody };
  
  // If designation is not a valid ObjectId (e.g., mock data), remove it
  if (cleanedBody.designation && !cleanedBody.designation.match(/^[0-9a-fA-F]{24}$/)) {
    delete cleanedBody.designation;
  }
  
  // If shift is not a valid ObjectId, remove it
  if (cleanedBody.shift && !cleanedBody.shift.match(/^[0-9a-fA-F]{24}$/)) {
    delete cleanedBody.shift;
  }
  
  // If reportingManager is not a valid ObjectId, remove it
  if (cleanedBody.reportingManager && !cleanedBody.reportingManager.match(/^[0-9a-fA-F]{24}$/)) {
    delete cleanedBody.reportingManager;
  }
  
  return Employee.create(cleanedBody);
};

/**
 * Query for employees
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryEmployees = async (filter, options) => {
  const employees = await Employee.paginate(filter, options);
  return employees;
};

/**
 * Get employee by id
 * @param {ObjectId} id
 * @returns {Promise<Employee>}
 */
const getEmployeeById = async (id) => {
  const employee = await Employee.findById(id)
    .populate('department')
    .populate('designation')
    .populate('shift')
    .populate('reportingManager');
  return employee;
};

/**
 * Get employee by email
 * @param {string} email
 * @returns {Promise<Employee>}
 */
const getEmployeeByEmail = async (email) => {
  return Employee.findOne({ email });
};

/**
 * Get employee by employee ID
 * @param {string} employeeId
 * @returns {Promise<Employee>}
 */
const getEmployeeByEmployeeId = async (employeeId) => {
  return Employee.findOne({ employeeId });
};

/**
 * Update employee by id
 * @param {ObjectId} employeeId
 * @param {Object} updateBody
 * @returns {Promise<Employee>}
 */
const updateEmployeeById = async (employeeId, updateBody) => {
  const employee = await getEmployeeById(employeeId);
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }
  if (updateBody.email && (await Employee.findOne({ email: updateBody.email, _id: { $ne: employeeId } }))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  if (updateBody.employeeId && (await Employee.findOne({ employeeId: updateBody.employeeId, _id: { $ne: employeeId } }))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Employee ID already exists');
  }
  if (updateBody.cnic && (await Employee.findOne({ cnic: updateBody.cnic, _id: { $ne: employeeId } }))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'CNIC already registered');
  }
  
  // Clean up invalid ObjectIds (for mock data compatibility)
  const cleanedBody = { ...updateBody };
  
  // If designation is not a valid ObjectId (e.g., mock data), remove it
  if (cleanedBody.designation && !cleanedBody.designation.match(/^[0-9a-fA-F]{24}$/)) {
    delete cleanedBody.designation;
  }
  
  // If shift is not a valid ObjectId, remove it
  if (cleanedBody.shift && !cleanedBody.shift.match(/^[0-9a-fA-F]{24}$/)) {
    delete cleanedBody.shift;
  }
  
  // If reportingManager is not a valid ObjectId, remove it
  if (cleanedBody.reportingManager && !cleanedBody.reportingManager.match(/^[0-9a-fA-F]{24}$/)) {
    delete cleanedBody.reportingManager;
  }
  
  Object.assign(employee, cleanedBody);
  await employee.save();
  return employee;
};

/**
 * Delete employee by id
 * @param {ObjectId} employeeId
 * @returns {Promise<Employee>}
 */
const deleteEmployeeById = async (employeeId) => {
  const employee = await getEmployeeById(employeeId);
  if (!employee) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Employee not found');
  }
  await employee.remove();
  return employee;
};

/**
 * Get employees by department
 * @param {ObjectId} departmentId
 * @returns {Promise<Employee[]>}
 */
const getEmployeesByDepartment = async (departmentId) => {
  return Employee.find({ department: departmentId, isActive: true }).populate('designation');
};

/**
 * Get active employees count
 * @returns {Promise<number>}
 */
const getActiveEmployeesCount = async () => {
  return Employee.countDocuments({ employmentStatus: 'Active' });
};

module.exports = {
  createEmployee,
  queryEmployees,
  getEmployeeById,
  getEmployeeByEmail,
  getEmployeeByEmployeeId,
  updateEmployeeById,
  deleteEmployeeById,
  getEmployeesByDepartment,
  getActiveEmployeesCount,
};
