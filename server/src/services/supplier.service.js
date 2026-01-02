const httpStatus = require('http-status');
const { Supplier, Purchase, Transaction, SupplierLedger } = require('../models');
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

/**
 * Bulk add suppliers (import from Excel)
 * @param {Array} suppliersToAdd - Array of suppliers to create
 * @returns {Promise<Object>}
 */
const bulkAddSuppliers = async (suppliersToAdd) => {
  try {
    // Process each supplier to ensure proper data format
    const processedSuppliers = suppliersToAdd.map(supplier => ({
      name: supplier.name,
      email: supplier.email || '',
      phone: supplier.phone || '',
      whatsapp: supplier.whatsapp || '',
      address: supplier.address || '',
      balance: supplier.balance ? Number(supplier.balance) : 0,
    }));

    // Insert suppliers
    const insertedSuppliers = await Supplier.insertMany(processedSuppliers, { 
      ordered: false // Continue inserting even if some fail
    });

    // Create opening balance ledger entries for suppliers with balance > 0
    const ledgerEntries = [];
    for (const supplier of insertedSuppliers) {
      if (supplier.balance && supplier.balance > 0) {
        ledgerEntries.push({
          supplier: supplier._id,
          transactionType: 'opening_balance',
          transactionDate: new Date(),
          description: 'Opening Balance',
          debit: 0,
          credit: supplier.balance,
          balance: supplier.balance,
        });
      }
    }

    // Batch insert ledger entries if any
    if (ledgerEntries.length > 0) {
      await SupplierLedger.insertMany(ledgerEntries);
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
