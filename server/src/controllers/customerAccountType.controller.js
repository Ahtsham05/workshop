const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const customerAccountTypeService = require('../services/customerAccountType.service');

const getAccountTypes = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user?.organizationId;
  const branchId = req.branchId;
  const accountTypes = await customerAccountTypeService.getAccountTypes(
    organizationId,
    branchId,
    req.user?.id,
  );
  res.status(httpStatus.OK).send(accountTypes);
});

const createAccountType = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user?.organizationId;
  const branchId = req.branchId;
  const accountType = await customerAccountTypeService.createAccountType(
    req.body,
    organizationId,
    branchId,
    req.user?.id,
  );
  res.status(httpStatus.CREATED).send(accountType);
});

const updateAccountType = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user?.organizationId;
  const accountType = await customerAccountTypeService.updateAccountType(
    req.params.id,
    req.body,
    organizationId,
  );
  res.status(httpStatus.OK).send(accountType);
});

const deleteAccountType = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user?.organizationId;
  await customerAccountTypeService.deleteAccountType(req.params.id, organizationId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  getAccountTypes,
  createAccountType,
  updateAccountType,
  deleteAccountType,
};
