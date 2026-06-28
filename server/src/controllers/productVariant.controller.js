const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const productVariantService = require('../services/productVariant.service');

const createProductVariant = catchAsync(async (req, res) => {
  const variant = await productVariantService.createProductVariant(req.params.productId, req.body);
  res.status(httpStatus.CREATED).send(variant);
});

const getProductVariants = catchAsync(async (req, res) => {
  const variants = await productVariantService.getVariantsForProduct(req.params.productId);
  res.send(variants);
});

const getProductVariant = catchAsync(async (req, res) => {
  const variant = await productVariantService.getProductVariantById(req.params.variantId);
  res.send(variant);
});

const updateProductVariant = catchAsync(async (req, res) => {
  const variant = await productVariantService.updateProductVariantById(req.params.variantId, req.body);
  res.send(variant);
});

const deleteProductVariant = catchAsync(async (req, res) => {
  await productVariantService.deleteProductVariantById(req.params.variantId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createProductVariant,
  getProductVariants,
  getProductVariant,
  updateProductVariant,
  deleteProductVariant,
};
