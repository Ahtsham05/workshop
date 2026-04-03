const httpStatus = require('http-status');
const { UtilityCompany } = require('../models');
const ApiError = require('../utils/ApiError');

const createUtilityCompany = async (body) => {
  return UtilityCompany.create(body);
};

const queryUtilityCompanies = async (filter, options) => {
  return UtilityCompany.paginate(filter, {
    ...options,
    sortBy: options.sortBy || 'name:asc',
  });
};

const getUtilityCompanyById = async (id) => {
  const company = await UtilityCompany.findById(id);
  if (!company) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Utility company not found');
  }
  return company;
};

const updateUtilityCompanyById = async (id, updateBody) => {
  const company = await getUtilityCompanyById(id);
  Object.assign(company, updateBody);
  await company.save();
  return company;
};

const deleteUtilityCompanyById = async (id) => {
  const company = await getUtilityCompanyById(id);
  await company.deleteOne();
  return company;
};

module.exports = {
  createUtilityCompany,
  queryUtilityCompanies,
  getUtilityCompanyById,
  updateUtilityCompanyById,
  deleteUtilityCompanyById,
};
