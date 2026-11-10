const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const ExpenseCategory = require('../models/expenseCategory.model');

const BUSINESS_EXPENSE_DEFAULTS = [
  { name: 'Rent', color: '#3b82f6' },
  { name: 'Utilities', color: '#f59e0b' },
  { name: 'Salaries', color: '#10b981' },
  { name: 'Transportation', color: '#6366f1' },
  { name: 'Marketing', color: '#ec4899' },
  { name: 'Supplies', color: '#14b8a6' },
  { name: 'Maintenance', color: '#f97316' },
  { name: 'Insurance', color: '#8b5cf6' },
  { name: 'Tax', color: '#ef4444' },
  { name: 'Other', color: '#94a3b8' },
];

const LEDGER_DEFAULTS = {
  income: [
    { name: 'Salary', color: '#10b981' },
    { name: 'Business Income', color: '#22c55e' },
    { name: 'Freelance', color: '#14b8a6' },
    { name: 'Rent Income', color: '#059669' },
    { name: 'Investment Return', color: '#16a34a' },
    { name: 'Gift', color: '#84cc16' },
    { name: 'Other', color: '#94a3b8' },
  ],
  expense: [
    { name: 'Rent', color: '#ef4444' },
    { name: 'Utilities', color: '#f97316' },
    { name: 'Food', color: '#eab308' },
    { name: 'Transport', color: '#6366f1' },
    { name: 'Shopping', color: '#ec4899' },
    { name: 'Medical', color: '#f43f5e' },
    { name: 'Education', color: '#8b5cf6' },
    { name: 'Entertainment', color: '#06b6d4' },
    { name: 'Other', color: '#94a3b8' },
  ],
  transfer: [
    { name: 'Bank to Cash', color: '#3b82f6' },
    { name: 'Cash to Bank', color: '#2563eb' },
    { name: 'Account to Account', color: '#1d4ed8' },
    { name: 'Other', color: '#94a3b8' },
  ],
  opening_balance: [{ name: 'Opening Balance', color: '#8b5cf6' }],
  adjustment: [
    { name: 'Correction', color: '#f97316' },
    { name: 'Other', color: '#94a3b8' },
  ],
};

const VALID_TRANSACTION_TYPES = [
  'business_expense',
  'income',
  'expense',
  'transfer',
  'opening_balance',
  'adjustment',
];

const normalizeTransactionType = (value) => {
  const type = String(value || 'business_expense').trim();
  if (!VALID_TRANSACTION_TYPES.includes(type)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid transaction type for category');
  }
  return type;
};

const EXPENSE_NATURES = ['direct', 'indirect'];

/** "Direct", "DIRECT EXPENSE", "trading" → 'direct'; anything indirect-ish → 'indirect'; else null. */
const parseExpenseNature = (value) => {
  const text = String(value == null ? '' : value).trim().toLowerCase();
  if (!text) return null;
  if (EXPENSE_NATURES.includes(text)) return text;
  if (/^(in-?direct|operating|admin|administrative|overhead|office|selling|general)/.test(text)) return 'indirect';
  if (/^(direct|trading|manufacturing|production|factory|cost of sales|cogs)/.test(text)) return 'direct';
  return null;
};

const normalizeExpenseNature = (value) => {
  const nature = parseExpenseNature(value);
  if (!nature) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Expense type must be Direct or Indirect');
  }
  return nature;
};

/**
 * A category may post to one specific chart-of-accounts head. Only a posting (non-group)
 * EXPENSE account of this org/branch is accepted; '' / null clears the mapping.
 */
const normalizeAccountCode = async (value, organizationId, branchId) => {
  const code = String(value == null ? '' : value).trim();
  if (!code) return null;
  // eslint-disable-next-line global-require
  const AccountHead = require('../models/accountHead.model');
  const account = await AccountHead.findOne({
    organizationId,
    ...(branchId ? { branchId } : {}),
    code,
  }).lean();
  if (!account) throw new ApiError(httpStatus.BAD_REQUEST, `Account ${code} was not found in your chart of accounts`);
  if (account.rootType !== 'EXPENSE') throw new ApiError(httpStatus.BAD_REQUEST, `Account ${code} is not an expense account`);
  if (account.isGroup) throw new ApiError(httpStatus.BAD_REQUEST, `Account ${code} is a group — pick an account under it`);
  return code;
};

