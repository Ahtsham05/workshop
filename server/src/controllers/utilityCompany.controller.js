const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { utilityCompanyService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');

const createUtilityCompany = catchAsync(async (req, res) => {
  const company = await utilityCompanyService.createUtilityCompany({
    ...req.body,
    ...getBranchContext(req),
  });
  res.status(httpStatus.CREATED).send(company);
});

const getUtilityCompanies = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['billType', 'isActive']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await utilityCompanyService.queryUtilityCompanies(filter, options);
  res.send(result);
});

const updateUtilityCompany = catchAsync(async (req, res) => {
  const company = await utilityCompanyService.updateUtilityCompanyById(req.params.companyId, req.body);
  res.send(company);
});

const deleteUtilityCompany = catchAsync(async (req, res) => {
  await utilityCompanyService.deleteUtilityCompanyById(req.params.companyId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createUtilityCompany,
  getUtilityCompanies,
  updateUtilityCompany,
  deleteUtilityCompany,
};
