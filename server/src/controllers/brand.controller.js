const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const brandService = require('../services/brand.service');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middlewares/upload');
const { getBranchContext } = require('../utils/branchFilter');
const { searchPexelsAndUpload } = require('../services/imageSearch.service');

const createBrand = catchAsync(async (req, res) => {
  let brandData = req.body;

  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.buffer, {
        public_id: `brand_${Date.now()}`,
      });
      brandData.logo = { url: result.secure_url, publicId: result.public_id };
    } catch (error) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Logo upload failed');
    }
  }

  const brand = await brandService.createBrand({ ...brandData, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(brand);
});

const getBrands = catchAsync(async (req, res) => {
  const filter = { organizationId: req.organizationId, ...pick(req.query, ['name', 'status']) };
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await brandService.queryBrands(filter, options);
  res.send(result);
});

const getAllBrands = catchAsync(async (req, res) => {
  const filter = { organizationId: req.organizationId, ...pick(req.query, ['search', 'fieldName', 'status']) };
  const result = await brandService.getAllBrands(filter);
  res.send(result);
});

const getBrand = catchAsync(async (req, res) => {
  const brand = await brandService.getBrandById(req.params.brandId);
  res.send(brand);
});

const updateBrand = catchAsync(async (req, res) => {
  let brandData = req.body;

  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.buffer, {
        public_id: `brand_${Date.now()}`,
      });
      brandData.logo = { url: result.secure_url, publicId: result.public_id };
    } catch (error) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Logo upload failed');
    }
  }

  const brand = await brandService.updateBrandById(req.params.brandId, {
    ...brandData,
    updatedBy: req.user ? req.user.id : undefined,
  });
  res.send(brand);
});

const deleteBrand = catchAsync(async (req, res) => {
  await brandService.softDeleteBrandById(req.params.brandId);
  res.status(httpStatus.NO_CONTENT).send();
});

const uploadBrandLogo = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No image file provided');
  }
  try {
    const result = await uploadToCloudinary(req.file.buffer, {
      public_id: `brand_${Date.now()}`,
    });
    res.send({ url: result.secure_url, publicId: result.public_id });
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Image upload failed');
  }
});

const deleteBrandLogo = catchAsync(async (req, res) => {
  const { publicId } = req.body;
  if (!publicId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Public ID is required');
  }
  try {
    await deleteFromCloudinary(publicId);
    res.send({ message: 'Image deleted successfully' });
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Image deletion failed');
  }
});

const fetchImageFromSearch = catchAsync(async (req, res) => {
  const { query } = req.body;
  const result = await searchPexelsAndUpload(query, {
    folder: 'brands',
    publicIdPrefix: 'brand',
  });
  res.send(result);
});

module.exports = {
  createBrand,
  getBrands,
  getAllBrands,
  getBrand,
  updateBrand,
  deleteBrand,
  uploadBrandLogo,
  deleteBrandLogo,
  fetchImageFromSearch,
};
