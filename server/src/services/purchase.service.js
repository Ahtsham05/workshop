const httpStatus = require('http-status');
const { Purchase, Product } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a purchase record
 * @param {Object} purchaseBody
 * @returns {Promise<Purchase>}
 */
const createPurchase = async (purchaseBody) => {
  // First, create the purchase
  const purchase = await Purchase.create(purchaseBody);

  // Now, update the stock quantity of each product in the purchase
  for (const item of purchase.items) {
    const product = await Product.findById(item.product);

    if (product) {
      // Increase stock quantity based on the purchased quantity
      product.stockQuantity += item.quantity;

      // Save the updated product
      await product.save();
    }
  }

  return purchase;
};


/**
 * Query for purchases
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {number} [options.limit] - Maximum number of results per page
 * @param {number} [options.page] - Current page
 * @param {string} [options.search] - Search query
 * @returns {Promise<QueryResult>}
 */
const queryPurchases = async (filter, options) => {
  // Ensure 'populate' is set in options to include supplier data
 options.populate = 'supplier';
  const purchases = await Purchase.paginate(filter, options);
  return purchases;
};;

/**
 * Get purchase by id
 * @param {ObjectId} id
 * @returns {Promise<Purchase>}
 */
const getPurchaseById = async (id) => {
  return Purchase.findById(id)
    .populate('supplier') // Populate the 'supplier' field with the referenced supplier document
    .populate('items.product'); // Populate the 'product' field within each item in the items array
};

/**
 * Update purchase by id
 * @param {ObjectId} purchaseId
 * @param {Object} updateBody
 * @returns {Promise<Purchase>}
 */
const updatePurchaseById = async (purchaseId, updateBody) => {
  // Find the purchase by its ID
  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }

  // Loop through the existing items and calculate the stock adjustments and price updates
  for (const updatedItem of updateBody.items || []) {

    // Find the existing purchase item
    const existingItem = purchase.items.find(item => item.product._id.toString() === updatedItem.product.toString());

    if (existingItem) {
      // Find the product to adjust the stock and price
      const product = await Product.findById(updatedItem.product);

      if (product) {
        // Subtract the previous quantity and add the updated quantity
        const previousQuantity = existingItem.quantity;
        const quantityDifference = updatedItem.quantity - previousQuantity;

        // Update the stock quantity
        product.stockQuantity += quantityDifference;

        // Update the product price with the new price
        product.price = updatedItem.priceAtPurchase;

        // Save the product with updated stock and price
        await product.save();
      }
    }
  }

  // Now update the purchase itself
  Object.assign(purchase, updateBody); // Merge the new values into the purchase document
  await purchase.save(); // Save the updated purchase document

  return purchase;
};



/**
 * Delete purchase by id
 * @param {ObjectId} purchaseId
 * @returns {Promise<Purchase>}
 */
const deletePurchaseById = async (purchaseId) => {
  // Find the purchase by its ID
  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Purchase not found');
  }

  // Loop through the items in the purchase and adjust the stock quantity for each product
  for (const item of purchase.items) {
    const product = await Product.findById(item.product);
    
    if (product) {
      // Subtract the purchased quantity from the product's stockQuantity
      product.stockQuantity -= item.quantity;

      // Save the updated product stock
      await product.save();
    }
  }

  // Remove the purchase after adjusting stock quantities
  await purchase.remove();

  return purchase;
};

const getPurchaseByDate = async (filter) => {
  return Purchase.find({
    purchaseDate: {
      $gte: filter.startDate,
      $lte: filter.endDate,
    },
  }).populate('items.product');
};

module.exports = {
  createPurchase,
  queryPurchases,
  getPurchaseById,
  updatePurchaseById,
  deletePurchaseById,
  getPurchaseByDate
};
