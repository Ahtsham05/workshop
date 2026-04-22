const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const {
  AccountHead,
  JournalEntry,
  BankAccount,
  Budget,
  FeeCategory,
} = require('../models');

// ═══════════════════════════════════════════════════════════════════════════
// ─── Helpers ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const getTenantFilter = (scope) => ({
  organizationId: scope.organizationId,
  ...(scope.branchId ? { branchId: scope.branchId } : {}),
});

const aggFilter = (scope) => ({
  organizationId: new mongoose.Types.ObjectId(scope.organizationId),
  ...(scope.branchId ? { branchId: new mongoose.Types.ObjectId(scope.branchId) } : {}),
});

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ═══════════════════════════════════════════════════════════════════════════
// ─── Chart of Accounts — Seed Defaults ────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Seed a complete school Chart of Accounts for a new org/branch.
 * Idempotent — skips if accounts already exist.
 */
const seedChartOfAccounts = async (scope) => {
  const filter = getTenantFilter(scope);
  const existing = await AccountHead.countDocuments(filter);
  if (existing > 0) return { message: 'Chart of Accounts already seeded', count: existing };

  const base = { ...filter, isSystem: true, isGroup: true, createdBy: scope.createdBy };

  const tree = [
    // ── ASSETS ──
    { code: '1000', name: 'Assets', rootType: 'ASSET', balanceType: 'DEBIT', level: 0, ...base, children: [
      { code: '1100', name: 'Current Assets', level: 1, children: [
        { code: '1101', name: 'Cash in Hand', isGroup: false, level: 2 },
        { code: '1102', name: 'Bank Accounts', isGroup: false, level: 2 },
        { code: '1103', name: 'Fee Receivable', isGroup: false, level: 2 },
        { code: '1104', name: 'Advance to Staff', isGroup: false, level: 2 },
        { code: '1105', name: 'Other Receivables', isGroup: false, level: 2 },
      ]},
      { code: '1200', name: 'Fixed Assets', level: 1, children: [
        { code: '1201', name: 'Furniture & Fixtures', isGroup: false, level: 2 },
        { code: '1202', name: 'Equipment', isGroup: false, level: 2 },
        { code: '1203', name: 'Building', isGroup: false, level: 2 },
        { code: '1204', name: 'Vehicles', isGroup: false, level: 2 },
      ]},
    ]},
    // ── LIABILITIES ──
    { code: '2000', name: 'Liabilities', rootType: 'LIABILITY', balanceType: 'CREDIT', level: 0, ...base, children: [
      { code: '2100', name: 'Current Liabilities', level: 1, children: [
        { code: '2101', name: 'Accounts Payable', isGroup: false, level: 2 },
        { code: '2102', name: 'Student Advance (Credit Wallet)', isGroup: false, level: 2 },
        { code: '2103', name: 'Salary Payable', isGroup: false, level: 2 },
        { code: '2104', name: 'Security Deposits', isGroup: false, level: 2 },
        { code: '2105', name: 'Tax Payable', isGroup: false, level: 2 },
      ]},
      { code: '2200', name: 'Long Term Liabilities', level: 1, children: [
        { code: '2201', name: 'Loans', isGroup: false, level: 2 },
      ]},
    ]},
    // ── EQUITY ──
    { code: '3000', name: 'Equity', rootType: 'EQUITY', balanceType: 'CREDIT', level: 0, ...base, children: [
      { code: '3001', name: "Owner's Capital", isGroup: false, level: 1 },
      { code: '3002', name: 'Retained Earnings', isGroup: false, level: 1 },
    ]},
    // ── REVENUE ──
    { code: '4000', name: 'Revenue', rootType: 'REVENUE', balanceType: 'CREDIT', level: 0, ...base, children: [
      { code: '4100', name: 'Fee Income', level: 1, children: [
        { code: '4101', name: 'Tuition Fee', isGroup: false, level: 2 },
        { code: '4102', name: 'Admission Fee', isGroup: false, level: 2 },
        { code: '4103', name: 'Exam Fee', isGroup: false, level: 2 },
        { code: '4104', name: 'Transport Fee', isGroup: false, level: 2 },
        { code: '4105', name: 'Lab Fee', isGroup: false, level: 2 },
        { code: '4106', name: 'Other Fee Income', isGroup: false, level: 2 },
      ]},
      { code: '4200', name: 'Other Income', level: 1, children: [
        { code: '4201', name: 'Donation', isGroup: false, level: 2 },
        { code: '4202', name: 'Interest Income', isGroup: false, level: 2 },
        { code: '4203', name: 'Miscellaneous Income', isGroup: false, level: 2 },
      ]},
    ]},
    // ── EXPENSES ──
    { code: '5000', name: 'Expenses', rootType: 'EXPENSE', balanceType: 'DEBIT', level: 0, ...base, children: [
      { code: '5100', name: 'Salary & Wages', level: 1, children: [
        { code: '5101', name: 'Teacher Salary', isGroup: false, level: 2 },
        { code: '5102', name: 'Staff Salary', isGroup: false, level: 2 },
        { code: '5103', name: 'Bonus & Allowances', isGroup: false, level: 2 },
      ]},
      { code: '5200', name: 'Operating Expenses', level: 1, children: [
        { code: '5201', name: 'Rent', isGroup: false, level: 2 },
        { code: '5202', name: 'Utilities (Electricity/Gas/Water)', isGroup: false, level: 2 },
        { code: '5203', name: 'Internet & Phone', isGroup: false, level: 2 },
        { code: '5204', name: 'Stationery & Supplies', isGroup: false, level: 2 },
        { code: '5205', name: 'Printing', isGroup: false, level: 2 },
        { code: '5206', name: 'Maintenance & Repairs', isGroup: false, level: 2 },
        { code: '5207', name: 'Transport Expense', isGroup: false, level: 2 },
        { code: '5208', name: 'Cleaning', isGroup: false, level: 2 },
      ]},
      { code: '5300', name: 'Administrative Expenses', level: 1, children: [
        { code: '5301', name: 'Marketing & Advertising', isGroup: false, level: 2 },
        { code: '5302', name: 'Insurance', isGroup: false, level: 2 },
        { code: '5303', name: 'Legal & Professional', isGroup: false, level: 2 },
        { code: '5304', name: 'Bank Charges', isGroup: false, level: 2 },
        { code: '5305', name: 'Miscellaneous Expense', isGroup: false, level: 2 },
      ]},
    ]},
  ];

  const created = [];

  const insertNode = async (node, parentId, rootType, balanceType) => {
    const rt = node.rootType || rootType;
    const bt = node.balanceType || balanceType;
    const { children, ...data } = node;
    const doc = await AccountHead.create({
      ...filter,
      ...data,
      rootType: rt,
      balanceType: bt,
      parentId: parentId || null,
      isGroup: data.isGroup !== undefined ? data.isGroup : true,
      isSystem: true,
      createdBy: scope.createdBy,
    });
    created.push(doc);
    if (children) {
      for (const child of children) {
        await insertNode(child, doc._id, rt, bt);
      }
    }
  };

  for (const root of tree) {
    await insertNode(root, null, root.rootType, root.balanceType);
  }

  // Also seed a default Cash bank account
  const cashHead = created.find((a) => a.code === '1101');
  if (cashHead) {
    await BankAccount.create({
      ...filter,
      accountHeadId: cashHead._id,
      name: 'Cash in Hand',
      accountType: 'cash',
      isDefault: true,
      createdBy: scope.createdBy,
    });
  }

  return { message: 'Chart of Accounts seeded successfully', count: created.length };
};