const seedDefaultsForType = async (organizationId, branchId, userId, transactionType) => {
  const defaults =
    transactionType === 'business_expense'
      ? BUSINESS_EXPENSE_DEFAULTS
      : LEDGER_DEFAULTS[transactionType] || [];

  if (defaults.length === 0) return;

  const ops = defaults.map((c) => ({
    updateOne: {
      filter: { organizationId, branchId, name: c.name, transactionType },
      update: {
        $setOnInsert: {
          organizationId,
          branchId,
          name: c.name,
          color: c.color,
          transactionType,
          isDefault: true,
          createdBy: userId,
        },
      },
      upsert: true,
    },
  }));

  await ExpenseCategory.bulkWrite(ops, { ordered: false });
};

const getCategories = async (organizationId, branchId, userId, transactionType = 'business_expense') => {
  const type = normalizeTransactionType(transactionType);
  // Business-expense categories are no longer created automatically — every business
  // sets up its own (the Categories manager offers common ones in one click). Seeding on
  // read would also bring back any default a user deleted. Personal-ledger types keep
  // their starter lists.
  if (type !== 'business_expense') {
    await seedDefaultsForType(organizationId, branchId, userId, type);
  }
  return ExpenseCategory.find({ organizationId, branchId, transactionType: type }).sort({
    isDefault: -1,
    name: 1,
  });
};

