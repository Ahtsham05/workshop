const httpStatus = require('http-status');
const mongoose = require('mongoose');
const { Expense } = require('../models');
const ApiError = require('../utils/ApiError');
const cashBookService = require('./cashBook.service');
const walletService = require('./wallet.service');
const walletEntryService = require('./walletEntry.service');
const accountsSystemService = require('./accountsSystem.service');
const expenseCategoryService = require('./expenseCategory.service');
const { addTokenSearch } = require('../utils/searchQuery');
const { runSerial } = require('../utils/serialQueue');
const { atBusinessTimeOfDay, toBusinessCalendarDate } = require('../utils/businessTimezone');

/**
 * Post (or re-post) the double-entry journal entry for an expense. Fire-and-forget.
 * Direct expenses debit Direct Expenses (under Cost of Sales); indirect ones the general
 * expense ledger — or, for either, the account mapped on the category.
 */
const postExpenseToAccounts = (expense) => {
  if (!expense) return;
  // One organization's postings run one after another (utils/serialQueue.js, the same queue as the
  // customer/supplier ledgers): an Expense Voucher or an import saves lines back to back,
  // and their fire-and-forget postings used to overlap — both creating the same ledger head
  // (a bank account's head, Direct Expenses) — so one lost on a duplicate key and that
  // expense silently never reached the books.
  runSerial(expense.organizationId, () => expenseCategoryService
    .getCategoryClassification(expense.organizationId, expense.branchId, expense.category)
    .catch(() => ({ accountCode: null }))
    .then(({ accountCode }) =>
      accountsSystemService.postGeneralExpense(
        { organizationId: expense.organizationId, branchId: expense.branchId, createdBy: expense.createdBy },
        {
          amount: expense.amount,
          paymentMethod: expense.paymentMethod,
          walletType: expense.walletType,
          expenseAccountCode: accountCode || undefined,
          expenseNature: expense.expenseNature || 'indirect',
          expenseId: expense._id,
          description: expense.description || expense.category || 'Expense',
          date: expense.date,
        }
      )
    ))
    .catch(() => {});
};

/** Stamp the category's Direct/Indirect classification onto an expense body. */
const applyCategoryClassification = async (body) => {
  if (!body || !body.category) return body;
  const { expenseNature } = await expenseCategoryService.getCategoryClassification(
    body.organizationId,
    body.branchId,
    body.category
  );
  // eslint-disable-next-line no-param-reassign
  body.expenseNature = expenseNature;
  return body;
};

/**
 * Keep the cash book / wallet ledger and wallet balance in sync with an
 * expense's payment method. Mirrors the same pattern invoice.service.js uses
 * for invoice wallet payments: wallet-paid expenses live in the Wallet module
 * only (not the cash book), and the wallet balance is debited/reversed as the
 * expense is created, edited, or deleted.
 */