// ═══════════════════════════════════════════════════════════════════════════
// ─── Chart of Accounts — CRUD ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const getChartOfAccounts = async (scope) => {
  const accounts = await AccountHead.find(getTenantFilter(scope))
    .sort({ code: 1 })
    .lean();
  return accounts;
};

const getAccountTree = async (scope) => {
  const accounts = await AccountHead.find(getTenantFilter(scope))
    .sort({ code: 1 })
    .lean();

  // Build tree structure
  const map = {};
  const roots = [];
  accounts.forEach((a) => { map[a.id] = { ...a, children: [] }; });
  accounts.forEach((a) => {
    if (a.parentId && map[a.parentId]) {
      map[a.parentId].children.push(map[a.id]);
    } else {
      roots.push(map[a.id]);
    }
  });
  return roots;
};

const getAccountHeadById = async (id, scope) => {
  const account = await AccountHead.findOne({ _id: id, ...getTenantFilter(scope) });
  if (!account) throw new ApiError(httpStatus.NOT_FOUND, 'Account head not found');
  return account;
};

const createAccountHead = async (data, scope) => {
  // If parentId provided, inherit rootType & balanceType
  if (data.parentId) {
    const parent = await AccountHead.findById(data.parentId);
    if (!parent) throw new ApiError(httpStatus.BAD_REQUEST, 'Parent account not found');
    data.rootType = parent.rootType;
    data.balanceType = parent.balanceType;
    data.level = parent.level + 1;
  }
  return AccountHead.create({ ...getTenantFilter(scope), ...data, createdBy: scope.createdBy });
};

const updateAccountHead = async (id, updates, scope) => {
  const account = await getAccountHeadById(id, scope);
  if (account.isSystem && (updates.code || updates.rootType || updates.balanceType)) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot change system account code or type');
  }
  Object.assign(account, updates);
  await account.save();
  return account;
};

