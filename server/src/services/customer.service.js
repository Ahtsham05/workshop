const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Customer } = require('../models');
const ApiError = require('../utils/ApiError');
const customerLedgerService = require('./customerLedger.service');
// Shared spreadsheet-cell parsing for the bulk import below — see utils/importRow.js
const { toImportText, parseImportNumber, matchKey, phoneKey, isValidEmail } = require('../utils/importRow');
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

const BULK_IMPORT_CHUNK_SIZE = 500;
// ensureCustomerAccount is a real round trip per customer, so imports run it with
// bounded concurrency — fast enough for a few thousand rows, gentle enough not to open
// a connection per row. Same constant and reasoning as product.service.js's tracked rows.
const ACCOUNT_SETUP_CONCURRENCY = 10;

/**
 * Bulk add customers (Excel/CSV import, or the AI card scanner — both funnel through
 * here).
 *
 * Three things this deliberately does NOT do, each of which it used to:
 *
 *  1. Fail the whole batch over one row. Rows are validated individually and a bad one
 *     comes back with its own reason while the rest import.
 *  2. Show raw driver text. A duplicate or validation failure is rewritten into
 *     something a shopkeeper can act on.
 *  3. Create customers that are subtly different from ones added through the UI.
 *     insertMany() skips createCustomer()'s opening-balance ledger entry and its
 *     subsidiary Accounts-Receivable head, so imported customers used to be invisible to
 *     the accounts system. Both are now set up for every imported customer, and a
 *     failure there is reported as a note rather than throwing away an import that has
 *     already been written.
 *
 * @param {Array} customersToAdd
 * @param {Object} branchContext - { organizationId, branchId, createdBy }
 * @param {Object} [options]
 * @param {'skip'|'update'|'error'} [options.duplicateStrategy='skip'] - What to do with a
 *   row matching a customer that already exists (matched on phone, then email, then
 *   name). Defaults to 'skip' so re-uploading a contact list tops it up instead of
 *   duplicating it or erroring on every known customer.
 * @returns {Promise<Object>}
 */