const syncExpenseCashAndWalletEntries = async (expense, previousPaymentMethod, previousWalletType, previousAmount) => {
  const amount = Number(expense.amount || 0);
  const isWalletPayment = expense.paymentMethod === 'Wallet' && expense.walletType;

  if (!isWalletPayment) {
    await cashBookService.upsertReferenceEntry({
      organizationId: expense.organizationId,
      branchId: expense.branchId,
      type: 'expense',
      source: 'expense',
      amount,
      paymentMethod: expense.paymentMethod,
      referenceId: expense._id,
      referenceModel: 'Expense',
      description: expense.description,
      date: expense.date,
      createdBy: expense.createdBy,
    });
  } else {
    await cashBookService.deleteEntriesByReference(expense._id, 'Expense');
  }

  if (isWalletPayment && amount > 0) {
    await walletEntryService.upsertReferenceEntry({
      organizationId: expense.organizationId,
      branchId: expense.branchId,
      walletType: expense.walletType.trim(),
      type: 'out',
      amount,
      referenceId: expense._id,
      referenceModel: 'Expense',
      description: `Wallet payment for expense: ${expense.description || expense.category || ''}`.trim(),
      date: expense.date,
      createdBy: expense.createdBy,
    });
  } else {
    await walletEntryService.deleteEntriesByReference(expense._id, 'Expense');
  }

  const prevIsWalletPayment = previousPaymentMethod === 'Wallet' && previousWalletType;
  const prevAmt = Number(previousAmount || 0);

  if (isWalletPayment) {
    const walletTypeName = expense.walletType.trim();
    if (prevIsWalletPayment) {
      const prevWalletName = previousWalletType.trim();
      if (prevWalletName !== walletTypeName) {
        // Wallet changed — refund the old wallet, debit the new one
        if (prevAmt > 0) {
          await walletService.adjustWalletBalance({
            organizationId: expense.organizationId,
            branchId: expense.branchId,
            type: prevWalletName,
            amount: prevAmt,
            operation: 'add',
            userId: expense.updatedBy || expense.createdBy,
          });
        }
        await walletService.adjustWalletBalance({
          organizationId: expense.organizationId,
          branchId: expense.branchId,
          type: walletTypeName,
          amount,
          operation: 'deduct',
          userId: expense.updatedBy || expense.createdBy,
        });
      } else {
        // Same wallet, amount may have changed — adjust the delta
        const delta = amount - prevAmt;
        if (delta !== 0) {
          await walletService.adjustWalletBalance({
            organizationId: expense.organizationId,
            branchId: expense.branchId,
            type: walletTypeName,
            amount: Math.abs(delta),
            operation: delta > 0 ? 'deduct' : 'add',
            userId: expense.updatedBy || expense.createdBy,
          });
        }
      }
    } else if (amount > 0) {
      await walletService.adjustWalletBalance({
        organizationId: expense.organizationId,
        branchId: expense.branchId,
        type: walletTypeName,
        amount,
        operation: 'deduct',
        userId: expense.updatedBy || expense.createdBy,
      });
    }
  } else if (prevIsWalletPayment && prevAmt > 0) {
    // Payment method changed away from wallet — refund the old wallet
    await walletService.adjustWalletBalance({
      organizationId: expense.organizationId,
      branchId: expense.branchId,
      type: previousWalletType.trim(),
      amount: prevAmt,
      operation: 'add',
      userId: expense.updatedBy || expense.createdBy,
    });
  }
};

/**
 * Create an expense
 * @param {Object} expenseBody
 * @param {Object} [options]
 * @param {boolean} [options.skipCashBookSync=false]
 * @returns {Promise<Expense>}
 */
const createExpense = async (expenseBody, options = {}) => {
  // The category decides Direct vs Indirect — never the client — so a report can trust it.
  if (!options.keepNature) await applyCategoryClassification(expenseBody);
  let expense;
  const maxRetries = 3;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      expense = await Expense.create(expenseBody);
      break;
    } catch (error) {
      if (error.code === 11000 && error.keyPattern && error.keyPattern.expenseNumber && attempt < maxRetries - 1) {
        delete expenseBody.expenseNumber;
        continue;
      }
      throw error;
    }
  }
  if (!expense) {
    throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Failed to create expense after retries');
  }
  // Unpaid expenses (isPaid: false) are visible in the expense list but must
  // not touch the cash book / wallet / accounts ledger until they're paid.
  if (expense.isPaid && !options.skipCashBookSync) {
    await syncExpenseCashAndWalletEntries(expense, null, null, 0);
    postExpenseToAccounts(expense);
  }

  return expense;
};

/**
 * Query for expenses
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @returns {Promise<QueryResult>}
 */
const queryExpenses = async (filter, options) => {
  // Handle search query
  if (options.search) {
    addTokenSearch(filter, options.search, ['expenseNumber', 'voucherNumber', 'description', 'vendor', 'category', 'reference']);
    delete options.search;
  }

  // Handle date range filter
  if (options.startDate || options.endDate) {
    filter.date = {};
    if (options.startDate) {
      filter.date.$gte = new Date(options.startDate);
      delete options.startDate;
    }
    if (options.endDate) {
      filter.date.$lte = new Date(options.endDate);
      delete options.endDate;
    }
  }

  // Handle category filter
  if (options.category) {
    filter.category = options.category;
    delete options.category;
  }

  // Direct / Indirect. Rows saved before the field existed have no value and are indirect.
  if (options.expenseNature) {
    if (options.expenseNature === 'direct') filter.expenseNature = 'direct';
    else if (options.expenseNature === 'indirect') filter.expenseNature = { $ne: 'direct' };
    delete options.expenseNature;
  }

  options.populate = 'createdBy';
  const expenses = await Expense.paginate(filter, options);
  return expenses;
};

