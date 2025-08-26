const httpStatus = require('http-status');
const { Product } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a product
 * @param {Object} productBody
 * @returns {Promise<Product>}
 */
const createProduct = async (productBody) => {
  const product = new Product(productBody); // Create a new instance of the Product model
  return product.save(); // Save the product instance
};

/**
 * Query for products
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @param {string} [options.search] - Search query
 * @param {string} [options.fieldName] - Field name to search
 * @returns {Promise<QueryResult>}
 */
const queryProducts = async (filter, options) => {
  const products = await Product.paginate(filter, options);
  return products;
};

/**
 * Get product by id
 * @param {ObjectId} id
 * @returns {Promise<Product>}
 */
const getProductById = async (id) => {
  return Product.findById(id);
};

/**
 * Update product by id
 * @param {ObjectId} productId
 * @param {Object} updateBody
 * @returns {Promise<Product>}
 */
const updateProductById = async (productId, updateBody) => {
  const product = await getProductById(productId);
  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  }
  Object.assign(product, updateBody);
  await product.save();
  return product;
};

/**
 * Delete product by id
 * @param {ObjectId} productId
 * @returns {Promise<Product>}
 */
const deleteProductById = async (productId) => {
  const product = await getProductById(productId);
  if (!product) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Product not found');
  }
  await product.remove();
  return product;
};

const getAllProducts = async () => {
  const products = await Product.find();
  return products;
}

/**
 * Bulk update products
 * @param {Array} productsToUpdate - Array of products with updates
 * @returns {Promise<Array>}
 */
const bulkUpdateProducts = async (productsToUpdate) => {
  const bulkOps = productsToUpdate.map(product => {
    const updateFields = {};
    
    // Only include fields that are provided
    if (product.price !== undefined) updateFields.price = product.price;
    if (product.cost !== undefined) updateFields.cost = product.cost;
    if (product.stockQuantity !== undefined) updateFields.stockQuantity = product.stockQuantity;
    
    return {
      updateOne: {
        filter: { _id: product.id },
        update: { $set: updateFields }
      }
    };
  });
  
  const result = await Product.bulkWrite(bulkOps);
  
  // Return the updated products
  const productIds = productsToUpdate.map(p => p.id);
  const updatedProducts = await Product.find({ _id: { $in: productIds } });
  
  return updatedProducts;
};

module.exports = {
  createProduct,
  queryProducts,
  getProductById,
  updateProductById,
  deleteProductById,
  getAllProducts,
  bulkUpdateProducts,
};