const createCategory = async (data, organizationId, branchId, userId) => {
  const transactionType = normalizeTransactionType(data.transactionType);
  const name = String(data.name || '').trim();
  if (!name) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Category name is required');
  }

  const exists = await ExpenseCategory.findOne({
    organizationId,
    branchId,
    transactionType,
    name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
  });
  if (exists) {
    throw new ApiError(httpStatus.CONFLICT, `Category "${name}" already exists`);
  }

  const extra = {};
  if (transactionType === 'business_expense') {
    if (data.expenseNature !== undefined && data.expenseNature !== null && data.expenseNature !== '') {
      extra.expenseNature = normalizeExpenseNature(data.expenseNature);
    }
    if (data.accountCode) extra.accountCode = await normalizeAccountCode(data.accountCode, organizationId, branchId);
  }
  if (data.description) extra.description = String(data.description).trim();

  try {
    return await ExpenseCategory.create({
      name,
      color: data.color || '#6366f1',
      transactionType,
      organizationId,
      branchId,
      createdBy: userId,
      ...extra,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(httpStatus.CONFLICT, `Category "${name}" already exists`);
    }
    throw err;
  }
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const propagateCategoryNameChange = async ({
  organizationId,
  branchId,
  oldName,
  newName,
  transactionType = 'business_expense',
}) => {
  const oldLabel = String(oldName || '').trim();
  const newLabel = String(newName || '').trim();
  if (!oldLabel || !newLabel || oldLabel.toLowerCase() === newLabel.toLowerCase()) {
    return;
  }

  const Expense = require('../models/expense.model');
  const PersonalLedger = require('../models/personalLedger.model');
  const oldCategoryRegex = { $regex: `^${escapeRegex(oldLabel)}$`, $options: 'i' };

  if (transactionType === 'business_expense') {
    await Expense.updateMany(
      { organizationId, branchId, category: oldCategoryRegex },
      { $set: { category: newLabel } },
    );

    const expenses = await Expense.find({
      organizationId,
      branchId,
      description: { $regex: escapeRegex(oldLabel), $options: 'i' },
    });

    await Promise.all(
      expenses.map(async (expense) => {
        expense.description = expense.description.replace(
          new RegExp(escapeRegex(oldLabel), 'gi'),
          newLabel,
        );
        await expense.save();
      }),
    );
    return;
  }

  await PersonalLedger.updateMany(
    {
      organizationId,
      branchId,
      transactionType,
      category: oldCategoryRegex,
    },
    { $set: { category: newLabel } },
  );

  const ledgerEntries = await PersonalLedger.find({
    organizationId,
    branchId,
    transactionType,
    description: { $regex: escapeRegex(oldLabel), $options: 'i' },
  });

  await Promise.all(
    ledgerEntries.map(async (entry) => {
      entry.description = entry.description.replace(
        new RegExp(escapeRegex(oldLabel), 'gi'),
        newLabel,
      );
      await entry.save();
    }),
  );
};

const UPDATABLE_CATEGORY_FIELDS = ['name', 'color', 'transactionType', 'expenseNature', 'accountCode', 'description', 'isActive'];

/**
 * Re-classify a category's existing expenses after its type or posting account changed:
 * the stored snapshot is updated in one write, then every PAID expense's journal entry is
 * re-posted so the Chart of Accounts moves the amounts between Direct Expenses and the
 * general expense ledger. Unpaid expenses have no journal entry yet — they pick the new
 * account up when they are paid.
 */
const reclassifyCategoryExpenses = async (category) => {
  const Expense = require('../models/expense.model');
  const filter = {
    organizationId: category.organizationId,
    branchId: category.branchId,
    category: { $regex: `^${escapeRegex(category.name)}$`, $options: 'i' },
  };
  const result = await Expense.updateMany(filter, { $set: { expenseNature: category.expenseNature } });
  // eslint-disable-next-line global-require
  const accountsSystemService = require('./accountsSystem.service');
  const candidates = await Expense.find({ ...filter, isPaid: { $ne: false } })
    .select('_id organizationId branchId createdBy amount paymentMethod walletType description category date expenseNature')
    .lean();
  // Only expenses that already carry their own journal entry are re-posted. Expenses
  // mirrored from another module (salary, commission, agent bills…) are saved with
  // skipCashBookSync and their source posts the books — giving them an entry here would
  // count the cost twice.
  // eslint-disable-next-line global-require
  const JournalEntry = require('../models/journalEntry.model');
  const posted = candidates.length
    ? await JournalEntry.find({
      organizationId: category.organizationId,
      referenceModel: 'Expense',
      referenceId: { $in: candidates.map((e) => e._id) },
      entryType: 'EXPENSE',
      status: 'posted',
      reversalOf: null,
    }).distinct('referenceId')
    : [];
  const postedIds = new Set(posted.map(String));
  const paid = candidates.filter((e) => postedIds.has(String(e._id)));
  for (const expense of paid) {
    // Bad wallet names etc. on one old row must not stop the rest from moving.
    // eslint-disable-next-line no-await-in-loop
    await accountsSystemService
      .postGeneralExpense(
        { organizationId: expense.organizationId, branchId: expense.branchId, createdBy: expense.createdBy },
        {
          amount: expense.amount,
          paymentMethod: expense.paymentMethod,
          walletType: expense.walletType,
          expenseAccountCode: category.accountCode || undefined,
          expenseNature: category.expenseNature,
          expenseId: expense._id,
          description: expense.description || expense.category || 'Expense',
          date: expense.date,
        }
      )
      .catch(() => {});
  }
  return { updated: result.modifiedCount || 0, reposted: paid.length };
};

const updateCategory = async (id, data, organizationId) => {
  const cat = await ExpenseCategory.findOne({ _id: id, organizationId });
  if (!cat) throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');

  const oldName = cat.name;
  const oldNature = cat.expenseNature || 'indirect';
  const oldAccountCode = cat.accountCode || null;
  // Re-classifying old expenses is the default: a ledger moved from Indirect to Direct
  // is moved for the whole history in every accounting package. The UI can opt out
  // ("only new expenses") for a change of policy from a given date.
  const applyToExisting = data.applyToExisting !== false;

  const patch = {};
  UPDATABLE_CATEGORY_FIELDS.forEach((key) => {
    if (data[key] !== undefined) patch[key] = data[key];
  });
  if (patch.transactionType !== undefined) {
    patch.transactionType = normalizeTransactionType(patch.transactionType);
  }
  if (patch.expenseNature !== undefined) patch.expenseNature = normalizeExpenseNature(patch.expenseNature);
  if (patch.accountCode !== undefined) {
    patch.accountCode = await normalizeAccountCode(patch.accountCode, organizationId, cat.branchId);
  }
  if (patch.description !== undefined) patch.description = String(patch.description || '').trim();
  if (patch.isActive !== undefined) patch.isActive = patch.isActive !== false && patch.isActive !== 'false';
  if (patch.name !== undefined) {
    patch.name = String(patch.name).trim();
    if (!patch.name) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Category name is required');
    }
    if (patch.name !== cat.name) {
      const exists = await ExpenseCategory.findOne({
        organizationId,
        branchId: cat.branchId,
        transactionType: patch.transactionType || cat.transactionType,
        name: { $regex: `^${escapeRegex(patch.name)}$`, $options: 'i' },
        _id: { $ne: cat._id },
      });
      if (exists) {
        throw new ApiError(httpStatus.CONFLICT, `Category "${patch.name}" already exists`);
      }
    }
  }

  Object.assign(cat, patch);
  await cat.save();

  if (patch.name && patch.name !== oldName) {
    await propagateCategoryNameChange({
      organizationId: cat.organizationId,
      branchId: cat.branchId,
      oldName,
      newName: cat.name,
      transactionType: cat.transactionType,
    });
  }

  const classificationChanged =
    cat.transactionType === 'business_expense' &&
    ((cat.expenseNature || 'indirect') !== oldNature || (cat.accountCode || null) !== oldAccountCode);
  let reclassified = null;
  if (classificationChanged && applyToExisting) {
    reclassified = await reclassifyCategoryExpenses(cat);
  }

  const json = cat.toJSON();
  if (reclassified) json.reclassified = reclassified;
  return json;
};

