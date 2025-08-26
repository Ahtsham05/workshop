const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { productService } = require('../services');
const pick = require('../utils/pick');
const ApiError = require('../utils/ApiError');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middlewares/upload');

const createProduct = catchAsync(async (req, res) => {
  let productData = req.body;
  
  // Handle image upload if file is provided
  if (req.file) {
    try {
      const result = await uploadToCloudinary(req.file.buffer, {
        public_id: `product_${Date.now()}`,
      });
      
      productData.image = {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Image upload failed');
    }
  }
  
  try {
    const product = await productService.createProduct(productData);
    res.status(httpStatus.CREATED).send(product);
  } catch (error) {
    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const value = error.keyValue[field];
      
      if (field === 'name') {
        throw new ApiError(httpStatus.BAD_REQUEST, `Product name "${value}" already exists. Please choose a different name.`);
      } else if (field === 'barcode') {
        throw new ApiError(httpStatus.BAD_REQUEST, `Barcode "${value}" already exists. Please use a different barcode.`);
      } else {
        throw new ApiError(httpStatus.BAD_REQUEST, `Duplicate value for ${field}: "${value}"`);
      }
    }
    throw error;
  }
});

const getProducts = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'category', 'description']);
  const options = pick(req.query, ['sortBy', 'limit', 'page', 'search', 'fieldName']);
  const result = await productService.queryProducts(filter, options);
  res.send(result);
});

const getProduct = catchAsync(async (req, res) => {
  const product = await productService.getProductById(req.params.productId);
  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  }
  res.send(product);
});

const updateProduct = catchAsync(async (req, res) => {
  console.log("req.params.productId",req.params.productId)
  let productData = req.body;
  
  // Handle image upload if file is provided
  if (req.file) {
    try {
      // Get existing product to delete old image if it exists
      const existingProduct = await productService.getProductById(req.params.productId);
      
      // Delete old image from Cloudinary if it exists
      if (existingProduct && existingProduct.image && existingProduct.image.publicId) {
        await deleteFromCloudinary(existingProduct.image.publicId);
      }
      
      // Upload new image
      const result = await uploadToCloudinary(req.file.buffer, {
        public_id: `product_${req.params.productId}_${Date.now()}`,
      });
      
      productData.image = {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Image upload failed');
    }
  }
  
  try {
    const product = await productService.updateProductById(req.params.productId, productData);
    res.send(product);
  } catch (error) {
    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const value = error.keyValue[field];
      
      if (field === 'name') {
        throw new ApiError(httpStatus.BAD_REQUEST, `Product name "${value}" already exists. Please choose a different name.`);
      } else if (field === 'barcode') {
        throw new ApiError(httpStatus.BAD_REQUEST, `Barcode "${value}" already exists. Please use a different barcode.`);
      } else {
        throw new ApiError(httpStatus.BAD_REQUEST, `Duplicate value for ${field}: "${value}"`);
      }
    }
    throw error;
  }
});

const deleteProduct = catchAsync(async (req, res) => {
  // Get product to delete associated image
  const product = await productService.getProductById(req.params.productId);
  
  // Delete image from Cloudinary if it exists
  if (product && product.image && product.image.publicId) {
    try {
      await deleteFromCloudinary(product.image.publicId);
    } catch (error) {
      console.error('Failed to delete image from Cloudinary:', error);
      // Continue with product deletion even if image deletion fails
    }
  }
  
  await productService.deleteProductById(req.params.productId);
  res.status(httpStatus.NO_CONTENT).send();
});

const uploadProductImage = catchAsync(async (req, res) => {
  if (!req.file) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'No image file provided');
  }
  
  try {
    const result = await uploadToCloudinary(req.file.buffer, {
      public_id: `product_temp_${Date.now()}`,
    });
    
    res.send({
      url: result.secure_url,
      publicId: result.public_id,
    });
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Image upload failed');
  }
});

const deleteProductImage = catchAsync(async (req, res) => {
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

const getAllProducts = catchAsync(async (req, res) => {
  const products = await productService.getAllProducts();
  res.send(products);
});

const bulkUpdateProducts = catchAsync(async (req, res) => {
  const { products } = req.body;
  
  try {
    const updatedProducts = await productService.bulkUpdateProducts(products);
    res.send({
      message: `Successfully updated ${updatedProducts.length} products`,
      updatedProducts
    });
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Bulk update failed: ' + error.message);
  }
});

module.exports = {
  createProduct,
  getProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  getAllProducts,
  uploadProductImage,
  deleteProductImage,
  bulkUpdateProducts,
};
