const httpStatus = require('http-status');
const { Customer } = require('../models');
const ApiError = require('../utils/ApiError');
const customerLedgerService = require('./customerLedger.service');

/**
 * Create a customer
 * @param {Object} customerBody
 * @returns {Promise<Customer>}
 */
const createCustomer = async (customerBody) => {
  const customer = await Customer.create(customerBody);

  await customerLedgerService.syncOpeningBalanceEntry({
    customerId: customer._id,
    amount: customer.balance || 0,
    organizationId: customer.organizationId,
    branchId: customer.branchId,
    transactionDate: customer.createdAt,
  });

  return customer;
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

  const originalBalance = Number(customer.balance || 0);
  Object.assign(customer, updateBody);
  await customer.save();

  if (Object.prototype.hasOwnProperty.call(updateBody, 'balance')) {
    const newBalance = Number(customer.balance || 0);
    if (originalBalance !== newBalance) {
      await customerLedgerService.syncOpeningBalanceEntry({
        customerId: customer._id,
        amount: newBalance,
        organizationId: customer.organizationId,
        branchId: customer.branchId,
        transactionDate: customer.createdAt,
      });
    }
  }

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
  await customer.deleteOne();
  return customer;
};

const getAllCustomers = async (filter = {}) => {
  return Customer.find(filter);
}

/**
 * Bulk add customers (import from Excel)
 * @param {Array} customersToAdd - Array of customers to create
 * @returns {Promise<Object>}
 */
const bulkAddCustomers = async (customersToAdd, branchContext = {}) => {
  try {
    // Process each customer to ensure proper data format
    const processedCustomers = customersToAdd.map(customer => ({
      name: customer.name,
      email: customer.email || '',
      phone: customer.phone || '',
      whatsapp: customer.whatsapp || '',
      address: customer.address || '',
      balance: customer.balance ? Number(customer.balance) : 0,
      organizationId: branchContext.organizationId,
      branchId: branchContext.branchId,
    }));

    // Insert customers
    const insertedCustomers = await Customer.insertMany(processedCustomers, { 
      ordered: false // Continue inserting even if some fail (e.g., duplicates)
    });

    // Sync opening balance ledger entries for imported customers
    for (const customer of insertedCustomers) {
      await customerLedgerService.syncOpeningBalanceEntry({
        customerId: customer._id,
        amount: customer.balance || 0,
        organizationId: customer.organizationId,
        branchId: customer.branchId,
        transactionDate: customer.createdAt,
      });
    }

    return {
      success: true,
      insertedCount: insertedCustomers.length,
      customers: insertedCustomers
    };
  } catch (error) {
    // Handle bulk insert errors
    if (error.writeErrors) {
      const successfulInserts = error.insertedDocs || [];
      const failedInserts = error.writeErrors.map(err => ({
        index: err.index,
        error: err.errmsg
      }));

      return {
        success: true,
        insertedCount: successfulInserts.length,
        customers: successfulInserts,
        errors: failedInserts
      };
    }
    throw error;
  }
};

module.exports = {
  createCustomer,
  queryCustomers,
  getCustomerById,
  updateCustomerById,
  deleteCustomerById,
  getAllCustomers,
  bulkAddCustomers,
};
