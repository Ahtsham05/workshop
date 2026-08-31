const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { categoryService } = require('../services');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middlewares/upload');
const { applyBranchFilter, getBranchContext } = require('../utils/branchFilter');
const { searchPexelsAndUpload } = require('../services/imageSearch.service');

const createCategory = catchAsync(async (req, res) => {
  let categoryData = req.body;
  
  // Handle image upload if file is provided
  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.buffer, {
        public_id: `category_${Date.now()}`,
      });
      
      categoryData.image = {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Image upload failed');
    }
  }
  
  const category = await categoryService.createCategory({ ...categoryData, ...getBranchContext(req) });
  res.status(httpStatus.CREATED).send(category);
});

const getCategories = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'description']);
  applyBranchFilter(filter, req);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await categoryService.queryCategories(filter, options);
  res.send(result);
});

const getAllCategories = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['search', 'fieldName']);
  applyBranchFilter(filter, req);
  const result = await categoryService.getAllCategories(filter);
  res.send(result);
});

const getCategory = catchAsync(async (req, res) => {
  const category = await categoryService.getCategoryById(req.params.categoryId);
  if (!category) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  }
  res.send(category);
});

const updateCategory = catchAsync(async (req, res) => {
  let categoryData = req.body;
  
  // Handle image upload if file is provided
  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.buffer, {
        public_id: `category_${Date.now()}`,
      });
      
      categoryData.image = {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Image upload failed');
    }
  }
  
  const category = await categoryService.updateCategoryById(req.params.categoryId, categoryData);
  res.send(category);
});

const deleteCategory = catchAsync(async (req, res) => {
  await categoryService.deleteCategoryById(req.params.categoryId);
  res.status(httpStatus.NO_CONTENT).send();
});

const bulkDeleteCategories = catchAsync(async (req, res) => {
  const { ids } = req.body;
  const { deleted, notFoundIds } = await categoryService.bulkDeleteCategoriesByIds(ids);
  res.send({
    message: `Deleted ${deleted.length} of ${ids.length} categor${deleted.length === 1 ? 'y' : 'ies'}`,
    deletedCount: deleted.length,
    deletedIds: deleted.map((category) => category._id),
    notFoundIds,
  });
});

// Image upload route handler
const uploadCategoryImage = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No image file provided');
  }

  try {
    const result = await uploadToCloudinary(req.file.buffer, {
      public_id: `category_${Date.now()}`,
    });

    res.send({
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Image upload failed');
  }
});

// Image deletion route handler
const deleteCategoryImage = catchAsync(async (req, res) => {
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
    folder: 'categories',
    publicIdPrefix: 'category',
  });
  res.send(result);
});

module.exports = {
  createCategory,
  getCategories,
  getAllCategories,
  getCategory,
  updateCategory,
  deleteCategory,
  bulkDeleteCategories,
  uploadCategoryImage,
  deleteCategoryImage,
  fetchImageFromSearch,
};