/**
 * Get expense by id
 * @param {ObjectId} id
 * @returns {Promise<Expense>}
 */
const getExpenseById = async (id) => {
  return Expense.findById(id).populate('createdBy');
};

/**
 * Update expense by id
 * @param {ObjectId} expenseId
 * @param {Object} updateBody
 * @returns {Promise<Expense>}
 */
const updateExpenseById = async (expenseId, updateBody) => {
  const expense = await getExpenseById(expenseId);
  if (!expense) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Expense not found');
  }
  const originalPaymentMethod = expense.paymentMethod;
  const originalWalletType = expense.walletType || null;
  const originalAmount = expense.amount;

  Object.assign(expense, updateBody);
  if (updateBody.category !== undefined) {
    const { expenseNature } = await expenseCategoryService.getCategoryClassification(
      expense.organizationId,
      expense.branchId,
      expense.category
    );
    expense.expenseNature = expenseNature;
  }
  await expense.save();

  // Editing an unpaid expense (e.g. correcting the amount before confirming
  // payment) shouldn't create cash book / accounts entries — those only get
  // created once markExpenseAsPaid runs.
  if (expense.isPaid) {
    await syncExpenseCashAndWalletEntries(expense, originalPaymentMethod, originalWalletType, originalAmount);
    postExpenseToAccounts(expense);
  }

  return expense;
};

/**
 * Confirm payment of a previously-recorded (unpaid) expense — typically an
 * auto-generated recurring cycle. This is the only place an unpaid expense's
 * cash book / wallet / accounts entries get created, keeping "recorded" and
 * "actually paid out" as distinct steps.
 * @param {ObjectId} expenseId
 * @param {ObjectId} [userId]
 * @returns {Promise<Expense>}
 */
const markExpenseAsPaid = async (expenseId, userId) => {
  const expense = await getExpenseById(expenseId);
  if (!expense) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Expense not found');
  }
  if (expense.isPaid) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Expense is already marked as paid');
  }

  expense.isPaid = true;
  expense.paidAt = new Date();
  expense.paidBy = userId || expense.createdBy;
  await expense.save();

  await syncExpenseCashAndWalletEntries(expense, null, null, 0);
  postExpenseToAccounts(expense);

  return expense;
};

/**
 * Delete expense by id
 * @param {ObjectId} expenseId
 * @returns {Promise<Expense>}
 */
const deleteExpenseById = async (expenseId) => {
  const expense = await getExpenseById(expenseId);
  if (!expense) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Expense not found');
  }
  await cashBookService.deleteEntriesByReference(expense._id, 'Expense');
  await walletEntryService.deleteEntriesByReference(expense._id, 'Expense');
  accountsSystemService
    .removePostingsForReference(
      { organizationId: expense.organizationId, branchId: expense.branchId },
      'Expense',
      expense._id
    )
    .catch(() => {});

  if (expense.paymentMethod === 'Wallet' && expense.walletType && Number(expense.amount || 0) > 0) {
    try {
      await walletService.adjustWalletBalance({
        organizationId: expense.organizationId,
        branchId: expense.branchId,
        type: expense.walletType.trim(),
        amount: Number(expense.amount),
        operation: 'add',
        userId: expense.updatedBy || expense.createdBy,
      });
    } catch (err) {
      console.error('Failed to reverse wallet balance on expense delete:', err);
    }
  }

  await expense.deleteOne();
  return expense;
};

const findExpenseByLedgerReference = async (ledgerId) => {
  return Expense.findOne({ referenceId: ledgerId, referenceModel: 'EmployeeLedger' });
};

const deleteExpenseByLedgerReference = async (ledgerId, entry = null, employeeDoc = null) => {
  let expense = await findExpenseByLedgerReference(ledgerId);
  if (!expense && entry && employeeDoc && entry.reference) {
    const employeeName = `${employeeDoc.firstName} ${employeeDoc.lastName}`.trim();
    expense = await Expense.findOne({
      organizationId: entry.organizationId,
      branchId: entry.branchId,
      category: employeeName,
      reference: entry.reference,
    }).sort({ createdAt: -1 });
  }
  if (!expense) return null;
  // Deliberately NOT deleteExpenseById: this Expense is always created with
  // skipCashBookSync (upsertExpenseFromEmployeeLedger above never posts its own Cash
  // Book/Wallet entries — employeeLedger.service.js's syncCashBookFromEmployeeLedger/
  // syncWalletFromEmployeeLedger already own that movement against the ledger entry
  // itself). deleteExpenseById unconditionally reverses a wallet balance for any
  // paymentMethod:'Wallet' expense regardless of whether it ever actually moved that
  // balance — routing through it here would double-reverse the wallet on top of
  // employeeLedger.service.js's own reversal. Same reasoning as
  // salesmanCommissionPayment.service.js's deleteExpenseForPayment (raw deleteMany).
  await Expense.deleteMany({ _id: expense._id });
  return expense;
};

