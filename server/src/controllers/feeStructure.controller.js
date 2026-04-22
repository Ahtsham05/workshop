const httpStatus = require('http-status');
const pick = require('../utils/pick');
const catchAsync = require('../utils/catchAsync');
const { feeStructureService } = require('../services');

const createFeeStructure = catchAsync(async (req, res) => {
  const structure = await feeStructureService.createFeeStructure({
    ...req.body,
    organizationId: req.user.organizationId,
    branchId: req.branchId,
    createdBy: req.user._id,
  });
  res.status(httpStatus.CREATED).send(structure);
});

const getFeeStructures = catchAsync(async (req, res) => {
  const filter = {
    organizationId: req.user.organizationId,
    branchId: req.branchId,
  };
  const query = pick(req.query, ['classId', 'isActive']);
  Object.assign(filter, query);

  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await feeStructureService.queryFeeStructures(filter, options);
  res.send(result);
});

const getFeeStructure = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const structure = await feeStructureService.getFeeStructureById(req.params.structureId, scope);
  if (!structure) return res.status(httpStatus.NOT_FOUND).send({ message: 'Fee structure not found' });
  res.send(structure);
});

const getFeeStructureByClass = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const structure = await feeStructureService.getFeeStructureByClass(req.params.classId, scope);
  if (!structure) return res.status(httpStatus.NOT_FOUND).send({ message: 'No fee structure found for this class' });
  res.send(structure);
});

const updateFeeStructure = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  const structure = await feeStructureService.updateFeeStructureById(req.params.structureId, req.body, scope);
  res.send(structure);
});

const deleteFeeStructure = catchAsync(async (req, res) => {
  const scope = { organizationId: req.user.organizationId, branchId: req.branchId };
  await feeStructureService.deleteFeeStructureById(req.params.structureId, scope);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createFeeStructure,
  getFeeStructures,
  getFeeStructure,
  getFeeStructureByClass,
  updateFeeStructure,
  deleteFeeStructure,
};
