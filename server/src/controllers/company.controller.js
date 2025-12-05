const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { companyService } = require('../services');

const createCompany = catchAsync(async (req, res) => {
  const company = await companyService.createCompany(req.body);
  res.status(httpStatus.CREATED).send(company);
});

const getCompany = catchAsync(async (req, res) => {
  const company = await companyService.getCompany();
  res.send(company);
});

const updateCompany = catchAsync(async (req, res) => {
  const company = await companyService.updateCompany(req.body);
  res.send(company);
});

const changePassword = catchAsync(async (req, res) => {
  await companyService.changePassword(req.body.oldPassword, req.body.newPassword);
  res.status(httpStatus.NO_CONTENT).send();
});

const deleteCompany = catchAsync(async (req, res) => {
  await companyService.deleteCompany();
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createCompany,
  getCompany,
  updateCompany,
  changePassword,
  deleteCompany,
};
