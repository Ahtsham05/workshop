const httpStatus = require('http-status');
const { Sale, Product } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a sale record
 * @param {Object} saleBody
 * @returns {Promise<Sale>}
 */
const createSale = async (saleBody) => {
  // First, create the sale
  const sale = await Sale.create(saleBody);

  // Now, update the stock quantity of each product in the sale
  for (const item of sale.items) {
    const product = await Product.findById(item.product);

    if (product) {
      // Decrease stock quantity based on the sold quantity
      product.stockQuantity -= item.quantity;

      // Save the updated product
      await product.save();
    }
  }

  // Recalculate total profit for the sale
  sale.calculateTotalProfit();

  // Save the sale with updated profit
  await sale.save();

  return sale;
};

/**
 * Query for sales
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const querySales = async (filter, options) => {
  options.populate = 'customer';
  const sales = await Sale.paginate(filter, options);
  return sales;
};

/**
 * Get sale by id
 * @param {ObjectId} id
 * @returns {Promise<Sale>}
 */
const getSaleById = async (id) => {
  return Sale.findById(id)
    .populate('customer') // Populate the 'customer' field with the referenced customer document
    .populate('items.product'); // Populate the 'product' field within each item in the items array
};

/**
 * Update sale by id
 * @param {ObjectId} saleId
 * @param {Object} updateBody
 * @returns {Promise<Sale>}
 */
const updateSaleById = async (saleId, updateBody) => {
  const sale = await getSaleById(saleId);
  if (!sale) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  }

  // Loop through the existing items and adjust the stock quantity
  for (const updatedItem of updateBody.items || []) {
    const existingItem = sale.items.find(item => item.product._id.toString() === updatedItem.product.toString());

    if (existingItem) {
      const product = await Product.findById(updatedItem.product);

      if (product) {
        // Adjust the stock quantity based on the difference
        const previousQuantity = existingItem.quantity;
        const quantityDifference = updatedItem.quantity - previousQuantity;

        product.stockQuantity -= quantityDifference; // Decrease stock
        product.price = updatedItem.priceAtSale;

        // Save updated product
        await product.save();
      }
    }
  }

  // Update sale data
  Object.assign(sale, updateBody);
  sale.calculateTotalProfit();
  await sale.save();

  return sale;
};

/**
 * Delete sale by id
 * @param {ObjectId} saleId
 * @returns {Promise<Sale>}
 */
const deleteSaleById = async (saleId) => {
  const sale = await getSaleById(saleId);
  if (!sale) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Sale not found');
  }

  // Adjust stock quantities for the sold items
  for (const item of sale.items) {
    const product = await Product.findById(item.product);
    if (product) {
      product.stockQuantity += item.quantity; // Increase stock quantity
      await product.save();
    }
  }

  // Remove the sale record
  await sale.remove();

  return sale;
};


const getSaleByDate = async (filter) => {
  const sale = await Sale.find({
    saleDate: {
      $gte: new Date(filter.startDate),
      $lte: new Date(filter.endDate),
    },
  }).populate('items.product');
  return sale;
};


module.exports = {
  createSale,
  querySales,
  getSaleById,
  updateSaleById,
  deleteSaleById,
  getSaleByDate,
};