// Employee Ledger stores paymentMethod as lowercase 'cash'/'wallet' (matching the
// Bank-Accounts-merged picker used app-wide), but Expense.paymentMethod is a strict
// Mongoose enum of capitalized labels — normalize here rather than at every caller.
const EMPLOYEE_LEDGER_EXPENSE_PAYMENT_METHOD = { cash: 'Cash', wallet: 'Wallet' };

const upsertExpenseFromEmployeeLedger = async (entry, employeeDoc) => {
  if (!entry || !employeeDoc) return null;

  const amount = Number(entry.credit || 0);
  if (amount <= 0) {
    await deleteExpenseByLedgerReference(entry._id);
    return null;
  }

  const normalizedMethod = String(entry.paymentMethod || '').trim().toLowerCase();
  const employeeName = `${employeeDoc.firstName} ${employeeDoc.lastName}`.trim();
  const label = entry.transactionType === 'advance_payment' ? 'Advance payment' : 'Salary payment';
  const description = `${label} to ${employeeName}`;
  const payload = {
    organizationId: entry.organizationId,
    branchId: entry.branchId,
    category: employeeName,
    description,
    amount,
    paymentMethod: EMPLOYEE_LEDGER_EXPENSE_PAYMENT_METHOD[normalizedMethod] || entry.paymentMethod || 'Cash',
    walletType: normalizedMethod === 'wallet' ? entry.walletType : undefined,
    date: entry.transactionDate || new Date(),
    reference: entry.reference || undefined,
    notes: entry.notes || '',
    referenceId: entry._id,
    referenceModel: 'EmployeeLedger',
    createdBy: entry.updatedBy || entry.createdBy,
  };

  let expense = await findExpenseByLedgerReference(entry._id);
  if (!expense && entry.reference) {
    expense = await Expense.findOne({
      organizationId: entry.organizationId,
      branchId: entry.branchId,
      category: employeeName,
      reference: entry.reference,
      referenceId: { $exists: false },
    }).sort({ createdAt: -1 });
  }

  if (expense) {
    await cashBookService.deleteEntriesByReference(expense._id, 'Expense');
    Object.assign(expense, payload);
    await expense.save();
    return expense;
  }

  return createExpense(payload, { skipCashBookSync: true });
};

/**
 * Get expense summary by category
 * @param {Object} filter - Date range and organization/branch filter
 * @returns {Promise<Array>}
 */
const getExpenseSummary = async (filter = {}) => {
  const matchStage = {};

  // Add organization and branch filters (cast to ObjectId for aggregate pipeline)
  if (filter.organizationId) {
    matchStage.organizationId = mongoose.Types.ObjectId.isValid(filter.organizationId)
      ? new mongoose.Types.ObjectId(String(filter.organizationId))
      : filter.organizationId;
  }
  if (filter.branchId) {
    matchStage.branchId = mongoose.Types.ObjectId.isValid(filter.branchId)
      ? new mongoose.Types.ObjectId(String(filter.branchId))
      : filter.branchId;
  }
  
  if (filter.startDate || filter.endDate) {
    matchStage.date = {};
    if (filter.startDate) matchStage.date.$gte = new Date(filter.startDate);
    if (filter.endDate) matchStage.date.$lte = new Date(filter.endDate);
  }

  const summary = await Expense.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$category',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        directAmount: {
          $sum: { $cond: [{ $eq: [{ $ifNull: ['$expenseNature', 'indirect'] }, 'direct'] }, '$amount', 0] },
        },
      },
    },
    { $sort: { totalAmount: -1 } },
  ]);

  return summary;
};

/**
 * Get expense trends
 * @param {Object} filter - Date range and organization/branch filter
 * @returns {Promise<Array>}
 */
