const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const productAttributeService = require('../services/productAttribute.service');
const pick = require('../utils/pick');
const { getBranchContext } = require('../utils/branchFilter');

const createProductAttribute = catchAsync(async (req, res) => {
  const { organizationId } = getBranchContext(req);
  const attribute = await productAttributeService.createProductAttribute({ ...req.body, organizationId });
  res.status(httpStatus.CREATED).send(attribute);
});

const getProductAttributes = catchAsync(async (req, res) => {
  const { organizationId } = getBranchContext(req);
  const filter = { organizationId, ...pick(req.query, ['name', 'businessTypes', 'isActive']) };
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await productAttributeService.queryProductAttributes(filter, options);
  res.send(result);
});

const getAllProductAttributes = catchAsync(async (req, res) => {
  const { organizationId } = getBranchContext(req);
  const filter = { organizationId, ...pick(req.query, ['businessTypes', 'isActive']) };
  const result = await productAttributeService.getAllProductAttributes(filter);
  res.send(result);
});

const getProductAttribute = catchAsync(async (req, res) => {
  const attribute = await productAttributeService.getProductAttributeById(req.params.attributeId);
  res.send(attribute);
});

const updateProductAttribute = catchAsync(async (req, res) => {
  const attribute = await productAttributeService.updateProductAttributeById(req.params.attributeId, req.body);
  res.send(attribute);
});

const deleteProductAttribute = catchAsync(async (req, res) => {
  await productAttributeService.deleteProductAttributeById(req.params.attributeId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createProductAttribute,
  getProductAttributes,
  getAllProductAttributes,
  getProductAttribute,
  updateProductAttribute,
  deleteProductAttribute,
};