const bulkAddCustomers = async (customersToAdd, branchContext = {}, options = {}) => {
  const { organizationId, branchId, createdBy } = branchContext;
  const duplicateStrategy = ['skip', 'update', 'error'].includes(options.duplicateStrategy)
    ? options.duplicateStrategy
    : 'skip';

  // The whole branch's customers, projected down to the three fields duplicate matching
  // needs. Fetched in full rather than filtered by this batch's values because matching
  // is normalized (a phone written "+92 300…" here and "0300…" there is one number, and
  // names match case-insensitively) — an $in on the raw values would miss exactly the
  // duplicates this is here to catch. Same approach as category.service.js#bulkAddCategories.
  const existing = await Customer.find({ organizationId, branchId })
    .select('_id name phone email')
    .lean();

  const byPhone = new Map();
  const byEmail = new Map();
  const byName = new Map();
  existing.forEach((customer) => {
    const phone = phoneKey(customer.phone);
    if (phone && !byPhone.has(phone)) byPhone.set(phone, customer);
    const email = matchKey(customer.email);
    if (email && !byEmail.has(email)) byEmail.set(email, customer);
    const name = matchKey(customer.name);
    if (name && !byName.has(name)) byName.set(name, customer);
  });

  const errors = [];
  const warnings = [];
  const validDocs = [];
  const validMeta = [];
  const updateOps = [];
  // Rows deliberately not imported (already saved, or the same customer twice in one file).
  // Deliberately NOT warnings: a warning means "imported, with something worth knowing".
  const skipped = [];
  const seenInBatch = new Map(); // identity key -> row index that first claimed it

  customersToAdd.forEach((row, index) => {
    const fail = (message) => errors.push({ index, name: toImportText(row.name), error: message });

    const name = toImportText(row.name);
    if (!name) return fail('Customer name is empty');

    const balance = parseImportNumber(row.balance);
    if (!balance.valid) return fail(`Opening balance "${row.balance}" is not a number`);

    const creditLimit = parseImportNumber(row.creditLimit);
    if (!creditLimit.valid) return fail(`Credit limit "${row.creditLimit}" is not a number`);

    const phone = toImportText(row.phone);
    const whatsapp = toImportText(row.whatsapp) || phone;
    let email = toImportText(row.email);
    // An unusable email costs the email, not the customer — the rest of the row is fine.
    if (email && !isValidEmail(email)) {
      warnings.push({ index, name, message: `Email "${email}" doesn't look valid — imported without it` });
      email = '';
    }

    const identityKeys = [phoneKey(phone), matchKey(email), matchKey(name)].filter(Boolean);
    const firstSeenAt = identityKeys.map((key) => seenInBatch.get(key)).find((value) => value !== undefined);
    if (firstSeenAt !== undefined) {
      skipped.push({ index, name, reason: `Same customer as row ${firstSeenAt + 1} in this file — imported once` });
      return;
    }
    identityKeys.forEach((key) => seenInBatch.set(key, index));

    const match =
      (phoneKey(phone) && byPhone.get(phoneKey(phone))) ||
      (matchKey(email) && byEmail.get(matchKey(email))) ||
      byName.get(matchKey(name)) ||
      null;

    if (match && duplicateStrategy === 'error') {
      return fail(`"${name}" is already saved as a customer`);
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
      notes: toImportText(row.notes),
    };
    const customerType = matchKey(row.customerType);
    if (['retail', 'wholesale', 'vip', 'corporate'].includes(customerType)) fields.customerType = customerType;
    else if (customerType) warnings.push({ index, name, message: `Customer type "${row.customerType}" is not recognised — imported without it` });
    if (creditLimit.value !== undefined) fields.creditLimit = creditLimit.value;

    if (match && duplicateStrategy === 'update') {
      // Only fields the file actually filled in — an empty cell means "no change",
      // never "erase what's saved". The balance is left alone too: it's a live ledger
      // figure, not a spreadsheet column (see updateCustomerById, which re-syncs the
      // opening-balance entry when it genuinely changes).
      const set = {};
      Object.entries(fields).forEach(([key, value]) => {
        if (value !== '' && value !== undefined) set[key] = value;
      });
      updateOps.push({ index, name, filter: { _id: match._id, organizationId, branchId }, set });
      return;
    }

    validDocs.push({
      ...fields,
      balance: balance.value ?? 0,
      organizationId,
      branchId,
      createdBy,
    });
    validMeta.push({ index, name });
  });

  const insertedCustomers = [];
  for (let i = 0; i < validDocs.length; i += BULK_IMPORT_CHUNK_SIZE) {
    const chunk = validDocs.slice(i, i + BULK_IMPORT_CHUNK_SIZE);
    const chunkMeta = validMeta.slice(i, i + BULK_IMPORT_CHUNK_SIZE);
    try {
      // eslint-disable-next-line no-await-in-loop
      const inserted = await Customer.insertMany(chunk, { ordered: false });
      insertedCustomers.push(...inserted);
    } catch (error) {
      if (!error.writeErrors) throw error;
      insertedCustomers.push(...(error.insertedDocs || []));
      error.writeErrors.forEach((writeError) => {
        const raw = writeError.err || writeError;
        const meta = chunkMeta[writeError.index ?? raw.index] || {};
        errors.push({
          index: meta.index,
          name: meta.name,
          error: raw.errmsg || writeError.errmsg || 'This customer could not be saved',
        });
      });
    }
  }

  let updatedCount = 0;
  if (updateOps.length) {
    try {
      const result = await Customer.bulkWrite(
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
        errors.push({ index: op.index, name: op.name, error: raw.errmsg || 'This customer could not be updated' });
      });
    }
  }

  // Opening-balance ledger entry + subsidiary AR account, exactly as createCustomer()
  // does for a customer added through the UI. Failures here are reported, never thrown:
  // the customer row itself is already saved, and losing the whole response over an
  // accounting hiccup would tell the user nothing was imported when in fact it was.
  for (let i = 0; i < insertedCustomers.length; i += ACCOUNT_SETUP_CONCURRENCY) {
    const chunk = insertedCustomers.slice(i, i + ACCOUNT_SETUP_CONCURRENCY);
    // eslint-disable-next-line no-await-in-loop
    const results = await Promise.allSettled(
      chunk.map(async (customer) => {
        await customerLedgerService.syncOpeningBalanceEntry({
          customerId: customer._id,
          amount: customer.balance || 0,
          organizationId: customer.organizationId,
          branchId: customer.branchId,
          transactionDate: customer.createdAt,
        });
        await accountsSystemService.ensureCustomerAccount(
          { organizationId: customer.organizationId, branchId: customer.branchId, createdBy: customer.createdBy },
          customer,
        );
      }),
    );
    results.forEach((result, position) => {
      if (result.status === 'rejected') {
        warnings.push({
          name: chunk[position].name,
          message: `"${chunk[position].name}" was imported, but its ledger account could not be set up automatically`,
        });
      }
    });
  }

  errors.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  return {
    success: insertedCustomers.length > 0 || updatedCount > 0,
    insertedCount: insertedCustomers.length,
    updatedCount,
    skippedCount: skipped.length,
    skipped,
    duplicateStrategy,
    customers: insertedCustomers,
    errors,
    warnings,
  };
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