const getExpenseTrends = async (filter = {}) => {
  const matchStage = {};

  // Add organization and branch filters (cast to ObjectId for aggregate pipeline)
  if (filter.organizationId) {
    matchStage.organizationId = mongoose.Types.ObjectId.isValid(filter.organizationId)
      ? new mongoose.Types.ObjectId(String(filter.organizationId))
      : filter.organizationId;
  }
  if (filter.branchId) {
    matchStage.branchId = mongoose.Types.ObjectId.isValid(filter.branchId)
      ? new mongoose.Types.ObjectId(String(filter.branchId))
      : filter.branchId;
  }
  
  if (filter.startDate || filter.endDate) {
    matchStage.date = {};
    if (filter.startDate) matchStage.date.$gte = new Date(filter.startDate);
    if (filter.endDate) matchStage.date.$lte = new Date(filter.endDate);
  }

  const trends = await Expense.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: {
          year: { $year: '$date' },
          month: { $month: '$date' },
        },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } },
  ]);

  return trends;
};

/**
 * Pay every unpaid expense matching a filter in one shot — backs the
 * "Pay All" / per-rule / per-category bulk-pay actions. Each expense is
 * paid individually through markExpenseAsPaid so cash book / wallet /
 * accounts stay in sync exactly as if paid one at a time; a failure on one
 * expense doesn't stop the rest.
 * @param {Object} filter - must include organizationId/branchId scope
 * @param {ObjectId} [userId]
 */
const payExpensesBulk = async (filter, userId) => {
  const pending = await Expense.find({ ...filter, isPaid: false });

  let paidCount = 0;
  let totalAmount = 0;
  const errors = [];

  for (const expense of pending) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await markExpenseAsPaid(expense._id, userId);
      paidCount += 1;
      totalAmount += Number(expense.amount || 0);
    } catch (err) {
      errors.push({ id: String(expense._id), message: err.message });
    }
  }

  return { matched: pending.length, paidCount, totalAmount, errors };
};

// ─── Excel / CSV import ─────────────────────────────────────────────────────────────

const PAYMENT_METHOD_ALIASES = {
  cash: 'Cash',
  'cash in hand': 'Cash',
  'bank transfer': 'Bank Transfer',
  bank: 'Bank Transfer',
  transfer: 'Bank Transfer',
  card: 'Card',
  'credit card': 'Card',
  'debit card': 'Card',
  cheque: 'Cheque',
  check: 'Cheque',
};

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const dayKey = (d) => toBusinessCalendarDate(new Date(d)) || '';
const textKey = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Duplicate fingerprint for an expense: the bill/receipt reference when there is one
 * (that is how an accountant spots a re-entered bill), otherwise date + category +
 * amount + description. Day-level on the date so a re-imported file matches regardless
 * of the time of day it was saved.
 */
const expenseFingerprint = ({ date, category, amount, description, reference }) => {
  const ref = textKey(reference);
  if (ref) return `ref|${ref}`;
  return ['row', dayKey(date), textKey(category), round2(amount).toFixed(2), textKey(description)].join('|');
};

/**
 * Import expenses from a spreadsheet. Same rules as every other import in this app:
 * a bad row costs that row, never the file; rows that are already saved are `skipped`
 * (or `errors` with duplicateStrategy 'error'); imported rows with a note are `warnings`.
 *
 * Each row goes through createExpense — the same path as the Add Expense form — so
 * paid rows post to the Cash Book / bank account / Chart of Accounts exactly like a
 * manual entry. `paymentStatus: 'unpaid'` records them as pending bills instead (no money
 * moves until each is paid), which is what you want when loading history that is already
 * reflected in your opening cash and bank balances.
 *
 * @param {Array<Object>} rows
 * @param {{organizationId, branchId, createdBy}} context
 * @param {{duplicateStrategy?: 'skip'|'error'|'allow', createMissingCategories?: boolean, paymentStatus?: 'paid'|'unpaid'}} [options]
 */
