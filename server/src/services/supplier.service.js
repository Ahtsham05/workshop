const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Supplier, Customer } = require('../models');
const ApiError = require('../utils/ApiError');
const supplierLedgerService = require('./supplierLedger.service');
// Shared spreadsheet-cell parsing for the bulk import below — see utils/importRow.js
const { toImportText, parseImportNumber, matchKey, phoneKey, isValidEmail } = require('../utils/importRow');
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

// Excludes deactivated suppliers from every "pick a supplier" picker (Purchase, header
// search — anything built on getAllSuppliers below) without a backfill migration:
// `$ne: false` matches `isActive: true` AND any supplier created before this field
// existed (absent in Mongo — a plain `{ isActive: true }` filter would wrongly exclude
// those). The Suppliers admin list (querySuppliers) is deliberately NOT filtered here —
// deactivated suppliers still need to show there, with their own Active/Inactive
// toggle. Same pattern as product/customer.service.js.
const ACTIVE_ONLY_FILTER = { isActive: { $ne: false } };

const getAllSuppliers = async (filter = {}) => {
  return Supplier.find({ ...filter, ...ACTIVE_ONLY_FILTER });
};

const BULK_IMPORT_CHUNK_SIZE = 500;
// Each imported supplier needs its ledger entry, its Accounts-Payable head and its
// shadow customer record — real round trips, so they run with bounded concurrency
// rather than one at a time or all at once. Same constant as customer.service.js.
const ACCOUNT_SETUP_CONCURRENCY = 10;

/**
 * Bulk add suppliers (Excel/CSV import, or the AI card scanner).
 *
 * Mirrors customer.service.js#bulkAddCustomers: per-row validation with a usable reason,
 * duplicate matching on phone → email → name, and readable messages instead of raw
 * driver text.
 *
 * It also finishes the job insertMany() alone could not. createSupplier() does three
 * things beyond writing the row — the opening-balance ledger entry, the subsidiary
 * Accounts-Payable head, and the shadow Customer record that lets a supplier be sold to
 * through the normal sale screens. A bulk-imported supplier used to get none of them,
 * which is why a backfill script exists for exactly this gap
 * (scripts/backfill-supplier-customer-accounts.js). Imports now set all three up, and
 * report a failure as a note instead of discarding an import that is already saved.
 *
 * @param {Array} suppliersToAdd
 * @param {Object} branchContext - { organizationId, branchId, createdBy }
 * @param {Object} [options]
 * @param {'skip'|'update'|'error'} [options.duplicateStrategy='skip']
 * @returns {Promise<Object>}
 */