/**
 * How an expense in `categoryName` is classified and where it posts. Unknown categories
 * (e.g. employee-name categories made on the fly) are indirect with no mapped account.
 */
const getCategoryClassification = async (organizationId, branchId, categoryName) => {
  const name = String(categoryName || '').trim();
  if (!name || !organizationId || !branchId) return { expenseNature: 'indirect', accountCode: null };
  const cat = await ExpenseCategory.findOne({
    organizationId,
    branchId,
    transactionType: 'business_expense',
    name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
  })
    .select('expenseNature accountCode')
    .lean();
  return { expenseNature: cat?.expenseNature || 'indirect', accountCode: cat?.accountCode || null };
};

/**
 * Categories named in an import that don't exist yet are created (with the file's
 * Direct/Indirect column) when `createMissing` is on. Returns name(lowercase) → category,
 * plus the names that were created and the ones that were missing but not created.
 */
const ensureCategoriesForImport = async (organizationId, branchId, userId, wanted, { createMissing = true } = {}) => {
  const existing = await ExpenseCategory.find({ organizationId, branchId, transactionType: 'business_expense' }).lean();
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));
  const created = [];
  const missing = [];
  const palette = ['#3b82f6', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#ef4444'];

  for (const { name, expenseNature } of wanted) {
    const key = String(name || '').trim().toLowerCase();
    if (!key || byName.has(key)) continue;
    if (!createMissing) {
      missing.push(name.trim());
      byName.set(key, null);
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const cat = await ExpenseCategory.create({
        organizationId,
        branchId,
        name: name.trim(),
        transactionType: 'business_expense',
        expenseNature: expenseNature || 'indirect',
        color: palette[(existing.length + created.length) % palette.length],
        createdBy: userId,
      });
      byName.set(key, cat.toObject());
      created.push(cat.name);
    } catch (err) {
      if (err.code !== 11000) throw err;
      // eslint-disable-next-line no-await-in-loop
      const cat = await ExpenseCategory.findOne({
        organizationId,
        branchId,
        transactionType: 'business_expense',
        name: { $regex: `^${escapeRegex(name.trim())}$`, $options: 'i' },
      }).lean();
      byName.set(key, cat);
    }
  }
  return { byName, created, missing };
};

const nameMatch = (name) => ({ $regex: `^${escapeRegex(String(name || '').trim())}$`, $options: 'i' });

/**
 * How many expenses / recurring rules use each business-expense category of a branch,
 * keyed by lower-cased name. Drives "used by N expenses" and safe deletes.
 */