const bulkImportExpenses = async (rows, context, options = {}) => {
  const { organizationId, branchId, createdBy } = context;
  const duplicateStrategy = ['skip', 'error', 'allow'].includes(options.duplicateStrategy) ? options.duplicateStrategy : 'skip';
  const createMissingCategories = options.createMissingCategories !== false;
  const markUnpaid = options.paymentStatus === 'unpaid';

  const errors = [];
  const skipped = [];
  const warnings = [];
  const valid = [];

  // eslint-disable-next-line global-require
  const Wallet = require('../models/wallet.model');
  const wallets = await Wallet.find({ organizationId, branchId, isActive: { $ne: false } }).select('type').lean();
  const walletByName = new Map(wallets.map((w) => [textKey(w.type), w.type]));

  // ── 1. Validate every row on its own ────────────────────────────────────────────
  (Array.isArray(rows) ? rows : []).forEach((raw, index) => {
    const row = raw || {};
    const category = String(row.category == null ? '' : row.category).trim();
    const description = String(row.description == null ? '' : row.description).trim();
    const amount = Number(typeof row.amount === 'string' ? row.amount.replace(/,/g, '') : row.amount);
    const name = description || category || `Row ${index + 1}`;

    if (!category) {
      errors.push({ index, name, error: 'Category is empty' });
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      errors.push({ index, name, error: `Amount "${row.amount == null ? '' : row.amount}" must be a number above 0` });
      return;
    }
    // 'YYYY-MM-DD' (what the import dialog sends) → that Pakistan business day, at the
    // current time of day, the same way a back-dated manual entry is stamped.
    let date = row.date ? atBusinessTimeOfDay(row.date) : null;
    if (row.date && !date) {
      errors.push({ index, name, error: `Date "${row.date}" is not a valid date` });
      return;
    }
    const notes = [];
    if (!date) {
      date = new Date();
      notes.push('No date — dated today');
    }

    // "Paid From": Cash, a payment method, or one of the shop's bank/wallet accounts by name.
    let paymentMethod = 'Cash';
    let walletType;
    const paidFrom = String(row.paymentMethod == null ? '' : row.paymentMethod).trim();
    const walletHint = String(row.walletType == null ? '' : row.walletType).trim();
    const accountName = walletHint || paidFrom;
    if (accountName && walletByName.has(textKey(accountName))) {
      paymentMethod = 'Wallet';
      walletType = walletByName.get(textKey(accountName));
    } else if (paidFrom && PAYMENT_METHOD_ALIASES[textKey(paidFrom)]) {
      paymentMethod = PAYMENT_METHOD_ALIASES[textKey(paidFrom)];
    } else if (accountName) {
      errors.push({
        index,
        name,
        error: `Paid from "${accountName}" is not Cash or one of your bank/wallet accounts`,
      });
      return;
    }

    const nature = row.expenseNature ? expenseCategoryService.parseExpenseNature(row.expenseNature) : null;
    if (row.expenseNature && !nature) notes.push(`Type "${row.expenseNature}" is not Direct or Indirect — the category's type was used`);

    valid.push({
      index,
      name,
      notes,
      requestedNature: nature,
      body: {
        organizationId,
        branchId,
        createdBy,
        category,
        description: description || category,
        amount: round2(amount),
        paymentMethod,
        walletType,
        date,
        vendor: row.vendor ? String(row.vendor).trim() : undefined,
        reference: row.reference ? String(row.reference).trim() : undefined,
        notes: row.notes ? String(row.notes).trim() : undefined,
        isPaid: !markUnpaid,
      },
    });
  });

  // ── 2. Duplicates: against saved expenses and earlier rows of the same file ──────
  // Decided before any category is created, so a skipped row never leaves a new
  // category behind. Category names compare case-insensitively in the fingerprint.
  const dates = valid.map((v) => v.body.date.getTime());
  const existingKeys = new Set();
  if (valid.length && duplicateStrategy !== 'allow') {
    const minDate = new Date(Math.min(...dates) - 86400000);
    const maxDate = new Date(Math.max(...dates) + 86400000);
    const references = valid.map((v) => v.body.reference).filter(Boolean);
    const saved = await Expense.find({
      organizationId,
      branchId,
      $or: [
        { date: { $gte: minDate, $lte: maxDate } },
        ...(references.length ? [{ reference: { $in: references } }] : []),
      ],
    })
      .select('date category amount description reference')
      .lean();
    saved.forEach((e) => existingKeys.add(expenseFingerprint(e)));
  }
  const fileKeys = new Set();
  const toSave = [];
  valid.forEach((v) => {
    const key = expenseFingerprint(v.body);
    if (duplicateStrategy !== 'allow' && (existingKeys.has(key) || fileKeys.has(key))) {
      const where = existingKeys.has(key) ? 'already saved' : 'repeated earlier in this file';
      const reason = v.body.reference
        ? `Reference "${v.body.reference}" is ${where}`
        : `Same date, category, amount and description is ${where}`;
      if (duplicateStrategy === 'error') errors.push({ index: v.index, name: v.name, error: reason });
      else skipped.push({ index: v.index, name: v.name, reason });
      return;
    }
    fileKeys.add(key);
    toSave.push(v);
  });

  // ── 3. Categories: create the missing ones (with the file's Direct/Indirect) ─────
  const wanted = [];
  const seenWanted = new Set();
  toSave.forEach((v) => {
    const key = textKey(v.body.category);
    if (seenWanted.has(key)) return;
    seenWanted.add(key);
    wanted.push({ name: v.body.category, expenseNature: v.requestedNature });
  });
  const { byName, created: createdCategories } = await expenseCategoryService.ensureCategoriesForImport(
    organizationId,
    branchId,
    createdBy,
    wanted,
    { createMissing: createMissingCategories }
  );

  let insertedCount = 0;
  let totalAmount = 0;
  let directAmount = 0;

  // ── 4. Save, one row at a time through the normal create path ───────────────────
  for (const v of toSave) {
    const category = byName.get(textKey(v.body.category));
    if (!category) {
      errors.push({ index: v.index, name: v.name, error: `Category "${v.body.category}" does not exist` });
      // eslint-disable-next-line no-continue
      continue;
    }
    v.body.category = category.name; // saved spelling, so filters and reports group it

    const categoryNature = category.expenseNature || 'indirect';
    if (v.requestedNature && v.requestedNature !== categoryNature && !createdCategories.includes(category.name)) {
      v.notes.push(
        `"${category.name}" is set up as ${categoryNature === 'direct' ? 'Direct' : 'Indirect'} — saved as that (change the category to re-classify)`
      );
    }

    try {
      // eslint-disable-next-line no-await-in-loop
      const expense = await createExpense({ ...v.body });
      insertedCount += 1;
      totalAmount += expense.amount;
      if (expense.expenseNature === 'direct') directAmount += expense.amount;
      if (v.notes.length) warnings.push({ index: v.index, name: v.name, message: v.notes.join('; ') });
    } catch (err) {
      errors.push({ index: v.index, name: v.name, error: err.message || 'Could not save this expense' });
    }
  }

  errors.sort((a, b) => a.index - b.index);
  skipped.sort((a, b) => a.index - b.index);
  return {
    insertedCount,
    skippedCount: skipped.length,
    totalAmount: round2(totalAmount),
    directAmount: round2(directAmount),
    indirectAmount: round2(totalAmount - directAmount),
    createdCategories,
    errors,
    skipped,
    warnings,
  };
};

