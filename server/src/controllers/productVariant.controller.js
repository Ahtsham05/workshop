const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const productVariantService = require('../services/productVariant.service');
const { toDuplicateKeyApiError } = require('../utils/duplicateKeyError');

const createProductVariant = catchAsync(async (req, res) => {
  try {
    const variant = await productVariantService.createProductVariant(req.params.productId, req.body);
    res.status(httpStatus.CREATED).send(variant);
  } catch (error) {
    // Handle MongoDB duplicate key errors (sku/barcode — each unique per org+branch)
    throw toDuplicateKeyApiError(error) || error;
  }
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
  try {
    const variant = await productVariantService.updateProductVariantById(req.params.variantId, req.body);
    res.send(variant);
  } catch (error) {
    // Handle MongoDB duplicate key errors (sku/barcode — each unique per org+branch)
    throw toDuplicateKeyApiError(error) || error;
  }
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