const getCategoryUsage = async (organizationId, branchId) => {
  const Expense = require('../models/expense.model');
  // eslint-disable-next-line global-require
  const RecurringExpense = require('../models/recurringExpense.model');
  const mongooseLib = require('mongoose');
  const cast = (v) => (mongooseLib.Types.ObjectId.isValid(String(v)) ? new mongooseLib.Types.ObjectId(String(v)) : v);
  const match = { organizationId: cast(organizationId), ...(branchId ? { branchId: cast(branchId) } : {}) };
  const [expenses, rules] = await Promise.all([
    Expense.aggregate([
      { $match: match },
      { $group: { _id: { $toLower: { $trim: { input: '$category' } } }, count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]),
    RecurringExpense.aggregate([
      { $match: match },
      { $group: { _id: { $toLower: { $trim: { input: '$category' } } }, count: { $sum: 1 } } },
    ]),
  ]);
  const usage = {};
  expenses.forEach((r) => {
    usage[r._id] = { expenses: r.count, total: r.total, recurringRules: 0 };
  });
  rules.forEach((r) => {
    usage[r._id] = { ...(usage[r._id] || { expenses: 0, total: 0 }), recurringRules: r.count };
  });
  return usage;
};

/**
 * Delete a category — default ones included. Expenses already saved under it are either
 * moved to another category (`moveToId`: their category, type and books follow the new
 * one, and recurring rules are re-pointed too), or keep the old name as plain text — what
 * deleting always did, so an older screen calling DELETE without options behaves as before.
 */
const deleteCategory = async (id, organizationId, options = {}) => {
  const cat = await ExpenseCategory.findOne({ _id: id, organizationId });
  if (!cat) throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');

  let moved = null;
  if (options.moveToId && cat.transactionType === 'business_expense') {
    if (String(options.moveToId) === String(cat._id)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Pick a different category to move the expenses to');
    }
    const target = await ExpenseCategory.findOne({
      _id: options.moveToId,
      organizationId,
      branchId: cat.branchId,
      transactionType: 'business_expense',
    });
    if (!target) throw new ApiError(httpStatus.BAD_REQUEST, 'The category to move the expenses to was not found');

    const Expense = require('../models/expense.model');
    // eslint-disable-next-line global-require
    const RecurringExpense = require('../models/recurringExpense.model');
    const scope = { organizationId, branchId: cat.branchId, category: nameMatch(cat.name) };
    const [expenseResult, ruleResult] = await Promise.all([
      Expense.updateMany(scope, { $set: { category: target.name } }),
      RecurringExpense.updateMany(scope, { $set: { category: target.name } }),
    ]);
    // Moved expenses take the target's type and ledger, in reports and in the books.
    await reclassifyCategoryExpenses(target);
    moved = {
      to: target.name,
      expenses: expenseResult.modifiedCount || 0,
      recurringRules: ruleResult.modifiedCount || 0,
    };
  }

  await cat.deleteOne();
  return { deleted: cat.name, moved };
};

/**
 * Remove every business-expense category of the branch that nothing uses (no expense,
 * no recurring rule). `onlyDefaults` limits it to the starter list the app used to create
 * on its own — the one-click clean-up for existing businesses.
 */
const removeUnusedCategories = async (organizationId, branchId, { onlyDefaults = true, ids } = {}) => {
  if (!branchId) throw new ApiError(httpStatus.BAD_REQUEST, 'Select a branch first');
  const filter = { organizationId, branchId, transactionType: 'business_expense' };
  if (onlyDefaults) filter.isDefault = true;
  if (Array.isArray(ids) && ids.length) filter._id = { $in: ids };
  const [candidates, usage] = await Promise.all([ExpenseCategory.find(filter).lean(), getCategoryUsage(organizationId, branchId)]);
  const unused = candidates.filter((c) => {
    const u = usage[c.name.trim().toLowerCase()];
    return !u || (u.expenses === 0 && u.recurringRules === 0);
  });
  if (unused.length) await ExpenseCategory.deleteMany({ _id: { $in: unused.map((c) => c._id) } });
  return { removed: unused.map((c) => c.name), kept: candidates.length - unused.length };
};


const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const IMPORT_PALETTE = ['#3b82f6', '#f59e0b', '#10b981', '#6366f1', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#ef4444', '#0891b2'];

/** "Active", "yes", "1" → true; "Inactive", "no", "0", "disabled" → false; else undefined. */
const parseActive = (value) => {
  const text = String(value == null ? '' : value).trim().toLowerCase();
  if (!text) return undefined;
  if (/^(active|yes|y|true|1|on|enabled?)$/.test(text)) return true;
  if (/^(inactive|no|n|false|0|off|disabled?|retired)$/.test(text)) return false;
  return null;
};

/**
 * Import a list of business-expense categories (names only, or with type / account /
 * colour / note / status). Same rules as every other import: a bad row costs that row;
 * rows already saved are `skipped` ('skip') or have their details updated ('update' —
 * through updateCategory, so a type or ledger change re-classifies that category's saved
 * expenses exactly like editing it by hand); notes on imported rows are `warnings`.
 */
const bulkImportCategories = async (rows, { organizationId, branchId, createdBy }, { duplicateStrategy = 'skip' } = {}) => {
  if (!branchId) throw new ApiError(httpStatus.BAD_REQUEST, 'Select a branch first');
  const strategy = ['skip', 'update', 'error'].includes(duplicateStrategy) ? duplicateStrategy : 'skip';
  const errors = [];
  const skipped = [];
  const warnings = [];
  let insertedCount = 0;
  let updatedCount = 0;
  let reclassifiedExpenses = 0;

  const existing = await ExpenseCategory.find({ organizationId, branchId, transactionType: 'business_expense' }).lean();
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c]));
  const seenInFile = new Map();

  // eslint-disable-next-line global-require
  const AccountHead = require('../models/accountHead.model');
  const expenseAccounts = await AccountHead.find({ organizationId, branchId, rootType: 'EXPENSE', isGroup: false })
    .select('code')
    .lean();
  const validCodes = new Set(expenseAccounts.map((a) => String(a.code)));

  for (const [index, raw] of (Array.isArray(rows) ? rows : []).entries()) {
    const row = raw || {};
    const name = String(row.name == null ? '' : row.name).trim().replace(/\s+/g, ' ');
    if (!name) {
      errors.push({ index, name: `Row ${index + 1}`, error: 'Category name is empty' });
      // eslint-disable-next-line no-continue
      continue;
    }
    if (name.length > 80) {
      errors.push({ index, name, error: 'Category name is longer than 80 characters' });
      // eslint-disable-next-line no-continue
      continue;
    }
    const key = name.toLowerCase();
    if (seenInFile.has(key)) {
      skipped.push({ index, name, reason: `Repeated — same name as row ${seenInFile.get(key) + 1} in this file` });
      // eslint-disable-next-line no-continue
      continue;
    }
    seenInFile.set(key, index);

    const notes = [];
    const patch = {};
    if (row.expenseNature != null && String(row.expenseNature).trim() !== '') {
      const nature = parseExpenseNature(row.expenseNature);
      if (nature) patch.expenseNature = nature;
      else notes.push(`Type "${row.expenseNature}" should be Direct or Indirect — left as ${byName.get(key)?.expenseNature === 'direct' ? 'Direct' : 'Indirect'}`);
    }
    const code = String(row.accountCode == null ? '' : row.accountCode).trim();
    if (code) {
      if (validCodes.has(code)) patch.accountCode = code;
      else notes.push(`Account ${code} is not an expense account in your Chart of Accounts — left out`);
    }
    const color = String(row.color == null ? '' : row.color).trim();
    if (color) {
      if (HEX_COLOR.test(color)) patch.color = color;
      else notes.push(`Colour "${color}" is not a #RRGGBB colour — a colour was picked for you`);
    }
    const description = String(row.description == null ? '' : row.description).trim();
    if (description) patch.description = description;
    const active = parseActive(row.isActive);
    if (active === null) notes.push(`Status "${row.isActive}" should be Active or Inactive — left as is`);
    else if (active !== undefined) patch.isActive = active;

    const current = byName.get(key);
    try {
      if (current) {
        if (strategy === 'error') {
          errors.push({ index, name, error: `"${current.name}" already exists` });
          // eslint-disable-next-line no-continue
          continue;
        }
        if (strategy === 'skip' || Object.keys(patch).length === 0) {
          skipped.push({ index, name, reason: strategy === 'skip' ? 'Already saved — left unchanged' : 'Already saved — nothing to change' });
          // eslint-disable-next-line no-continue
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        const updated = await updateCategory(current._id, { ...patch, transactionType: 'business_expense' }, organizationId);
        updatedCount += 1;
        if (updated.reclassified) {
          reclassifiedExpenses += updated.reclassified.updated;
          notes.push(`${updated.reclassified.updated} saved expenses moved to ${updated.expenseNature === 'direct' ? 'Direct' : 'Indirect'}`);
        }
      } else {
        // eslint-disable-next-line no-await-in-loop
        const created = await ExpenseCategory.create({
          organizationId,
          branchId,
          name,
          transactionType: 'business_expense',
          expenseNature: patch.expenseNature || 'indirect',
          accountCode: patch.accountCode || null,
          color: patch.color || IMPORT_PALETTE[(existing.length + insertedCount) % IMPORT_PALETTE.length],
          description: patch.description || '',
          isActive: patch.isActive !== false,
          createdBy,
        });
        byName.set(key, created.toObject());
        insertedCount += 1;
      }
      if (notes.length) warnings.push({ index, name, message: notes.join('; ') });
    } catch (err) {
      errors.push({ index, name, error: err.code === 11000 ? `"${name}" already exists` : err.message || 'Could not save this category' });
    }
  }

  return { insertedCount, updatedCount, reclassifiedExpenses, skippedCount: skipped.length, errors, skipped, warnings };
};

const EMPLOYEE_CATEGORY_COLORS = ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#14b8a6'];

const renameEmployeeCategory = async (organizationId, branchId, oldName, newName) => {
  const oldLabel = String(oldName || '').trim();
  const newLabel = String(newName || '').trim();
  if (!oldLabel || !newLabel || oldLabel.toLowerCase() === newLabel.toLowerCase()) {
    return null;
  }

  const category = await ExpenseCategory.findOne({
    organizationId,
    branchId,
    transactionType: 'business_expense',
    name: { $regex: `^${escapeRegex(oldLabel)}$`, $options: 'i' },
  });

  const existingTarget = await ExpenseCategory.findOne({
    organizationId,
    branchId,
    transactionType: 'business_expense',
    name: { $regex: `^${escapeRegex(newLabel)}$`, $options: 'i' },
  });

  if (category && existingTarget && String(category._id) !== String(existingTarget._id)) {
    await propagateCategoryNameChange({
      organizationId,
      branchId,
      oldName: oldLabel,
      newName: newLabel,
      transactionType: 'business_expense',
    });
    await category.deleteOne();
    return existingTarget;
  }

  if (category) {
    category.name = newLabel;
    await category.save();
  }

  await propagateCategoryNameChange({
    organizationId,
    branchId,
    oldName: oldLabel,
    newName: newLabel,
    transactionType: 'business_expense',
  });

  return category || existingTarget || null;
};

const findOrCreateEmployeeCategory = async (organizationId, branchId, userId, categoryName) => {
  const name = String(categoryName || '').trim();
  if (!name) return null;

  const existing = await ExpenseCategory.findOne({
    organizationId,
    branchId,
    transactionType: 'business_expense',
    name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
  });
  if (existing) return existing;

  try {
    return await ExpenseCategory.create({
      name,
      color: EMPLOYEE_CATEGORY_COLORS[Math.floor(Math.random() * EMPLOYEE_CATEGORY_COLORS.length)],
      transactionType: 'business_expense',
      organizationId,
      branchId,
      createdBy: userId,
      isDefault: false,
    });
  } catch (err) {
    if (err.code === 11000) {
      return ExpenseCategory.findOne({
        organizationId,
        branchId,
        transactionType: 'business_expense',
        name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
      });
    }
    throw err;
  }
};

module.exports = {
  EXPENSE_NATURES,
  parseExpenseNature,
  getCategoryClassification,
  ensureCategoriesForImport,
  reclassifyCategoryExpenses,
  getCategoryUsage,
  removeUnusedCategories,
  bulkImportCategories,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  seedDefaultsForType,
  findOrCreateEmployeeCategory,
  renameEmployeeCategory,
};
