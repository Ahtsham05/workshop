const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Customer } = require('../models');
const ApiError = require('../utils/ApiError');
const customerLedgerService = require('./customerLedger.service');
const accountsSystemService = require('./accountsSystem.service');

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

  // Auto-create the customer's subsidiary account under Accounts Receivable.
  try {
    await accountsSystemService.ensureCustomerAccount(
      { organizationId: customer.organizationId, branchId: customer.branchId, createdBy: customer.createdBy },
      customer
    );
  } catch (err) {
    // Accounting must never block customer creation.
  }

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

  const updates = { ...updateBody };
  for (const key of ['picture', 'idCardFront', 'idCardBack']) {
    if (updates[key] === null) {
      customer.set(key, undefined);
      delete updates[key];
    }
  }

  const originalBalance = Number(customer.balance || 0);
  Object.assign(customer, updates);
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

/**
 * Live customer counts + outstanding balance for the list page's stat cards.
 * Outstanding balance mirrors accounts-dashboard.tsx's totalReceivables definition
 * (sum of positive balances only — a negative balance is money owed *to* the
 * customer, not receivable).
 * @param {Object} filter - Mongo filter (already branch/employee/supplier scoped)
 */
const getCustomerStats = async (filter) => {
  const startOfMonth = new Date();
  startOfMonth.setHours(0, 0, 0, 0);
  startOfMonth.setDate(1);

  // Unlike find()/countDocuments(), aggregate()'s $match does NOT run Mongoose's
  // schema-based query casting — a string organizationId/branchId (as applyBranchFilter
  // sets from req.organizationId/req.branchId) would compare against the field's real
  // ObjectId-typed value and match nothing, silently zeroing out the balance sum. Cast
  // explicitly, same pattern as product/cashBook/expense services' aggregate filters.
  const castFilter = { ...filter };
  if (castFilter.organizationId && mongoose.Types.ObjectId.isValid(castFilter.organizationId)) {
    castFilter.organizationId = new mongoose.Types.ObjectId(String(castFilter.organizationId));
  }
  if (castFilter.branchId && mongoose.Types.ObjectId.isValid(castFilter.branchId)) {
    castFilter.branchId = new mongoose.Types.ObjectId(String(castFilter.branchId));
  }

  const [totalCustomers, newThisMonth, balanceAgg] = await Promise.all([
    Customer.countDocuments(filter),
    Customer.countDocuments({ ...filter, createdAt: { $gte: startOfMonth } }),
    Customer.aggregate([
      { $match: castFilter },
      { $group: { _id: null, outstandingBalance: { $sum: { $max: [{ $ifNull: ['$balance', 0] }, 0] } } } },
    ]),
  ]);

  return {
    totalCustomers,
    newThisMonth,
    outstandingBalance: balanceAgg[0]?.outstandingBalance || 0,
  };
};

// Excludes deactivated customers from every "pick a customer" picker (Invoice, POS,
// Load/Sim-Sale/Services, header search — anything built on getAllCustomers below)
// without a backfill migration: `$ne: false` matches `isActive: true` AND any customer
// created before this field existed (absent in Mongo — a plain `{ isActive: true }`
// filter would wrongly exclude those). The Customers admin list (queryCustomers) is
// deliberately NOT filtered here — deactivated customers still need to show there, with
// their own Active/Inactive toggle. Same pattern as product.service.js.
const ACTIVE_ONLY_FILTER = { isActive: { $ne: false } };

const getAllCustomers = async (filter = {}, { includeEmployees = false, includeSuppliers = false } = {}) => {
  const query = { ...filter, ...ACTIVE_ONLY_FILTER };
  if (!includeEmployees) {
    query.isEmployeeAccount = { $ne: true };
  }
  if (!includeSuppliers) {
    query.isSupplierAccount = { $ne: true };
  }
  return Customer.find(query);
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
      nameUrdu: customer.nameUrdu || '',
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

/**
 * Bulk activate/deactivate (or otherwise patch) customers in one call — the Customers
 * list's "Activate/Deactivate selected" actions. Only `isActive` is supported today;
 * unlike updateCustomerById this is a direct bulkWrite, so it deliberately skips the
 * ledger/accounting side effects a balance change there would trigger.
 * @param {{ id: string, isActive?: boolean }[]} customersToUpdate
 */
const bulkUpdateCustomers = async (customersToUpdate) => {
  const bulkOps = customersToUpdate
    .filter((customer) => customer.isActive !== undefined)
    .map((customer) => ({
      updateOne: {
        filter: { _id: customer.id },
        update: { $set: { isActive: customer.isActive } },
      },
    }));

  if (bulkOps.length === 0) {
    return { modifiedCount: 0 };
  }

  const result = await Customer.bulkWrite(bulkOps);
  return { modifiedCount: result.modifiedCount };
};

/**
 * Deletes multiple customers by id in one call, for the Customers list's bulk-delete
 * action. Ids that don't match an existing customer are silently skipped and reported
 * back as `notFoundIds` rather than failing the whole batch.
 * @param {string[]} ids
 * @returns {Promise<{ deleted: Customer[], notFoundIds: string[] }>}
 */
const bulkDeleteCustomersByIds = async (ids) => {
  const customers = await Customer.find({ _id: { $in: ids } });
  const foundIds = new Set(customers.map((customer) => customer._id.toString()));
  const notFoundIds = ids.filter((id) => !foundIds.has(id));

  await Customer.deleteMany({ _id: { $in: customers.map((customer) => customer._id) } });

  return { deleted: customers, notFoundIds };
};

module.exports = {
  createCustomer,
  queryCustomers,
  getCustomerById,
  updateCustomerById,
  deleteCustomerById,
  bulkDeleteCustomersByIds,
  bulkUpdateCustomers,
  getAllCustomers,
  getCustomerStats,
  bulkAddCustomers,
};