// ─── Expense Voucher (several expenses in one entry) ───────────────────────────────

const nextExpenseVoucherNumber = async (organizationId, branchId) => {
  const sequences = mongoose.connection.db.collection('_sequences');
  const result = await sequences.findOneAndUpdate(
    { _id: `expense_voucher_${organizationId}_${branchId}` },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  const seq = Number(result?.seq ?? result?.value?.seq);
  return `EV-${String(Number.isFinite(seq) && seq > 0 ? seq : Date.now() % 1e6).padStart(6, '0')}`;
};

/**
 * Record an Expense Voucher: one date + one "paid from" account, many lines (category,
 * description, vendor, reference, amount). Every line becomes a normal expense through
 * createExpense — its own Cash Book / bank entry and journal entry, Direct/Indirect from
 * its category — all sharing one voucher number.
 *
 * All-or-nothing: every line is checked before anything is written, and if a save still
 * fails part-way the lines already saved are deleted again (reversing their cash/bank and
 * journal entries), so a voucher never lands half-posted.
 *
 * @param {{date?, paymentMethod?, walletType?, reference?, notes?, isPaid?, lines: Array}} voucher
 * @param {{organizationId, branchId, createdBy}} context
 */
const createExpenseVoucher = async (voucher, context) => {
  const { organizationId, branchId, createdBy } = context;
  const rawLines = Array.isArray(voucher?.lines) ? voucher.lines : [];
  // Blank grid rows (no category and no amount) are simply ignored.
  const lines = rawLines
    .map((line, index) => ({ ...line, index }))
    .filter((line) => String(line.category || '').trim() || Number(line.amount) > 0);
  if (lines.length === 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Add at least one expense line');
  if (lines.length > 200) throw new ApiError(httpStatus.BAD_REQUEST, 'A voucher can hold at most 200 lines');

  // Paid from: Cash, or one of the branch's bank / wallet accounts.
  let paymentMethod = 'Cash';
  let walletType;
  if (voucher.paymentMethod === 'Wallet' || voucher.walletType) {
    // eslint-disable-next-line global-require
    const Wallet = require('../models/wallet.model');
    const name = String(voucher.walletType || '').trim();
    const wallet = name
      ? await Wallet.findOne({ organizationId, branchId, type: name, isActive: { $ne: false } }).select('type').lean()
      : null;
    if (!wallet) throw new ApiError(httpStatus.BAD_REQUEST, `Account "${name}" was not found`);
    paymentMethod = 'Wallet';
    walletType = wallet.type;
  } else if (voucher.paymentMethod && voucher.paymentMethod !== 'Cash') {
    paymentMethod = voucher.paymentMethod;
  }

  const date = voucher.date ? atBusinessTimeOfDay(voucher.date) : new Date();
  if (!date) throw new ApiError(httpStatus.BAD_REQUEST, 'Voucher date is not valid');

  // Every line is checked first — nothing is written while any line has a problem.
  // eslint-disable-next-line global-require
  const ExpenseCategory = require('../models/expenseCategory.model');
  const categories = await ExpenseCategory.find({ organizationId, branchId, transactionType: 'business_expense' })
    .select('name isActive')
    .lean();
  const byName = new Map(categories.map((c) => [textKey(c.name), c]));
  const problems = [];
  const prepared = lines.map((line) => {
    const rowNo = line.index + 1;
    const category = byName.get(textKey(line.category));
    const amount = round2(Number(line.amount));
    if (!String(line.category || '').trim()) problems.push(`Line ${rowNo}: choose a category`);
    else if (!category) problems.push(`Line ${rowNo}: category "${line.category}" does not exist`);
    else if (category.isActive === false) problems.push(`Line ${rowNo}: category "${category.name}" is inactive`);
    if (!Number.isFinite(amount) || amount <= 0) problems.push(`Line ${rowNo}: amount must be more than 0`);
    const description = String(line.description || '').trim();
    return {
      organizationId,
      branchId,
      createdBy,
      category: category ? category.name : line.category,
      description: description || (category ? category.name : 'Expense'),
      amount,
      paymentMethod,
      walletType,
      date,
      vendor: String(line.vendor || '').trim() || undefined,
      reference: String(line.reference || voucher.reference || '').trim() || undefined,
      notes: String(line.notes || voucher.notes || '').trim() || undefined,
      isPaid: voucher.isPaid !== false,
    };
  });
  if (problems.length) {
    throw new ApiError(httpStatus.BAD_REQUEST, problems.slice(0, 10).join('; '));
  }

  const voucherNumber = await nextExpenseVoucherNumber(organizationId, branchId);
  const created = [];
  try {
    for (const body of prepared) {
      // eslint-disable-next-line no-await-in-loop
      created.push(await createExpense({ ...body, voucherNumber }));
    }
  } catch (err) {
    for (const expense of created) {
      // eslint-disable-next-line no-await-in-loop
      await deleteExpenseById(expense._id).catch(() => {});
    }
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      `The voucher was not saved — ${err.message || 'a line could not be recorded'}. Nothing was posted.`
    );
  }

  const total = round2(created.reduce((sum, e) => sum + e.amount, 0));
  const directAmount = round2(created.filter((e) => e.expenseNature === 'direct').reduce((sum, e) => sum + e.amount, 0));
  return { voucherNumber, date, paymentMethod, walletType, total, directAmount, indirectAmount: round2(total - directAmount), expenses: created };
};

module.exports = {
  createExpense,
  createExpenseVoucher,
  bulkImportExpenses,
  expenseFingerprint,
  queryExpenses,
  getExpenseById,
  updateExpenseById,
  deleteExpenseById,
  markExpenseAsPaid,
  payExpensesBulk,
  findExpenseByLedgerReference,
  deleteExpenseByLedgerReference,
  upsertExpenseFromEmployeeLedger,
  getExpenseSummary,
  getExpenseTrends,
};
