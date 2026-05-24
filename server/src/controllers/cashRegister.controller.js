const catchAsync = require('../utils/catchAsync');
const cashRegisterService = require('../services/cashRegister.service');

const getRegister = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user?.organizationId;
  const branchId = req.branchId;
  const result = await cashRegisterService.getRegister(organizationId, branchId);
  res.send(result);
});

const saveRegister = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user?.organizationId;
  const branchId = req.branchId;
  const result = await cashRegisterService.saveRegister(
    organizationId,
    branchId,
    req.user?.id,
    req.body,
  );
  res.send(result);
});

const clearRegister = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user?.organizationId;
  const branchId = req.branchId;
  const result = await cashRegisterService.clearRegister(
    organizationId,
    branchId,
    req.user?.id,
  );
  res.send(result);
});

const getHistory = catchAsync(async (req, res) => {
  const organizationId = req.organizationId || req.user?.organizationId;
  const branchId = req.branchId;
  const filter = { organizationId, branchId };
  const options = {
    page: req.query.page,
    limit: req.query.limit,
    sortBy: req.query.sortBy,
  };
  const result = await cashRegisterService.queryHistory(filter, options);
  res.send(result);
});

module.exports = {
  getRegister,
  saveRegister,
  clearRegister,
  getHistory,
};
