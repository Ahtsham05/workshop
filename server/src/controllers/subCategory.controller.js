const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { subCategoryService } = require('../services');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middlewares/upload');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const { searchPexelsAndUpload } = require('../services/imageSearch.service');

const createSubCategory = catchAsync(async (req, res) => {
  let subCategoryData = req.body;

  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.buffer, {
        public_id: `subcategory_${Date.now()}`,
      });

      subCategoryData.image = {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Image upload failed');
    }
  }

  const subCategory = await subCategoryService.createSubCategory({ ...subCategoryData, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(subCategory);
});

const bulkCreateSubCategories = catchAsync(async (req, res) => {
  const { category, items } = req.body;

  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'At least one sub-category name is required');
  }

  const subCategories = await subCategoryService.bulkCreateSubCategories(category, items, getBranchContext(req));
  res.status(httpStatus.CREATED).send({
    message: `Successfully created ${subCategories.length} sub-categories`,
    subCategories,
  });
});

const getSubCategories = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'category']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await subCategoryService.querySubCategories(filter, options);
  res.send(result);
});

const getAllSubCategories = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['search', 'fieldName', 'category']);
  applyBranchFilter(filter, req);
  const result = await subCategoryService.getAllSubCategories(filter);
  res.send(result);
});

const getSubCategory = catchAsync(async (req, res) => {
  const subCategory = await subCategoryService.getSubCategoryById(req.params.subCategoryId);
  if (!subCategory) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sub-category not found');
  }
  res.send(subCategory);
});

const updateSubCategory = catchAsync(async (req, res) => {
  let subCategoryData = req.body;

  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.buffer, {
        public_id: `subcategory_${Date.now()}`,
      });

      subCategoryData.image = {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Image upload failed');
    }
  }

  const subCategory = await subCategoryService.updateSubCategoryById(req.params.subCategoryId, subCategoryData);
  res.send(subCategory);
});

const deleteSubCategory = catchAsync(async (req, res) => {
  await subCategoryService.deleteSubCategoryById(req.params.subCategoryId);
  res.status(httpStatus.NO_CONTENT).send();
});

const uploadSubCategoryImage = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No image file provided');
  }

  try {
    const result = await uploadToCloudinary(req.file.buffer, {
      public_id: `subcategory_${Date.now()}`,
    });

    res.send({
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Image upload failed');
  }
});

const deleteSubCategoryImage = catchAsync(async (req, res) => {
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
    folder: 'subcategories',
    publicIdPrefix: 'subcategory',
  });
  res.send(result);
});

module.exports = {
  createSubCategory,
  bulkCreateSubCategories,
  getSubCategories,
  getAllSubCategories,
  getSubCategory,
  updateSubCategory,
  deleteSubCategory,
  uploadSubCategoryImage,
  deleteSubCategoryImage,
  fetchImageFromSearch,
};
