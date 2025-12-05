const httpStatus = require('http-status');
const { Company } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a company profile
 * @param {Object} companyBody
 * @returns {Promise<Company>}
 */
const createCompany = async (companyBody) => {
  if (await Company.isEmailTaken(companyBody.email)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  
  // Check if company profile already exists
  const existingCompany = await Company.findOne();
  if (existingCompany) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Company profile already exists. Please update instead.');
  }
  
  return Company.create(companyBody);
};

/**
 * Get company profile
 * @returns {Promise<Company>}
 */
const getCompany = async () => {
  const company = await Company.findOne();
  if (!company) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Company profile not found');
  }
  return company;
};

/**
 * Update company profile
 * @param {Object} updateBody
 * @returns {Promise<Company>}
 */
const updateCompany = async (updateBody) => {
  const company = await Company.findOne();
  if (!company) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Company profile not found');
  }
  
  if (updateBody.email && (await Company.isEmailTaken(updateBody.email, company._id))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Email already taken');
  }
  
  // Don't allow password update through this method
  if (updateBody.password) {
    delete updateBody.password;
  }
  
  Object.assign(company, updateBody);
  await company.save();
  return company;
};

/**
 * Change company password
 * @param {string} oldPassword
 * @param {string} newPassword
 * @returns {Promise<void>}
 */
const changePassword = async (oldPassword, newPassword) => {
  const company = await Company.findOne().select('+password');
  if (!company) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Company profile not found');
  }
  
  if (!(await company.isPasswordMatch(oldPassword))) {
    throw new ApiError(httpStatus.UNAUTHORIZED, 'Incorrect old password');
  }
  
  company.password = newPassword;
  await company.save();
};

/**
 * Delete company profile
 * @returns {Promise<Company>}
 */
const deleteCompany = async () => {
  const company = await Company.findOne();
  if (!company) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Company profile not found');
  }
  await company.remove();
  return company;
};

module.exports = {
  createCompany,
  getCompany,
  updateCompany,
  changePassword,
  deleteCompany,
};
