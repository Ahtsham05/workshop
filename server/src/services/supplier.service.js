const httpStatus = require('http-status');
const { Supplier, Purchase, Transaction, Account } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a supplier
 * @param {Object} supplierBody
 * @returns {Promise<Supplier>}
 */
const createSupplier = async (supplierBody) => {
  return Supplier.create(supplierBody);
};

/**
 * Query for suppliers
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {number} [options.limit] - Maximum number of results per page
 * @param {number} [options.page] - Current page
 * @param {string} [options.search] - Search query
 * @returns {Promise<QueryResult>}
 */
const querySuppliers = async (filter, options) => {
  const suppliers = await Supplier.paginate(filter, options);
  return suppliers;
};

/**
 * Get supplier by id
 * @param {ObjectId} id
 * @returns {Promise<Supplier>}
 */
const getSupplierById = async (id) => {
  return Supplier.findById(id);
};

/**
 * Update supplier by id
 * @param {ObjectId} supplierId
 * @param {Object} updateBody
 * @returns {Promise<Supplier>}
 */
const updateSupplierById = async (supplierId, updateBody) => {
  const supplier = await getSupplierById(supplierId);
  if (!supplier) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
  }
  Object.assign(supplier, updateBody);
  await supplier.save();
  return supplier;
};

/**
 * Delete supplier by id
 * @param {ObjectId} supplierId
 * @returns {Promise<Supplier>}
 */
const deleteSupplierById = async (supplierId) => {
  const supplier = await getSupplierById(supplierId);
  if (!supplier) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
  }
  await supplier.remove();
  return supplier;
};

const getAllSuppliers = async () => {
  return Supplier.find();
};


const getSupplierPurchaseAndTransactions = async (supplierId, startDate, endDate) => {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Set end date to end of the day

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Supplier not found');
    }

    const account = await Account.find({ supplier: supplierId });
    if (!account || account.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Supplier Account not found');
    }

    // Fetch previous purchase before the start date
    const previousPurchase = await Purchase.find({
      supplier: supplierId,
      purchaseDate: { $lt: start }
    });

    // Fetch all purchase within the specified date range
    const purchase = await Purchase.find({
      supplier: supplierId,
      purchaseDate: { $gte: start, $lte: end }
    }).populate('items.product');

    // Fetch all transactions (cashReceived) within the specified date range
    const transactions = await Transaction.find({
      account: account[0]._id,
      transactionType: 'expenseVoucher',
      transactionDate: { $gte: start, $lte: end }
    });

    // Fetch all transactions (cashReceived) before the start date
    const previousTransactions = await Transaction.find({
      account: account[0]._id,
      transactionType: 'expenseVoucher',
      transactionDate: { $lt: start }
    });

    return {
      supplier,
      previousTransactions,
      previousPurchase,
      purchase,
      transactions
    };
  } catch (error) {
    throw new ApiError(500, 'Error fetching Purchases and transactions', error.message);
  }
};

module.exports = {
  createSupplier,
  querySuppliers,
  getSupplierById,
  updateSupplierById,
  deleteSupplierById,
  getAllSuppliers,
  getSupplierPurchaseAndTransactions
};