const deleteAccountHead = async (id, scope) => {
  const account = await getAccountHeadById(id, scope);
  if (account.isSystem) throw new ApiError(httpStatus.FORBIDDEN, 'Cannot delete system account');
  // Check for children
  const children = await AccountHead.countDocuments({ parentId: id, ...getTenantFilter(scope) });
  if (children > 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete account with sub-accounts');
  // Check for journal entries
  const entries = await JournalEntry.countDocuments({ 'lines.accountId': id, ...getTenantFilter(scope) });
  if (entries > 0) throw new ApiError(httpStatus.BAD_REQUEST, 'Cannot delete account with journal entries');
  await account.deleteOne();
  return account;
};

// Get all leaf (posting) accounts for dropdowns
const getPostingAccounts = async (scope, rootType) => {
  const filter = { ...getTenantFilter(scope), isGroup: false, isActive: true };
  if (rootType) filter.rootType = rootType;
  return AccountHead.find(filter).sort({ code: 1 }).lean();
};

// ═══════════════════════════════════════════════════════════════════════════
// ─── Journal Entries ──────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a double-entry journal entry and update account balances.
 */
const createJournalEntry = async (data, scope) => {
  const { lines } = data;
  if (!lines || lines.length < 2) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Journal entry must have at least 2 lines');
  }

  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Debit (${totalDebit}) must equal Credit (${totalCredit})`);
  }

  // Validate all account IDs exist and are posting accounts
  const accountIds = lines.map((l) => l.accountId);
  const accounts = await AccountHead.find({
    _id: { $in: accountIds },
    ...getTenantFilter(scope),
  });
  if (accounts.length !== new Set(accountIds.map(String)).size) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'One or more account IDs are invalid');
  }

  const now = new Date();
  const fy = getFinancialYear(data.date || now);

  const entry = await JournalEntry.create({
    ...getTenantFilter(scope),
    ...data,
    totalAmount: totalDebit,
    financialYear: fy,
    createdBy: scope.createdBy,
  });

  // Update account balances
  for (const line of lines) {
    const acct = accounts.find((a) => String(a._id) === String(line.accountId));
    if (!acct) continue;
    // For DEBIT-natural accounts (Asset, Expense): debit increases, credit decreases
    // For CREDIT-natural accounts (Liability, Equity, Revenue): credit increases, debit decreases
    let delta;
    if (acct.balanceType === 'DEBIT') {
      delta = (line.debit || 0) - (line.credit || 0);
    } else {
      delta = (line.credit || 0) - (line.debit || 0);
    }
    await AccountHead.findByIdAndUpdate(line.accountId, { $inc: { currentBalance: delta } });
  }

  return entry;
};

/**
 * Reverse a journal entry (creates a mirror entry).
 */
const reverseJournalEntry = async (id, scope) => {
  const original = await JournalEntry.findOne({ _id: id, ...getTenantFilter(scope) });
  if (!original) throw new ApiError(httpStatus.NOT_FOUND, 'Journal entry not found');
  if (original.status === 'reversed') throw new ApiError(httpStatus.BAD_REQUEST, 'Entry already reversed');

  // Flip debit↔credit
  const reversedLines = original.lines.map((l) => ({
    accountId: l.accountId,
    debit: l.credit,
    credit: l.debit,
    description: `Reversal: ${l.description || ''}`,
  }));

  const reversal = await createJournalEntry(
    {
      date: new Date(),
      entryType: 'ADJUSTMENT',
      lines: reversedLines,
      narration: `Reversal of ${original.entryNumber}: ${original.narration || ''}`,
      referenceId: original.referenceId,
      referenceModel: original.referenceModel,
      reversalOf: original._id,
      status: 'posted',
    },
    scope
  );

  original.status = 'reversed';
  await original.save();

  return reversal;
};

const queryJournalEntries = async (scope, filter = {}, options = {}) => {
  const query = { ...getTenantFilter(scope) };
  if (filter.entryType) query.entryType = filter.entryType;
  if (filter.status) query.status = filter.status;
  if (filter.financialYear) query.financialYear = filter.financialYear;
  if (filter.accountId) query['lines.accountId'] = filter.accountId;
  if (filter.startDate || filter.endDate) {
    query.date = {};
    if (filter.startDate) query.date.$gte = new Date(filter.startDate);
    if (filter.endDate) query.date.$lte = new Date(filter.endDate);
  }

  return JournalEntry.paginate(query, {
    ...options,
    sort: options.sort || { date: -1 },
    populate: [{ path: 'lines.accountId', select: 'code name rootType' }],
  });
};

const getJournalEntryById = async (id, scope) => {
  const entry = await JournalEntry.findOne({ _id: id, ...getTenantFilter(scope) })
    .populate('lines.accountId', 'code name rootType balanceType');
  if (!entry) throw new ApiError(httpStatus.NOT_FOUND, 'Journal entry not found');
  return entry;
};

// ═══════════════════════════════════════════════════════════════════════════
// ─── Bank Accounts ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const getBankAccounts = async (scope) => {
  return BankAccount.find({ ...getTenantFilter(scope), isActive: true })
    .populate('accountHeadId', 'code name currentBalance')
    .sort({ isDefault: -1, name: 1 })
    .lean();
};

const createBankAccount = async (data, scope) => {
  // Create linked AccountHead under "Current Assets" if not provided
  if (!data.accountHeadId) {
    const parent = await AccountHead.findOne({ ...getTenantFilter(scope), code: '1100' }); // Current Assets
    if (parent) {
      const count = await BankAccount.countDocuments(getTenantFilter(scope));
      const code = `1110${count + 1}`;
      const head = await AccountHead.create({
        ...getTenantFilter(scope),
        code,
        name: data.name,
        rootType: 'ASSET',
        balanceType: 'DEBIT',
        parentId: parent._id,
        level: 2,
        isGroup: false,
        openingBalance: data.openingBalance || 0,
        currentBalance: data.openingBalance || 0,
        createdBy: scope.createdBy,
      });
      data.accountHeadId = head._id;
    }
  }
  return BankAccount.create({ ...getTenantFilter(scope), ...data, createdBy: scope.createdBy });
};

const updateBankAccount = async (id, updates, scope) => {
  const bank = await BankAccount.findOne({ _id: id, ...getTenantFilter(scope) });
  if (!bank) throw new ApiError(httpStatus.NOT_FOUND, 'Bank account not found');
  Object.assign(bank, updates);
  await bank.save();
  return bank;
};

const deleteBankAccount = async (id, scope) => {
  const bank = await BankAccount.findOne({ _id: id, ...getTenantFilter(scope) });
  if (!bank) throw new ApiError(httpStatus.NOT_FOUND, 'Bank account not found');
  bank.isActive = false;
  await bank.save();
  return bank;
};

// ═══════════════════════════════════════════════════════════════════════════
// ─── Budget Management ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const getBudgets = async (scope, financialYear) => {
  return Budget.find({ ...getTenantFilter(scope), ...(financialYear ? { financialYear } : {}) })
    .populate('accountHeadId', 'code name rootType')
    .sort({ 'accountHeadId.code': 1 })
    .lean();
};

const createBudget = async (data, scope) => {
  return Budget.create({ ...getTenantFilter(scope), ...data, createdBy: scope.createdBy });
};

const updateBudget = async (id, updates, scope) => {
  const budget = await Budget.findOne({ _id: id, ...getTenantFilter(scope) });
  if (!budget) throw new ApiError(httpStatus.NOT_FOUND, 'Budget not found');
  Object.assign(budget, updates);
  await budget.save();
  return budget;
};

const deleteBudget = async (id, scope) => {
  const budget = await Budget.findOne({ _id: id, ...getTenantFilter(scope) });
  if (!budget) throw new ApiError(httpStatus.NOT_FOUND, 'Budget not found');
  await budget.deleteOne();
  return budget;
};

// ═══════════════════════════════════════════════════════════════════════════
// ─── Financial Statements (Aggregated from Journal Entries) ───────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * General Ledger — all entries for a specific account within a date range.
 */
const getGeneralLedger = async (scope, accountId, startDate, endDate) => {
  const match = {
    ...aggFilter(scope),
    'lines.accountId': new mongoose.Types.ObjectId(accountId),
    status: 'posted',
  };
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }

  const account = await AccountHead.findById(accountId).lean();

  const entries = await JournalEntry.find(match)
    .sort({ date: 1, createdAt: 1 })
    .populate('lines.accountId', 'code name')
    .lean();

  // Build running balance
  let runningBalance = account?.openingBalance || 0;
  const ledger = entries.map((e) => {
    const line = e.lines.find((l) => String(l.accountId._id || l.accountId) === String(accountId));
    if (!line) return null;
    if (account.balanceType === 'DEBIT') {
      runningBalance += (line.debit || 0) - (line.credit || 0);
    } else {
      runningBalance += (line.credit || 0) - (line.debit || 0);
    }
    return {
      date: e.date,
      entryNumber: e.entryNumber,
      narration: e.narration,
      entryType: e.entryType,
      debit: line.debit || 0,
      credit: line.credit || 0,
      balance: runningBalance,
      contraAccounts: e.lines
        .filter((l) => String(l.accountId._id || l.accountId) !== String(accountId))
        .map((l) => ({ code: l.accountId.code, name: l.accountId.name })),
    };
  }).filter(Boolean);

  return {
    account: { id: account._id, code: account.code, name: account.name, rootType: account.rootType },
    openingBalance: account?.openingBalance || 0,
    closingBalance: runningBalance,
    entries: ledger,
  };
};

/**
 * Trial Balance — all account heads with their debit/credit totals.
 */
const getTrialBalance = async (scope, startDate, endDate) => {
  const match = { ...aggFilter(scope), status: 'posted' };
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }

  const result = await JournalEntry.aggregate([
    { $match: match },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.accountId',
        totalDebit: { $sum: '$lines.debit' },
        totalCredit: { $sum: '$lines.credit' },
      },
    },
    {
      $lookup: {
        from: 'accountheads',
        localField: '_id',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $unwind: '$account' },
    {
      $project: {
        accountId: '$_id',
        code: '$account.code',
        name: '$account.name',
        rootType: '$account.rootType',
        balanceType: '$account.balanceType',
        parentId: '$account.parentId',
        level: '$account.level',
        totalDebit: 1,
        totalCredit: 1,
        balance: {
          $cond: {
            if: { $eq: ['$account.balanceType', 'DEBIT'] },
            then: { $subtract: ['$totalDebit', '$totalCredit'] },
            else: { $subtract: ['$totalCredit', '$totalDebit'] },
          },
        },
      },
    },
    { $sort: { code: 1 } },
  ]);

  const totalDebit = result.reduce((s, r) => s + r.totalDebit, 0);
  const totalCredit = result.reduce((s, r) => s + r.totalCredit, 0);

  return {
    accounts: result,
    totals: { totalDebit, totalCredit, difference: Math.abs(totalDebit - totalCredit) },
  };
};

/**
 * Balance Sheet — Assets = Liabilities + Equity
 */
const getBalanceSheet = async (scope, asOfDate) => {
  const match = { ...aggFilter(scope), status: 'posted' };
  if (asOfDate) match.date = { $lte: new Date(asOfDate) };

  const result = await JournalEntry.aggregate([
    { $match: match },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.accountId',
        totalDebit: { $sum: '$lines.debit' },
        totalCredit: { $sum: '$lines.credit' },
      },
    },
    {
      $lookup: {
        from: 'accountheads',
        localField: '_id',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $unwind: '$account' },
    {
      $match: {
        'account.rootType': { $in: ['ASSET', 'LIABILITY', 'EQUITY'] },
      },
    },
    {
      $project: {
        code: '$account.code',
        name: '$account.name',
        rootType: '$account.rootType',
        balanceType: '$account.balanceType',
        parentId: '$account.parentId',
        balance: {
          $cond: {
            if: { $eq: ['$account.balanceType', 'DEBIT'] },
            then: { $subtract: ['$totalDebit', '$totalCredit'] },
            else: { $subtract: ['$totalCredit', '$totalDebit'] },
          },
        },
      },
    },
    { $sort: { code: 1 } },
  ]);

  const assets = result.filter((r) => r.rootType === 'ASSET');
  const liabilities = result.filter((r) => r.rootType === 'LIABILITY');
  const equity = result.filter((r) => r.rootType === 'EQUITY');

  const totalAssets = assets.reduce((s, r) => s + r.balance, 0);
  const totalLiabilities = liabilities.reduce((s, r) => s + r.balance, 0);
  const totalEquity = equity.reduce((s, r) => s + r.balance, 0);

  // Net income for the period (Revenue - Expenses) from P&L goes to equity
  const pnlMatch = { ...match, 'lines.accountId': { $exists: true } };
  const pnl = await JournalEntry.aggregate([
    { $match: pnlMatch },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.accountId',
        totalDebit: { $sum: '$lines.debit' },
        totalCredit: { $sum: '$lines.credit' },
      },
    },
    {
      $lookup: {
        from: 'accountheads',
        localField: '_id',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $unwind: '$account' },
    {
      $match: { 'account.rootType': { $in: ['REVENUE', 'EXPENSE'] } },
    },
    {
      $project: {
        rootType: '$account.rootType',
        balance: {
          $cond: {
            if: { $eq: ['$account.balanceType', 'DEBIT'] },
            then: { $subtract: ['$totalDebit', '$totalCredit'] },
            else: { $subtract: ['$totalCredit', '$totalDebit'] },
          },
        },
      },
    },
  ]);

  const totalRevenue = pnl.filter((r) => r.rootType === 'REVENUE').reduce((s, r) => s + r.balance, 0);
  const totalExpenses = pnl.filter((r) => r.rootType === 'EXPENSE').reduce((s, r) => s + r.balance, 0);
  const netIncome = totalRevenue - totalExpenses;

  return {
    assets: { accounts: assets, total: totalAssets },
    liabilities: { accounts: liabilities, total: totalLiabilities },
    equity: { accounts: equity, total: totalEquity, netIncome },
    totals: {
      totalAssets,
      totalLiabilitiesAndEquity: totalLiabilities + totalEquity + netIncome,
      isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity + netIncome)) < 0.01,
    },
  };
};

/**
 * Income Statement (P&L) — Revenue minus Expenses for a period.
 */
const getIncomeStatement = async (scope, startDate, endDate) => {
  const match = { ...aggFilter(scope), status: 'posted' };
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }

  const result = await JournalEntry.aggregate([
    { $match: match },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.accountId',
        totalDebit: { $sum: '$lines.debit' },
        totalCredit: { $sum: '$lines.credit' },
      },
    },
    {
      $lookup: {
        from: 'accountheads',
        localField: '_id',
        foreignField: '_id',
        as: 'account',
      },
    },
    { $unwind: '$account' },
    {
      $match: {
        'account.rootType': { $in: ['REVENUE', 'EXPENSE'] },
      },
    },
    {
      $project: {
        code: '$account.code',
        name: '$account.name',
        rootType: '$account.rootType',
        balanceType: '$account.balanceType',
        parentId: '$account.parentId',
        balance: {
          $cond: {
            if: { $eq: ['$account.balanceType', 'DEBIT'] },
            then: { $subtract: ['$totalDebit', '$totalCredit'] },
            else: { $subtract: ['$totalCredit', '$totalDebit'] },
          },
        },
      },
    },
    { $sort: { code: 1 } },
  ]);

  const revenue = result.filter((r) => r.rootType === 'REVENUE');
  const expenses = result.filter((r) => r.rootType === 'EXPENSE');
  const totalRevenue = revenue.reduce((s, r) => s + r.balance, 0);
  const totalExpenses = expenses.reduce((s, r) => s + r.balance, 0);

  return {
    revenue: { accounts: revenue, total: totalRevenue },
    expenses: { accounts: expenses, total: totalExpenses },
    netIncome: totalRevenue - totalExpenses,
    netIncomePercentage: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue * 100).toFixed(1) : 0,
  };
};

/**
 * Cash Flow Statement — track cash in/out from bank & cash accounts.
 */
const getCashFlowStatement = async (scope, startDate, endDate) => {
  // Get all cash/bank account heads
  const bankAccounts = await BankAccount.find({ ...getTenantFilter(scope), isActive: true }).lean();
  const cashAccountIds = bankAccounts.map((b) => b.accountHeadId);

  if (cashAccountIds.length === 0) return { inflows: [], outflows: [], netCashFlow: 0 };

  const match = {
    ...aggFilter(scope),
    status: 'posted',
    'lines.accountId': { $in: cashAccountIds.map((id) => new mongoose.Types.ObjectId(id)) },
  };
  if (startDate || endDate) {
    match.date = {};
    if (startDate) match.date.$gte = new Date(startDate);
    if (endDate) match.date.$lte = new Date(endDate);
  }

  const entries = await JournalEntry.aggregate([
    { $match: match },
    { $unwind: '$lines' },
    {
      $match: {
        'lines.accountId': { $in: cashAccountIds.map((id) => new mongoose.Types.ObjectId(id)) },
      },
    },
    {
      $group: {
        _id: '$entryType',
        totalInflow: { $sum: '$lines.debit' },
        totalOutflow: { $sum: '$lines.credit' },
        count: { $sum: 1 },
      },
    },
  ]);

  const totalInflow = entries.reduce((s, e) => s + e.totalInflow, 0);
  const totalOutflow = entries.reduce((s, e) => s + e.totalOutflow, 0);

  return {
    byType: entries.map((e) => ({
      type: e._id,
      inflow: e.totalInflow,
      outflow: e.totalOutflow,
      net: e.totalInflow - e.totalOutflow,
      count: e.count,
    })),
    totals: { totalInflow, totalOutflow, netCashFlow: totalInflow - totalOutflow },
  };
};

/**
 * Budget vs Actual — compare budgeted amounts to actual journal entries.
 */
const getBudgetVsActual = async (scope, financialYear) => {
  const fy = financialYear || getFinancialYear(new Date());
  const budgets = await Budget.find({ ...getTenantFilter(scope), financialYear: fy })
    .populate('accountHeadId', 'code name rootType')
    .lean();

  if (budgets.length === 0) return { items: [], totals: { budgeted: 0, actual: 0, variance: 0 } };

  // Get actual spend per account
  const [fyStart, fyEnd] = getFinancialYearDates(fy);
  const actuals = await JournalEntry.aggregate([
    {
      $match: {
        ...aggFilter(scope),
        status: 'posted',
        date: { $gte: fyStart, $lte: fyEnd },
      },
    },
    { $unwind: '$lines' },
    {
      $match: {
        'lines.accountId': { $in: budgets.map((b) => new mongoose.Types.ObjectId(b.accountHeadId._id)) },
      },
    },
    {
      $group: {
        _id: '$lines.accountId',
        totalDebit: { $sum: '$lines.debit' },
        totalCredit: { $sum: '$lines.credit' },
      },
    },
  ]);

  const actualMap = {};
  actuals.forEach((a) => { actualMap[String(a._id)] = a; });

  const items = budgets.map((b) => {
    const actual = actualMap[String(b.accountHeadId._id)] || { totalDebit: 0, totalCredit: 0 };
    // For expense accounts, actual is debit; for revenue, actual is credit
    const actualAmount = b.accountHeadId.rootType === 'EXPENSE'
      ? actual.totalDebit - actual.totalCredit
      : actual.totalCredit - actual.totalDebit;
    const variance = b.annualBudget - actualAmount;
    const utilization = b.annualBudget > 0 ? ((actualAmount / b.annualBudget) * 100).toFixed(1) : 0;

    return {
      _id: b._id,
      accountId: b.accountHeadId._id,
      code: b.accountHeadId.code,
      accountName: b.accountHeadId.name,
      rootType: b.accountHeadId.rootType,
      annualBudget: b.annualBudget,
      spent: actualAmount,
      variance,
      utilization: Number(utilization),
    };
  });

  return {
    financialYear: fy,
    items,
    totals: {
      budgeted: items.reduce((s, i) => s + i.annualBudget, 0),
      actual: items.reduce((s, i) => s + i.spent, 0),
      variance: items.reduce((s, i) => s + i.variance, 0),
    },
  };
};

/**
 * Accounts Dashboard — summary for the accounting module home page.
 */
const getAccountsDashboard = async (scope, year) => {
  const y = year || new Date().getFullYear();
  const fy = getFinancialYear(new Date(y, 0, 1));
  const [fyStart, fyEnd] = getFinancialYearDates(fy);
  const match = { ...aggFilter(scope), status: 'posted', date: { $gte: fyStart, $lte: fyEnd } };

  // Totals by root type
  const [totals, rawCashFlow, recentEntries, bankAccounts] = await Promise.all([
    JournalEntry.aggregate([
      { $match: match },
      { $unwind: '$lines' },
      {
        $lookup: {
          from: 'accountheads',
          localField: 'lines.accountId',
          foreignField: '_id',
          as: 'acct',
        },
      },
      { $unwind: '$acct' },
      {
        $group: {
          _id: '$acct.rootType',
          totalDebit: { $sum: '$lines.debit' },
          totalCredit: { $sum: '$lines.credit' },
        },
      },
    ]),
    // Monthly cash flow
    JournalEntry.aggregate([
      { $match: match },
      { $unwind: '$lines' },
      {
        $lookup: {
          from: 'bankaccounts',
          localField: 'lines.accountId',
          foreignField: 'accountHeadId',
          as: 'bank',
        },
      },
      { $match: { 'bank.0': { $exists: true } } },
      {
        $group: {
          _id: { month: { $month: '$date' } },
          inflow: { $sum: '$lines.debit' },
          outflow: { $sum: '$lines.credit' },
        },
      },
      { $sort: { '_id.month': 1 } },
    ]),
    JournalEntry.find({ ...getTenantFilter(scope), status: 'posted' })
      .sort({ date: -1 })
      .limit(10)
      .populate('lines.accountId', 'code name')
      .lean(),
    BankAccount.find({ ...getTenantFilter(scope), isActive: true })
      .populate('accountHeadId', 'code name currentBalance')
      .lean(),
  ]);

  const byType = {};
  totals.forEach((t) => {
    if (t._id === 'REVENUE') byType.revenue = t.totalCredit - t.totalDebit;
    if (t._id === 'EXPENSE') byType.expense = t.totalDebit - t.totalCredit;
    if (t._id === 'ASSET') byType.assets = t.totalDebit - t.totalCredit;
    if (t._id === 'LIABILITY') byType.liabilities = t.totalCredit - t.totalDebit;
  });

  const totalAccounts = await AccountHead.countDocuments(getTenantFilter(scope));

  const monthlyCashFlow = MONTHS.map((m, i) => {
    const entry = rawCashFlow.find((e) => e._id.month === i + 1);
    return { month: m.slice(0, 3), inflow: entry?.inflow || 0, outflow: entry?.outflow || 0 };
  });

  return {
    summary: {
      totalAccounts,
      totalRevenue: byType.revenue || 0,
      totalExpenses: byType.expense || 0,
      netIncome: (byType.revenue || 0) - (byType.expense || 0),
      totalAssets: byType.assets || 0,
      totalLiabilities: byType.liabilities || 0,
    },
    monthlyCashFlow,
    recentEntries: recentEntries.map((e) => ({
      _id: e._id,
      entryNumber: e.entryNumber,
      date: e.date,
      entryType: e.entryType,
      totalAmount: e.totalAmount,
      description: e.description,
      lines: e.lines?.map((l) => ({
        accountName: l.accountId?.name || 'Unknown',
        code: l.accountId?.code || '',
        debit: l.debit,
        credit: l.credit,
      })),
    })),
    bankBalances: bankAccounts.map((b) => ({
      _id: b._id,
      accountName: b.name,
      accountType: b.accountType,
      currentBalance: b.accountHeadId?.currentBalance ?? b.currentBalance ?? b.openingBalance ?? 0,
      bankName: b.bankName,
    })),
    financialYear: fy,
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// ─── Auto-Post Helpers (called from existing services) ────────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Auto-create journal entry when a fee payment is recorded.
 * Debit: Cash/Bank (asset increases)
 * Credit: Fee Income / Tuition Fee (revenue increases)
 */
const postFeePayment = async (scope, { amount, paymentMethod, voucherId, description }) => {
  const [cashAccount, feeIncomeAccount] = await Promise.all([
    resolvePaymentAccount(scope, paymentMethod),
    AccountHead.findOne({ ...getTenantFilter(scope), code: '4101', isGroup: false }),
  ]);
  if (!cashAccount || !feeIncomeAccount) return null; // COA not seeded yet

  return createJournalEntry(
    {
      date: new Date(),
      entryType: 'FEE_RECEIPT',
      lines: [
        { accountId: cashAccount._id, debit: amount, credit: 0, description: 'Cash/Bank received' },
        { accountId: feeIncomeAccount._id, debit: 0, credit: amount, description: 'Fee income' },
      ],
      narration: description || 'Fee payment received',
      referenceId: voucherId,
      referenceModel: 'FeeVoucher',
    },
    scope
  );
};

/**
 * Auto-create journal entry when an expense transaction is recorded.
 * Debit: Expense account (expense increases)
 * Credit: Cash/Bank (asset decreases)
 */
const postExpense = async (scope, { amount, paymentMethod, expenseAccountCode, transactionId, description }) => {
  const [cashAccount, expenseAccount] = await Promise.all([
    resolvePaymentAccount(scope, paymentMethod),
    AccountHead.findOne({ ...getTenantFilter(scope), code: expenseAccountCode || '5305', isGroup: false }),
  ]);
  if (!cashAccount || !expenseAccount) return null;

  return createJournalEntry(
    {
      date: new Date(),
      entryType: 'EXPENSE',
      lines: [
        { accountId: expenseAccount._id, debit: amount, credit: 0, description: 'Expense recorded' },
        { accountId: cashAccount._id, debit: 0, credit: amount, description: 'Cash/Bank paid' },
      ],
      narration: description || 'Expense payment',
      referenceId: transactionId,
      referenceModel: 'SchoolTransaction',
    },
    scope
  );
};

/**
 * Auto-create journal entry when teacher salary is paid.
 * Debit: Teacher Salary expense
 * Credit: Cash/Bank
 */
const postSalaryPayment = async (scope, { amount, paymentMethod, payrollId, description }) => {
  const [cashAccount, salaryAccount] = await Promise.all([
    resolvePaymentAccount(scope, paymentMethod),
    AccountHead.findOne({ ...getTenantFilter(scope), code: '5101', isGroup: false }),
  ]);
  if (!cashAccount || !salaryAccount) return null;

  return createJournalEntry(
    {
      date: new Date(),
      entryType: 'SALARY',
      lines: [
        { accountId: salaryAccount._id, debit: amount, credit: 0, description: 'Salary expense' },
        { accountId: cashAccount._id, debit: 0, credit: amount, description: 'Cash/Bank paid' },
      ],
      narration: description || 'Salary payment',
      referenceId: payrollId,
      referenceModel: 'TeacherPayroll',
    },
    scope
  );
};

/**
 * Auto-create journal entry for advance fee payment (credit wallet).
 * Debit: Cash/Bank
 * Credit: Student Advance (Liability)
 */
const postAdvancePayment = async (scope, { amount, paymentMethod, creditLedgerId, description }) => {
  const [cashAccount, advanceAccount] = await Promise.all([
    resolvePaymentAccount(scope, paymentMethod),
    AccountHead.findOne({ ...getTenantFilter(scope), code: '2102', isGroup: false }),
  ]);
  if (!cashAccount || !advanceAccount) return null;

  return createJournalEntry(
    {
      date: new Date(),
      entryType: 'ADVANCE',
      lines: [
        { accountId: cashAccount._id, debit: amount, credit: 0, description: 'Cash received' },
        { accountId: advanceAccount._id, debit: 0, credit: amount, description: 'Student advance received' },
      ],
      narration: description || 'Advance fee payment',
      referenceId: creditLedgerId,
      referenceModel: 'StudentCreditLedger',
    },
    scope
  );
};

/**
 * Resolve payment method to an account head (Cash/Bank).
 */
const resolvePaymentAccount = async (scope, paymentMethod) => {
  if (paymentMethod === 'bank_transfer' || paymentMethod === 'cheque' || paymentMethod === 'online') {
    const bankAccount = await BankAccount.findOne({ ...getTenantFilter(scope), accountType: 'bank', isActive: true });
    if (bankAccount) return AccountHead.findById(bankAccount.accountHeadId);
  }
  // Default to Cash in Hand
  return AccountHead.findOne({ ...getTenantFilter(scope), code: '1101', isGroup: false });
};

// ═══════════════════════════════════════════════════════════════════════════
// ─── Utility ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

function getFinancialYear(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = d.getMonth(); // 0-indexed
  // Financial year: July to June (common in Pakistan/South Asia)
  if (m >= 6) return `${y}-${y + 1}`;
  return `${y - 1}-${y}`;
}

function getFinancialYearDates(fy) {
  const [startYear] = fy.split('-').map(Number);
  return [new Date(startYear, 6, 1), new Date(startYear + 1, 5, 30, 23, 59, 59)];
}

module.exports = {
  // COA
  seedChartOfAccounts,
  getChartOfAccounts,
  getAccountTree,
  getAccountHeadById,
  createAccountHead,
  updateAccountHead,
  deleteAccountHead,
  getPostingAccounts,
  // Journal
  createJournalEntry,
  reverseJournalEntry,
  queryJournalEntries,
  getJournalEntryById,
  // Bank
  getBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  // Budget
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget,
  // Financial Statements
  getGeneralLedger,
  getTrialBalance,
  getBalanceSheet,
  getIncomeStatement,
  getCashFlowStatement,
  getBudgetVsActual,
  getAccountsDashboard,
  // Auto-post
  postFeePayment,
  postExpense,
  postSalaryPayment,
  postAdvancePayment,
  // Utility
  getFinancialYear,
};