const bulkAddSuppliers = async (suppliersToAdd, branchContext = {}, options = {}) => {
  const { organizationId, branchId, createdBy } = branchContext;
  const duplicateStrategy = ['skip', 'update', 'error'].includes(options.duplicateStrategy)
    ? options.duplicateStrategy
    : 'skip';

  // The whole branch's suppliers, projected down to the three fields duplicate matching
  // needs. Fetched in full rather than filtered by this batch's values because matching
  // is normalized (a phone written "+92 300…" here and "0300…" there is one number, and
  // names match case-insensitively) — an $in on the raw values would miss exactly the
  // duplicates this is here to catch.
  const existing = await Supplier.find({ organizationId, branchId }).select('_id name phone email').lean();
  const byPhone = new Map();
  const byEmail = new Map();
  const byName = new Map();
  existing.forEach((supplier) => {
    const phone = phoneKey(supplier.phone);
    if (phone && !byPhone.has(phone)) byPhone.set(phone, supplier);
    const email = matchKey(supplier.email);
    if (email && !byEmail.has(email)) byEmail.set(email, supplier);
    const name = matchKey(supplier.name);
    if (name && !byName.has(name)) byName.set(name, supplier);
  });

  const errors = [];
  const warnings = [];
  const validDocs = [];
  const validMeta = [];
  const updateOps = [];
  // Rows deliberately not imported (already saved, or the same supplier twice in one file).
  // Deliberately NOT warnings: a warning means "imported, with something worth knowing".
  const skipped = [];
  const seenInBatch = new Map();

  suppliersToAdd.forEach((row, index) => {
    const fail = (message) => errors.push({ index, name: toImportText(row.name), error: message });

    const name = toImportText(row.name);
    if (!name) return fail('Supplier name is empty');

    const balance = parseImportNumber(row.balance);
    if (!balance.valid) return fail(`Opening balance "${row.balance}" is not a number`);

    const phone = toImportText(row.phone);
    const whatsapp = toImportText(row.whatsapp) || phone;
    let email = toImportText(row.email);
    if (email && !isValidEmail(email)) {
      warnings.push({ index, name, message: `Email "${email}" doesn't look valid — imported without it` });
      email = '';
    }

    const identityKeys = [phoneKey(phone), matchKey(email), matchKey(name)].filter(Boolean);
    const firstSeenAt = identityKeys.map((key) => seenInBatch.get(key)).find((value) => value !== undefined);
    if (firstSeenAt !== undefined) {
      skipped.push({ index, name, reason: `Same supplier as row ${firstSeenAt + 1} in this file — imported once` });
      return;
    }
    identityKeys.forEach((key) => seenInBatch.set(key, index));

    const match =
      (phoneKey(phone) && byPhone.get(phoneKey(phone))) ||
      (matchKey(email) && byEmail.get(matchKey(email))) ||
      byName.get(matchKey(name)) ||
      null;

    if (match && duplicateStrategy === 'error') {
      return fail(`"${name}" is already saved as a supplier`);
    }
    if (match && duplicateStrategy === 'skip') {
      skipped.push({ index, name, reason: `"${name}" is already saved — left unchanged` });
      return;
    }

    const fields = {
      name,
      nameUrdu: toImportText(row.nameUrdu),
      email,
      phone,
      whatsapp,
      address: toImportText(row.address),
      taxNumber: toImportText(row.taxNumber),
    };

    if (match && duplicateStrategy === 'update') {
      // Empty cell means "leave it alone", never "clear it". Balance stays out of it —
      // it's a ledger figure, not a spreadsheet column.
      const set = {};
      Object.entries(fields).forEach(([key, value]) => {
        if (value !== '' && value !== undefined) set[key] = value;
      });
      updateOps.push({ index, name, filter: { _id: match._id, organizationId, branchId }, set });
      return;
    }

    validDocs.push({ ...fields, balance: balance.value ?? 0, organizationId, branchId, createdBy });
    validMeta.push({ index, name });
  });

  const insertedSuppliers = [];
  for (let i = 0; i < validDocs.length; i += BULK_IMPORT_CHUNK_SIZE) {
    const chunk = validDocs.slice(i, i + BULK_IMPORT_CHUNK_SIZE);
    const chunkMeta = validMeta.slice(i, i + BULK_IMPORT_CHUNK_SIZE);
    try {
      // eslint-disable-next-line no-await-in-loop
      const inserted = await Supplier.insertMany(chunk, { ordered: false });
      insertedSuppliers.push(...inserted);
    } catch (error) {
      if (!error.writeErrors) throw error;
      insertedSuppliers.push(...(error.insertedDocs || []));
      error.writeErrors.forEach((writeError) => {
        const raw = writeError.err || writeError;
        const meta = chunkMeta[writeError.index ?? raw.index] || {};
        errors.push({
          index: meta.index,
          name: meta.name,
          error: raw.errmsg || writeError.errmsg || 'This supplier could not be saved',
        });
      });
    }
  }

  let updatedCount = 0;
  if (updateOps.length) {
    try {
      const result = await Supplier.bulkWrite(
        updateOps.map((op) => ({ updateOne: { filter: op.filter, update: { $set: op.set } } })),
        { ordered: false },
      );
      updatedCount = Math.max(result.modifiedCount ?? 0, result.matchedCount ?? 0);
    } catch (error) {
      const writeErrors = error.writeErrors || [];
      if (!writeErrors.length) throw error;
      updatedCount = Math.max(updateOps.length - writeErrors.length, 0);
      writeErrors.forEach((writeError) => {
        const raw = writeError.err || writeError;
        const op = updateOps[writeError.index ?? raw.index] || {};
        errors.push({ index: op.index, name: op.name, error: raw.errmsg || 'This supplier could not be updated' });
      });
    }
  }

  for (let i = 0; i < insertedSuppliers.length; i += ACCOUNT_SETUP_CONCURRENCY) {
    const chunk = insertedSuppliers.slice(i, i + ACCOUNT_SETUP_CONCURRENCY);
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.allSettled(
      chunk.map(async (supplier) => {
        await supplierLedgerService.syncOpeningBalanceEntry({
          supplierId: supplier._id,
          amount: supplier.balance || 0,
          organizationId: supplier.organizationId,
          branchId: supplier.branchId,
          transactionDate: supplier.createdAt,
        });
        try {
          await accountsSystemService.ensureSupplierAccount(
            { organizationId: supplier.organizationId, branchId: supplier.branchId, createdBy: supplier.createdBy },
            supplier,
          );
        } catch (err) {
          // Accounting must never block supplier creation — same rule as createSupplier().
        }
        await ensureSupplierCustomerAccount(supplier);
      }),
    );
    results.forEach((result, position) => {
      if (result.status === 'rejected') {
        warnings.push({
          name: chunk[position].name,
          message: `"${chunk[position].name}" was imported, but its ledger/billing account could not be set up automatically`,
        });
      }
    });
  }

  errors.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  return {
    success: insertedSuppliers.length > 0 || updatedCount > 0,
    insertedCount: insertedSuppliers.length,
    updatedCount,
    skippedCount: skipped.length,
    skipped,
    duplicateStrategy,
    suppliers: insertedSuppliers,
    errors,
    warnings,
  };
};

