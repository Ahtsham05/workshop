const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { phoneBuybackService } = require('../services');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const ApiError = require('../utils/ApiError');
const { uploadToCloudinary } = require('../middlewares/upload');

const createBuyback = catchAsync(async (req, res) => {
  const buyback = await phoneBuybackService.createBuyback({
    ...req.body,
    ...getBranchContext(req),
  });
  res.status(httpStatus.CREATED).send(buyback);
});

const getBuybacks = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['sellerType', 'isTradeIn']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search']);
  const result = await phoneBuybackService.queryBuybacks(filter, options);
  res.send(result);
});

const getBuyback = catchAsync(async (req, res) => {
  const buyback = await phoneBuybackService.getBuybackById(req.params.buybackId);
  res.send(buyback);
});

const updateBuyback = catchAsync(async (req, res) => {
  const buyback = await phoneBuybackService.updateBuyback(req.params.buybackId, {
    ...req.body,
    updatedBy: req.user.id,
  });
  res.send(buyback);
});

const deleteBuyback = catchAsync(async (req, res) => {
  await phoneBuybackService.deleteBuyback(req.params.buybackId, { updatedBy: req.user.id });
  res.status(httpStatus.NO_CONTENT).send();
});

const getStats = catchAsync(async (req, res) => {
  const { organizationId, branchId } = getBranchContext(req);
  const stats = await phoneBuybackService.getUsedPhoneStats(organizationId, branchId);
  res.send(stats);
});

// Used for both seller ID-card photos and device condition photos — a plain
// Cloudinary upload with no side effects on any record (mirrors
// customer.controller.js's uploadCustomerImage).
const uploadBuybackImage = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No image file provided');
  }

  try {
    const result = await uploadToCloudinary(req.file.buffer, {
      public_id: `used_phone_${Date.now()}`,
      folder: 'used-phones',
    });

    res.send({
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Image upload failed');
  }
});

module.exports = {
  createBuyback,
  getBuybacks,
  getBuyback,
  updateBuyback,
  deleteBuyback,
  getStats,
  uploadBuybackImage,
};
