const httpStatus = require('http-status');
const { Supplier, Customer } = require('../models');
const ApiError = require('../utils/ApiError');
const supplierLedgerService = require('./supplierLedger.service');
const accountsSystemService = require('./accountsSystem.service');

/**
 * Create a supplier
 * @param {Object} supplierBody
 * @returns {Promise<Supplier>}
 */
const createSupplier = async (supplierBody) => {
  const supplier = await Supplier.create(supplierBody);

  await supplierLedgerService.syncOpeningBalanceEntry({
    supplierId: supplier._id,
    amount: supplier.balance || 0,
    organizationId: supplier.organizationId,
    branchId: supplier.branchId,
    transactionDate: supplier.createdAt,
  });

  // Auto-create the supplier's subsidiary account under Accounts Payable.
  try {
    await accountsSystemService.ensureSupplierAccount(
      { organizationId: supplier.organizationId, branchId: supplier.branchId, createdBy: supplier.createdBy },
      supplier
    );
  } catch (err) {
    // Accounting must never block supplier creation.
  }

  await ensureSupplierCustomerAccount(supplier);

  return supplier;
};

/**
 * Every supplier gets a hidden "shadow" Customer record so the normal sale
 * screens (Invoice, Load top-up, SIM sale, Services) can sell products/
 * services to them on account — a supplier can also be a customer. It never
 * appears in the Customers list (isSupplierAccount) and unpaid balances are
 * mirrored into this supplier's own ledger as a debit note by
 * supplierLedger.service.js, netting against what the business owes them.
 * Idempotent — safe to call on suppliers created before this feature shipped.
 * @param {Supplier} supplier
 * @returns {Promise<Supplier>}
 */
const ensureSupplierCustomerAccount = async (supplier) => {
  if (supplier.customerId) return supplier;

  const customer = await Customer.create({
    organizationId: supplier.organizationId,
    branchId: supplier.branchId,
    createdBy: supplier.createdBy,
    name: supplier.name,
    nameUrdu: supplier.nameUrdu,
    email: supplier.email,
    phone: supplier.phone,
    whatsapp: supplier.whatsapp,
    address: supplier.address,
    isSupplierAccount: true,
    linkedSupplierId: supplier._id,
  });

  supplier.customerId = customer._id;
  await supplier.save();
  return supplier;
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
  const updates = { ...updateBody };
  for (const key of ['picture', 'idCardFront', 'idCardBack']) {
    if (updates[key] === null) {
      supplier.set(key, undefined);
      delete updates[key];
    }
  }

  const originalBalance = Number(supplier.balance || 0);
  Object.assign(supplier, updates);
  await supplier.save();

  await ensureSupplierCustomerAccount(supplier);
  if (supplier.customerId) {
    await Customer.updateOne(
      { _id: supplier.customerId },
      {
        name: supplier.name,
        nameUrdu: supplier.nameUrdu,
        email: supplier.email,
        phone: supplier.phone,
        whatsapp: supplier.whatsapp,
        address: supplier.address,
      },
    );
  }

  if (Object.prototype.hasOwnProperty.call(updateBody, 'balance')) {
    const newBalance = Number(supplier.balance || 0);
    if (originalBalance !== newBalance) {
      await supplierLedgerService.syncOpeningBalanceEntry({
        supplierId: supplier._id,
        amount: newBalance,
        organizationId: supplier.organizationId,
        branchId: supplier.branchId,
        transactionDate: supplier.createdAt,
      });
    }
  }

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
  await supplier.deleteOne();
  return supplier;
};

const getAllSuppliers = async (filter = {}) => {
  return Supplier.find(filter);
};

/**
 * Bulk add suppliers (import from Excel)
 * @param {Array} suppliersToAdd - Array of suppliers to create
 * @param {Object} branchContext - Organization and branch context
 * @returns {Promise<Object>}
 */
const bulkAddSuppliers = async (suppliersToAdd, branchContext = {}) => {
  try {
    // Process each supplier to ensure proper data format
    const processedSuppliers = suppliersToAdd.map(supplier => ({
      name: supplier.name,
      nameUrdu: supplier.nameUrdu || '',
      email: supplier.email || '',
      phone: supplier.phone || '',
      whatsapp: supplier.whatsapp || '',
      address: supplier.address || '',
      balance: supplier.balance ? Number(supplier.balance) : 0,
      organizationId: branchContext.organizationId,
      branchId: branchContext.branchId,
    }));

    // Insert suppliers
    const insertedSuppliers = await Supplier.insertMany(processedSuppliers, { 
      ordered: false // Continue inserting even if some fail
    });

    for (const supplier of insertedSuppliers) {
      await supplierLedgerService.syncOpeningBalanceEntry({
        supplierId: supplier._id,
        amount: supplier.balance || 0,
        organizationId: supplier.organizationId,
        branchId: supplier.branchId,
        transactionDate: supplier.createdAt,
      });
    }

    return {
      success: true,
      insertedCount: insertedSuppliers.length,
      suppliers: insertedSuppliers
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
        suppliers: successfulInserts,
        errors: failedInserts
      };
    }
    throw error;
  }
};

module.exports = {
  createSupplier,
  ensureSupplierCustomerAccount,
  querySuppliers,
  getSupplierById,
  updateSupplierById,
  deleteSupplierById,
  getAllSuppliers,
  bulkAddSuppliers,
};
