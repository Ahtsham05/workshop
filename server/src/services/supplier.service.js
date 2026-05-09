const httpStatus = require('http-status');
const { Supplier } = require('../models');
const ApiError = require('../utils/ApiError');
const supplierLedgerService = require('./supplierLedger.service');

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
  querySuppliers,
  getSupplierById,
  updateSupplierById,
  deleteSupplierById,
  getAllSuppliers,
  bulkAddSuppliers,
};