/**
 * Live supplier counts + outstanding payable for the list page's stat cards.
 * Outstanding payable is the sum of positive balances (a negative balance means the
 * supplier owes us, not the other way round — same sign convention as customer.balance,
 * see supplier-ledger-list.tsx's Payable/Receivable/Settled labeling).
 * @param {Object} filter - Mongo filter (already branch-scoped)
 */
const getSupplierStats = async (filter) => {
  const startOfMonth = new Date();
  startOfMonth.setHours(0, 0, 0, 0);
  startOfMonth.setDate(1);

  // Unlike find()/countDocuments(), aggregate()'s $match does NOT run Mongoose's
  // schema-based query casting — a string organizationId/branchId (as applyBranchFilter
  // sets from req.organizationId/req.branchId) would compare against the field's real
  // ObjectId-typed value and match nothing, silently zeroing out the balance sum. Cast
  // explicitly, same pattern as customer/product/cashBook services' aggregate filters.
  const castFilter = { ...filter };
  if (castFilter.organizationId && mongoose.Types.ObjectId.isValid(castFilter.organizationId)) {
    castFilter.organizationId = new mongoose.Types.ObjectId(String(castFilter.organizationId));
  }
  if (castFilter.branchId && mongoose.Types.ObjectId.isValid(castFilter.branchId)) {
    castFilter.branchId = new mongoose.Types.ObjectId(String(castFilter.branchId));
  }

  const [totalSuppliers, newThisMonth, balanceAgg] = await Promise.all([
    Supplier.countDocuments(filter),
    Supplier.countDocuments({ ...filter, createdAt: { $gte: startOfMonth } }),
    Supplier.aggregate([
      { $match: castFilter },
      { $group: { _id: null, outstandingPayable: { $sum: { $max: [{ $ifNull: ['$balance', 0] }, 0] } } } },
    ]),
  ]);

  return {
    totalSuppliers,
    newThisMonth,
    outstandingPayable: balanceAgg[0]?.outstandingPayable || 0,
  };
};

/**
 * Bulk activate/deactivate (or otherwise patch) suppliers in one call — the Suppliers
 * list's "Activate/Deactivate selected" actions. Only `isActive` is supported today;
 * unlike updateSupplierById this is a direct bulkWrite, so it deliberately skips the
 * ledger/accounting side effects a balance change there would trigger.
 * @param {{ id: string, isActive?: boolean }[]} suppliersToUpdate
 */
const bulkUpdateSuppliers = async (suppliersToUpdate) => {
  const bulkOps = suppliersToUpdate
    .filter((supplier) => supplier.isActive !== undefined)
    .map((supplier) => ({
      updateOne: {
        filter: { _id: supplier.id },
        update: { $set: { isActive: supplier.isActive } },
      },
    }));

  if (bulkOps.length === 0) {
    return { modifiedCount: 0 };
  }

  const result = await Supplier.bulkWrite(bulkOps);
  return { modifiedCount: result.modifiedCount };
};

/**
 * Deletes multiple suppliers by id in one call, for the Suppliers list's bulk-delete
 * action. Ids that don't match an existing supplier are silently skipped and reported
 * back as `notFoundIds` rather than failing the whole batch.
 * @param {string[]} ids
 * @returns {Promise<{ deleted: Supplier[], notFoundIds: string[] }>}
 */
const bulkDeleteSuppliersByIds = async (ids) => {
  const suppliers = await Supplier.find({ _id: { $in: ids } });
  const foundIds = new Set(suppliers.map((supplier) => supplier._id.toString()));
  const notFoundIds = ids.filter((id) => !foundIds.has(id));

  await Supplier.deleteMany({ _id: { $in: suppliers.map((supplier) => supplier._id) } });

  return { deleted: suppliers, notFoundIds };
};

module.exports = {
  createSupplier,
  ensureSupplierCustomerAccount,
  querySuppliers,
  getSupplierById,
  updateSupplierById,
  deleteSupplierById,
  bulkDeleteSuppliersByIds,
  bulkUpdateSuppliers,
  getAllSuppliers,
  getSupplierStats,
  bulkAddSuppliers,
};
