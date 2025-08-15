const httpStatus = require('http-status');
const { Customer, Sale, Transaction, Account } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a customer
 * @param {Object} customerBody
 * @returns {Promise<Customer>}
 */
const createCustomer = async (customerBody) => {
  return Customer.create(customerBody);
};

/**
 * Query for customers
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {number} [options.limit] - Maximum number of results per page
 * @param {number} [options.page] - Current page
 * @param {string} [options.search] - Search query
 * @param {string} [options.fieldName] - Field name to search
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @returns {Promise<QueryResult>}
 */
const queryCustomers = async (filter, options) => {
  const customers = await Customer.paginate(filter, options);
  return customers;
};

/**
 * Get customer by id
 * @param {ObjectId} id
 * @returns {Promise<Customer>}
 */
const getCustomerById = async (id) => {
  return Customer.findById(id);
};

/**
 * Update customer by id
 * @param {ObjectId} customerId
 * @param {Object} updateBody
 * @returns {Promise<Customer>}
 */
const updateCustomerById = async (customerId, updateBody) => {
  const customer = await getCustomerById(customerId);
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  Object.assign(customer, updateBody);
  await customer.save();
  return customer;
};

/**
 * Delete customer by id
 * @param {ObjectId} customerId
 * @returns {Promise<Customer>}
 */
const deleteCustomerById = async (customerId) => {
  const customer = await getCustomerById(customerId);
  if (!customer) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
  }
  await customer.remove();
  return customer;
};

const getAllCustomers = async () => {
  return Customer.find();
}

const getCustomerSalesAndTransactions = async (customerId, startDate, endDate) => {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // Set end date to end of the day

    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Customer not found');
    }

    const account = await Account.find({ customer: customerId });
    if (!account || account.length === 0) {
      throw new ApiError(httpStatus.NOT_FOUND, 'Customer Account not found');
    }

    // Fetch previous sales before the start date
    const previousSale = await Sale.find({
      customer: customerId,
      saleDate: { $lt: start }
    });

    // Fetch all sales within the specified date range
    const sale = await Sale.find({
      customer: customerId,
      saleDate: { $gte: start, $lte: end }
    }).populate('items.product');

    // Fetch all transactions (cashReceived) within the specified date range
    const transactions = await Transaction.find({
      account: account[0]._id,
      transactionType: 'cashReceived',
      transactionDate: { $gte: start, $lte: end }
    });

    // Fetch all transactions (cashReceived) before the start date
    const previousTransactions = await Transaction.find({
      account: account[0]._id,
      transactionType: 'cashReceived',
      transactionDate: { $lt: start }
    });

    return {
      customer,
      previousTransactions,
      previousSale,
      sale,
      transactions
    };
  } catch (error) {
    throw new ApiError(500, 'Error fetching sales and transactions', error.message);
  }
};






module.exports = {
  createCustomer,
  queryCustomers,
  getCustomerById,
  updateCustomerById,
  deleteCustomerById,
  getAllCustomers,
  getCustomerSalesAndTransactions
};
