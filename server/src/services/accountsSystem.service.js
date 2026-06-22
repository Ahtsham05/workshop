const mongoose = require('mongoose');
const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const {
  AccountHead,
  JournalEntry,
  BankAccount,
  Budget,
  FeeCategory,
  Organization,
  Customer,
  Supplier,
  Wallet,
} = require('../models');
const { normalizeBusinessType } = require('../config/businessTypes');

// Stable account codes used by the auto-posting layer so journal entries
// always land on the right account regardless of business type.
const ACCOUNT_CODES = {
  CASH: '1101',
  BANK: '1102',
  ACCOUNTS_RECEIVABLE: '1103',
  WALLET_JAZZCASH: '1104',
  WALLET_EASYPAISA: '1105',
  INVENTORY: '1106',
  WALLET_GROUP: '1150',
  ACCOUNTS_PAYABLE: '2101',
  CUSTOMER_ADVANCE: '2102',
  TAX_PAYABLE: '2105',
  SALES_REVENUE: '4101',
  SERVICE_INCOME: '4102',
  REPAIR_INCOME: '4103',
  COMMISSION_INCOME: '4104',
  BILL_INCOME: '4105',
  OTHER_INCOME: '4203',
  COGS: '5101',
  BILL_LOSS: '5207',
  MISC_EXPENSE: '5303',
};

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
 * School Chart of Accounts (fees, tuition, teacher salary, student advances).
 */
const buildSchoolTree = (base) => [
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
    { code: '1150', name: 'Wallets (Bank & Cash)', level: 1, children: [] },
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

/**
 * Retail / general-business Chart of Accounts (sales, COGS, inventory,
 * receivables/payables control accounts, mobile wallets, etc.).
 * Account codes here are kept in sync with ACCOUNT_CODES so the auto-posting
 * layer can always resolve the correct head.
 */
const buildRetailTree = (base) => [
  // ── ASSETS ──
  { code: '1000', name: 'Assets', rootType: 'ASSET', balanceType: 'DEBIT', level: 0, ...base, children: [
    { code: '1100', name: 'Current Assets', level: 1, children: [
      { code: '1101', name: 'Cash in Hand', isGroup: false, level: 2 },
      { code: '1102', name: 'Bank Accounts', isGroup: false, level: 2 },
      { code: '1103', name: 'Accounts Receivable', isGroup: false, level: 2 },
      { code: '1104', name: 'Mobile Wallet - JazzCash', isGroup: false, level: 2, mobileOnly: true },
      { code: '1105', name: 'Mobile Wallet - EasyPaisa', isGroup: false, level: 2, mobileOnly: true },
      { code: '1106', name: 'Inventory', isGroup: false, level: 2 },
      { code: '1107', name: 'Other Receivables', isGroup: false, level: 2 },
    ]},
    { code: '1200', name: 'Fixed Assets', level: 1, children: [
      { code: '1201', name: 'Furniture & Fixtures', isGroup: false, level: 2 },
      { code: '1202', name: 'Equipment', isGroup: false, level: 2 },
      { code: '1203', name: 'Building', isGroup: false, level: 2 },
      { code: '1204', name: 'Vehicles', isGroup: false, level: 2 },
    ]},
    { code: '1150', name: 'Wallets (Bank & Cash)', level: 1, children: [] },
  ]},
  // ── LIABILITIES ──
  { code: '2000', name: 'Liabilities', rootType: 'LIABILITY', balanceType: 'CREDIT', level: 0, ...base, children: [
    { code: '2100', name: 'Current Liabilities', level: 1, children: [
      { code: '2101', name: 'Accounts Payable', isGroup: false, level: 2 },
      { code: '2102', name: 'Customer Advances', isGroup: false, level: 2 },
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
    { code: '4100', name: 'Sales & Service Income', level: 1, children: [
      { code: '4101', name: 'Sales Revenue', isGroup: false, level: 2 },
      { code: '4102', name: 'Service Income', isGroup: false, level: 2 },
      { code: '4103', name: 'Repair Income', isGroup: false, level: 2, mobileOnly: true },
      { code: '4104', name: 'Load & Commission Income', isGroup: false, level: 2, mobileOnly: true },
      { code: '4105', name: 'Bill Payment Income', isGroup: false, level: 2, mobileOnly: true },
    ]},
    { code: '4200', name: 'Other Income', level: 1, children: [
      { code: '4201', name: 'Discount Received', isGroup: false, level: 2 },
      { code: '4202', name: 'Interest Income', isGroup: false, level: 2 },
      { code: '4203', name: 'Miscellaneous Income', isGroup: false, level: 2 },
    ]},
  ]},
  // ── EXPENSES ──
  { code: '5000', name: 'Expenses', rootType: 'EXPENSE', balanceType: 'DEBIT', level: 0, ...base, children: [
    { code: '5100', name: 'Cost of Sales', level: 1, children: [
      { code: '5101', name: 'Cost of Goods Sold', isGroup: false, level: 2 },
      { code: '5102', name: 'Purchase Discount', isGroup: false, level: 2 },
    ]},
    { code: '5200', name: 'Operating Expenses', level: 1, children: [
      { code: '5201', name: 'Rent', isGroup: false, level: 2 },
      { code: '5202', name: 'Utilities (Electricity/Gas/Water)', isGroup: false, level: 2 },
      { code: '5203', name: 'Internet & Phone', isGroup: false, level: 2 },
      { code: '5204', name: 'Salaries & Wages', isGroup: false, level: 2 },
      { code: '5205', name: 'Transport & Fuel', isGroup: false, level: 2 },
      { code: '5206', name: 'Repairs & Maintenance', isGroup: false, level: 2 },
      { code: '5207', name: 'Bill Payment Loss', isGroup: false, level: 2, mobileOnly: true },
    ]},
    { code: '5300', name: 'Administrative Expenses', level: 1, children: [
      { code: '5301', name: 'Marketing & Advertising', isGroup: false, level: 2 },
      { code: '5302', name: 'Bank Charges', isGroup: false, level: 2 },
      { code: '5303', name: 'Miscellaneous Expense', isGroup: false, level: 2 },
    ]},
  ]},
];

/**
 * Resolve organization business type onto the scope object.
 */
const enrichScope = async (scope) => {
  if (scope.businessType) {
    return { ...scope, businessType: normalizeBusinessType(scope.businessType) };
  }
  if (!scope.organizationId) {
    return { ...scope, businessType: 'other' };
  }
  const org = await Organization.findById(scope.organizationId).select('businessType').lean();
  return { ...scope, businessType: normalizeBusinessType(org?.businessType || 'other') };
};

/** Chart profile expected for a given business type. */
const getExpectedChartProfile = (businessType) => {
  const bt = normalizeBusinessType(businessType);
  if (bt === 'school') return 'school';
  if (bt === 'mobile_shop') return 'mobile_shop';
  return 'retail';
};

/**
 * Detect which chart template is currently seeded (school vs retail vs mobile_shop).
 * Uses stable marker accounts so we can fix mismatched orgs automatically.
 */
const detectChartProfile = async (filter) => {
  const revenue = await AccountHead.findOne({ ...filter, code: '4101' }).lean();
  if (revenue?.name === 'Tuition Fee') return 'school';
  if (revenue?.name === 'Sales Revenue') {
    const jazz = await AccountHead.findOne({ ...filter, code: '1104' }).lean();
    return jazz ? 'mobile_shop' : 'retail';
  }
  const expense5101 = await AccountHead.findOne({ ...filter, code: '5101' }).lean();
  if (expense5101?.name === 'Teacher Salary') return 'school';
  if (expense5101?.name === 'Cost of Goods Sold') {
    const jazz = await AccountHead.findOne({ ...filter, code: '1104' }).lean();
    return jazz ? 'mobile_shop' : 'retail';
  }
  return null;
};

/** Collect mobile-only nodes from the retail tree with their parent group code. */
const collectMobileOnlyNodes = (nodes, parentCode = null, result = []) => {
  for (const node of nodes) {
    if (node.mobileOnly) {
      result.push({ node, parentCode });
    }
    if (node.children) {
      collectMobileOnlyNodes(node.children, node.code, result);
    }
  }
  return result;
};

/**
 * Add mobile-shop-only accounts to an existing retail chart (upgrade path).
 */
const syncMobileShopAccounts = async (scope) => {
  const enriched = await enrichScope(scope);
  if (normalizeBusinessType(enriched.businessType) !== 'mobile_shop') return;

  const filter = getTenantFilter(enriched);
  const base = { ...filter, isSystem: true, createdBy: enriched.createdBy };
  const mobileNodes = collectMobileOnlyNodes(buildRetailTree(base));

  for (const { node, parentCode } of mobileNodes) {
    const exists = await AccountHead.findOne({ ...filter, code: node.code });
    if (exists) continue;

    const parent = parentCode
      ? await AccountHead.findOne({ ...filter, code: parentCode })
      : null;
    if (!parent) continue;

    const rt = parent.rootType;
    const bt = parent.balanceType;
    await AccountHead.create({
      ...filter,
      code: node.code,
      name: node.name,
      rootType: rt,
      balanceType: bt,
      parentId: parent._id,
      level: (parent.level || 0) + 1,
      isGroup: node.isGroup !== undefined ? node.isGroup : false,
      isSystem: true,
      createdBy: enriched.createdBy,
    });
  }
};

/**
 * Wipe the system chart of accounts (safe only when no posted journal entries exist).
 */
const resetChartOfAccounts = async (scope) => {
  const filter = getTenantFilter(scope);
  const partyFilter = scope.branchId
    ? { organizationId: scope.organizationId, branchId: scope.branchId }
    : { organizationId: scope.organizationId };

  await Budget.deleteMany(filter);
  await BankAccount.deleteMany(filter);
  await AccountHead.deleteMany(filter);
  await Customer.updateMany(partyFilter, { $unset: { accountHeadId: '' } });
  await Supplier.updateMany(partyFilter, { $unset: { accountHeadId: '' } });
};

/**
 * Seed a complete Chart of Accounts for a new org/branch, choosing the
 * template based on the organization's business type.
 * When the existing chart doesn't match the business type and there are no
 * journal entries, it is replaced automatically.
 */
const seedChartOfAccounts = async (scope, options = {}) => {
  const enriched = await enrichScope(scope);
  const filter = getTenantFilter(enriched);
  const existing = await AccountHead.countDocuments(filter);

  if (existing > 0 && !options.force) {
    const expected = getExpectedChartProfile(enriched.businessType);
    const actual = await detectChartProfile(filter);

    if (actual === expected) {
      if (expected === 'mobile_shop') await syncMobileShopAccounts(enriched);
      return { message: 'Chart of Accounts already seeded', count: existing, profile: expected };
    }

    const jeCount = await JournalEntry.countDocuments({ ...filter, status: 'posted' });
    if (jeCount > 0) {
      return {
        message: 'Chart of Accounts exists but does not match your business type. Clear journal entries to re-seed.',
        count: existing,
        expectedProfile: expected,
        actualProfile: actual,
      };
    }

    await resetChartOfAccounts(enriched);
  } else if (existing > 0 && options.force) {
    const jeCount = await JournalEntry.countDocuments({ ...filter, status: 'posted' });
    if (jeCount > 0) {
      throw new ApiError(
        httpStatus.CONFLICT,
        'Cannot re-seed chart of accounts while posted journal entries exist'
      );
    }
    await resetChartOfAccounts(enriched);
  }

  const businessType = enriched.businessType;
  const base = { ...filter, isSystem: true, isGroup: true, createdBy: enriched.createdBy };
  const isMobileShop = businessType === 'mobile_shop';
  const pruneMobile = (nodes) =>
    nodes
      .filter((n) => isMobileShop || !n.mobileOnly)
      .map((n) => ({ ...n, children: n.children ? pruneMobile(n.children) : undefined }));
  const tree =
    businessType === 'school' ? buildSchoolTree(base) : pruneMobile(buildRetailTree(base));

  const created = [];

  const insertNode = async (node, parentId, rootType, balanceType) => {
    const rt = node.rootType || rootType;
    const bt = node.balanceType || balanceType;
    const { children, mobileOnly, ...data } = node;
    const doc = await AccountHead.create({
      ...filter,
      ...data,
      rootType: rt,
      balanceType: bt,
      parentId: parentId || null,
      isGroup: data.isGroup !== undefined ? data.isGroup : true,
      isSystem: true,
      createdBy: enriched.createdBy,
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

  const cashHead = created.find((a) => a.code === '1101');
  if (cashHead) {
    await BankAccount.create({
      ...filter,
      accountHeadId: cashHead._id,
      name: 'Cash in Hand',
      accountType: 'cash',
      isDefault: true,
      createdBy: enriched.createdBy,
    });
  }

  const profile = getExpectedChartProfile(businessType);
  return { message: 'Chart of Accounts seeded successfully', count: created.length, profile };
};

/**
 * Ensure the chart of accounts exists AND matches the organization's business type.
 * Automatically replaces a wrong template (e.g. school chart on a mobile shop org)
 * when no journal entries have been posted yet.
 */
const ensureSeeded = async (scope) => {
  const enriched = await enrichScope(scope);
  const filter = getTenantFilter(enriched);
  const count = await AccountHead.countDocuments(filter);

  if (count === 0) {
    await seedChartOfAccounts(enriched);
    return true;
  }

  const expected = getExpectedChartProfile(enriched.businessType);
  const actual = await detectChartProfile(filter);

  if (actual === expected) {
    if (expected === 'mobile_shop') await syncMobileShopAccounts(enriched);
    return false;
  }

  if (actual === 'retail' && expected === 'mobile_shop') {
    await syncMobileShopAccounts(enriched);
    return false;
  }

  const jeCount = await JournalEntry.countDocuments({ ...filter, status: 'posted' });
  if (jeCount === 0) {
    await resetChartOfAccounts(enriched);
    await seedChartOfAccounts(enriched);
    return true;
  }

  return false;
};

// ═══════════════════════════════════════════════════════════════════════════
// ─── Chart of Accounts — CRUD ─────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const getChartOfAccounts = async (scope) => {
  await ensureSeeded(scope);
  const accounts = await AccountHead.find(getTenantFilter(scope))
    .sort({ code: 1 })
    .lean();
  return accounts;
};

const getAccountTree = async (scope) => {
  await ensureSeeded(scope);
  const accounts = await AccountHead.find(getTenantFilter(scope))
    .sort({ code: 1 })
    .lean();

  // Build tree structure
  const map = {};
  const roots = [];
  accounts.forEach((a) => { map[String(a._id)] = { ...a, children: [] }; });
  accounts.forEach((a) => {
    if (a.parentId && map[String(a.parentId)]) {
      map[String(a.parentId)].children.push(map[String(a._id)]);
    } else {
      roots.push(map[String(a._id)]);
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
  await ensureSeeded(scope);
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

  const normalizedLines = lines.map((line) => ({
    accountId: line.accountId,
    debit: line.debit || 0,
    credit: line.credit || 0,
    description: line.description || line.narration || '',
  }));

  const totalDebit = normalizedLines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = normalizedLines.reduce((s, l) => s + (l.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Debit (${totalDebit}) must equal Credit (${totalCredit})`);
  }

  // Validate all account IDs exist and are posting accounts
  const accountIds = normalizedLines.map((l) => l.accountId);
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
    lines: normalizedLines,
    narration: data.narration || data.description || '',
    totalAmount: totalDebit,
    financialYear: fy,
    createdBy: scope.createdBy,
  });

  // Update account balances
  for (const line of normalizedLines) {
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
  if (!id || id === 'undefined' || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid journal entry id');
  }
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
  if (!id || id === 'undefined' || !mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Invalid journal entry id');
  }
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
  await ensureSeeded(scope);
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
        accountId: '$_id',
        _id: 0,
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
    assets,
    liabilities,
    equity,
    totalAssets,
    totalLiabilities,
    totalEquity,
    netIncome,
    isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity + netIncome)) < 0.01,
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
        accountId: '$_id',
        _id: 0,
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
    revenue,
    expenses,
    totalRevenue,
    totalExpenses,
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
 * Clear all accounting activity for the branch: journal entries and balances.
 * Keeps the chart of accounts structure intact.
 */
const clearAllAccountingData = async (scope = {}) => {
  const tf = getTenantFilter(scope);

  const [jeResult, accountResult, bankResult] = await Promise.all([
    JournalEntry.deleteMany(tf),
    AccountHead.updateMany(tf, { $set: { currentBalance: 0, openingBalance: 0 } }),
    BankAccount.updateMany(tf, { $set: { currentBalance: 0, openingBalance: 0 } }),
  ]);

  if (scope.organizationId) {
    await mongoose.connection.db.collection('_sequences').deleteOne({
      _id: `journalEntry_${scope.organizationId}_${scope.branchId || 'default'}`,
    });
  }

  return {
    deletedJournalEntries: jeResult.deletedCount || 0,
    resetAccounts: accountResult.modifiedCount || 0,
    resetBankAccounts: bankResult.modifiedCount || 0,
  };
};

/**
 * Fix journal entries saved with broken entry numbers (JV-undefined).
 */
const repairJournalEntryNumbers = async (scope = {}) => {
  const tf = getTenantFilter(scope);
  const broken = await JournalEntry.find({
    ...tf,
    $or: [
      { entryNumber: { $regex: /undefined/i } },
      { entryNumber: { $in: [null, ''] } },
      { entryNumber: { $exists: false } },
    ],
  }).sort({ createdAt: 1 });

  let fixed = 0;
  for (const entry of broken) {
    const result = await mongoose.connection.db.collection('_sequences').findOneAndUpdate(
      { _id: `journalEntry_${entry.organizationId}_${entry.branchId || 'default'}` },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: 'after' }
    );
    const seq = Number(result?.seq ?? result?.value?.seq);
    const entryNumber = Number.isFinite(seq) && seq > 0
      ? `JV-${String(seq).padStart(6, '0')}`
      : `JV-${Date.now().toString().slice(-6)}`;
    await JournalEntry.updateOne({ _id: entry._id }, { $set: { entryNumber } });
    fixed += 1;
  }

  return { fixed, total: broken.length };
};

/**
 * Accounts Dashboard — summary for the accounting module home page.
 */
const getAccountsDashboard = async (scope, year) => {
  await ensureSeeded(scope);
  await repairJournalEntryNumbers(scope);
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
      description: e.narration || e.description || '',
      narration: e.narration || e.description || '',
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
 * Find a posting account head by its stable code.
 */
const findAccount = async (scope, code) =>
  AccountHead.findOne({ ...getTenantFilter(scope), code, isGroup: false });

/** Find an account head by code regardless of group/leaf status. */
const findHead = async (scope, code) =>
  AccountHead.findOne({ ...getTenantFilter(scope), code });

// ═══════════════════════════════════════════════════════════════════════════
// ─── Per-Party Subsidiary Accounts (Customers / Suppliers) ────────────────
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ensure a dedicated subsidiary account head exists for a customer or supplier,
 * nested under the Accounts Receivable / Accounts Payable control account.
 * Idempotent — returns the existing head if already linked. The control account
 * becomes a group so balances live on the per-party sub-accounts (no double
 * counting), exactly how professional accounting software keeps a subsidiary
 * ledger under a control account.
 */
const ensurePartyAccount = async (scope, { kind, partyId, name }) => {
  await ensureSeeded(scope);
  const filter = getTenantFilter(scope);
  const isCustomer = kind === 'customer';
  const Model = isCustomer ? Customer : Supplier;
  const parentCode = isCustomer ? ACCOUNT_CODES.ACCOUNTS_RECEIVABLE : ACCOUNT_CODES.ACCOUNTS_PAYABLE;

  const party = partyId ? await Model.findById(partyId) : null;
  if (party && party.accountHeadId) {
    const existing = await AccountHead.findOne({ _id: party.accountHeadId, ...filter });
    if (existing) return existing;
  }

  const parent = await findHead(scope, parentCode);
  if (!parent) return null;

  const childCount = await AccountHead.countDocuments({ ...filter, parentId: parent._id });
  const code = `${parentCode}-${String(childCount + 1).padStart(4, '0')}`;
  const head = await AccountHead.create({
    ...filter,
    code,
    name: name || party?.name || (isCustomer ? 'Customer' : 'Supplier'),
    rootType: parent.rootType,
    balanceType: parent.balanceType,
    parentId: parent._id,
    level: (parent.level || 2) + 1,
    isGroup: false,
    isSystem: false,
    createdBy: scope.createdBy,
  });

  // Promote the control account to a group so it stops being a posting target.
  if (!parent.isGroup) {
    parent.isGroup = true;
    await parent.save();
  }

  if (party) {
    party.accountHeadId = head._id;
    await party.save();
  }
  return head;
};

const ensureCustomerAccount = (scope, customer = {}) =>
  ensurePartyAccount(scope, { kind: 'customer', partyId: customer._id || customer.id, name: customer.name });

const ensureSupplierAccount = (scope, supplier = {}) =>
  ensurePartyAccount(scope, { kind: 'supplier', partyId: supplier._id || supplier.id, name: supplier.name });

/** Resolve the A/R account to post to for a given customer (sub-account or control). */
const getCustomerReceivableAccount = async (scope, customerId) => {
  const valid = customerId && customerId !== 'walk-in' && mongoose.Types.ObjectId.isValid(String(customerId));
  if (valid) {
    const head = await ensurePartyAccount(scope, { kind: 'customer', partyId: customerId });
    if (head) return head;
  }
  return findHead(scope, ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
};

/** Resolve the A/P account to post to for a given supplier (sub-account or control). */
const getSupplierPayableAccount = async (scope, supplierId) => {
  const valid = supplierId && mongoose.Types.ObjectId.isValid(String(supplierId));
  if (valid) {
    const head = await ensurePartyAccount(scope, { kind: 'supplier', partyId: supplierId });
    if (head) return head;
  }
  return findHead(scope, ACCOUNT_CODES.ACCOUNTS_PAYABLE);
};

/**
 * Ensure the "Wallets (Bank & Cash)" group account exists, creating it lazily
 * under Assets for organizations whose chart was seeded before this group
 * existed (upgrade path — mirrors syncMobileShopAccounts).
 */
const ensureWalletGroupAccount = async (scope) => {
  const filter = getTenantFilter(scope);
  const existing = await findHead(scope, ACCOUNT_CODES.WALLET_GROUP);
  if (existing) return existing;

  const assetsRoot = await AccountHead.findOne({ ...filter, code: '1000' });
  if (!assetsRoot) return null;

  return AccountHead.create({
    ...filter,
    code: ACCOUNT_CODES.WALLET_GROUP,
    name: 'Wallets (Bank & Cash)',
    rootType: assetsRoot.rootType,
    balanceType: assetsRoot.balanceType,
    parentId: assetsRoot._id,
    level: 1,
    isGroup: true,
    isSystem: true,
    createdBy: scope.createdBy,
  });
};

/**
 * Ensure a generic bank/cash wallet has a dedicated ledger account nested
 * under the Wallets group, so its transactions post real double-entry lines
 * instead of collapsing into the generic Cash account. Works for ANY business
 * type. JazzCash/EasyPaisa wallets keep using their stable system codes
 * (1104/1105) and don't need one of these. Idempotent — reuses
 * wallet.accountHeadId once created.
 */
const ensureWalletAccount = async (scope, wallet) => {
  if (!wallet) return null;
  const name = String(wallet.type || '').trim().toLowerCase();
  if (name.includes('jazz') || name.includes('easy')) return null;

  await ensureSeeded(scope);
  const filter = getTenantFilter(scope);

  if (wallet.accountHeadId) {
    const existing = await AccountHead.findOne({ _id: wallet.accountHeadId, ...filter });
    if (existing) return existing;
  }

  const group = await ensureWalletGroupAccount(scope);
  if (!group) return null;

  const childCount = await AccountHead.countDocuments({ ...filter, parentId: group._id });
  const head = await AccountHead.create({
    ...filter,
    code: `${ACCOUNT_CODES.WALLET_GROUP}-${String(childCount + 1).padStart(4, '0')}`,
    name: wallet.type,
    rootType: group.rootType,
    balanceType: group.balanceType,
    parentId: group._id,
    level: (group.level || 1) + 1,
    isGroup: false,
    isSystem: false,
    openingBalance: wallet.balance || 0,
    currentBalance: wallet.balance || 0,
    createdBy: scope.createdBy,
  });

  await Wallet.findByIdAndUpdate(wallet._id, { accountHeadId: head._id });
  return head;
};

/** Resolve the ledger account for a named wallet (by type), creating it on first use. */
const getWalletAccount = async (scope, walletTypeName) => {
  const name = String(walletTypeName || '').trim();
  if (!name) return null;
  const wallet = await Wallet.findOne({ ...getTenantFilter(scope), type: name });
  if (!wallet) return null;
  return ensureWalletAccount(scope, wallet);
};

/**
 * Resolve a payment method (+ optional wallet type) to a Cash/Bank/Wallet
 * account head. Understands the many payment-method spellings used across the
 * app (cash, bank, bank transfer, card, cheque, jazzcash, easypaisa, wallet…).
 */
const resolvePaymentAccount = async (scope, paymentMethod, walletType) => {
  const pm = String(paymentMethod || 'cash').trim().toLowerCase();
  const wt = String(walletType || '').trim().toLowerCase();
  const combined = `${pm} ${wt}`;

  // Mobile wallets (stable system accounts)
  if (combined.includes('jazz')) return findAccount(scope, ACCOUNT_CODES.WALLET_JAZZCASH);
  if (combined.includes('easy')) return findAccount(scope, ACCOUNT_CODES.WALLET_EASYPAISA);

  // Generic named wallet (bank account / cash-in-hand wallet, any business type)
  if (wt) {
    const walletAccount = await getWalletAccount(scope, walletType);
    if (walletAccount) return walletAccount;
  }

  // Bank-like methods
  if (['bank', 'bank_transfer', 'bank transfer', 'card', 'cheque', 'check', 'online'].includes(pm)) {
    const bankHead = await findAccount(scope, ACCOUNT_CODES.BANK);
    if (bankHead) return bankHead;
    const bankAccount = await BankAccount.findOne({ ...getTenantFilter(scope), accountType: 'bank', isActive: true });
    if (bankAccount) return AccountHead.findById(bankAccount.accountHeadId);
  }

  // Default: Cash in Hand
  return findAccount(scope, ACCOUNT_CODES.CASH);
};

// ═══════════════════════════════════════════════════════════════════════════
// ─── Auto-Post Helpers (Retail / General Business) ────────────────────────
// ═══════════════════════════════════════════════════════════════════════════

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Replace any existing posted journal entries for a source document, then post
 * fresh ones. Keeps accounting in sync when a document is edited, and avoids
 * double-counting. Reversing the old entries also unwinds account balances.
 */
const repostForReference = async (scope, referenceModel, referenceId, entryType, buildLines) => {
  await ensureSeeded(scope);
  // Remove previous entries of this type for this reference (reverse to unwind
  // balances). Scoping by entryType lets a single source document hold several
  // independent entries (e.g. an Invoice has both SALE and COGS entries).
  const existing = await JournalEntry.find({
    ...getTenantFilter(scope),
    referenceModel,
    referenceId,
    entryType,
    status: 'posted',
    reversalOf: null, // never re-reverse a reversal entry
  });
  for (const entry of existing) {
    // eslint-disable-next-line no-await-in-loop
    await reverseJournalEntry(entry._id, scope).catch(() => {});
  }

  const built = await buildLines();
  if (!built) return null;
  const { lines, narration, date } = built;
  const clean = lines.filter((l) => round2(l.debit) > 0 || round2(l.credit) > 0);
  if (clean.length < 2) return null;

  return createJournalEntry(
    { date: date || new Date(), entryType, lines: clean, narration, referenceId, referenceModel },
    scope
  );
};

/**
 * Sales invoice → revenue recognition + (optionally) cost of goods sold.
 *   Dr Cash/Bank/Wallet (amount paid)
 *   Dr Accounts Receivable (unpaid balance)
 *       Cr Sales Revenue (net of tax)
 *       Cr Tax Payable (sales tax)
 * Plus, when cost is known:
 *   Dr Cost of Goods Sold      Cr Inventory
 */
const postSaleInvoice = async (scope, invoice) => {
  if (!invoice) return null;
  return repostForReference(scope, 'Invoice', invoice._id, 'SALE', async () => {
    const total = round2(invoice.total);
    if (total <= 0) return null;
    const tax = round2(invoice.tax);
    const paid = round2(invoice.paidAmount);
    const balance = round2(invoice.balance != null ? invoice.balance : total - paid);
    const revenue = round2(total - tax);

    const [payAcc, arAcc, salesAcc, taxAcc] = await Promise.all([
      resolvePaymentAccount(scope, invoice.paymentMethod, invoice.walletType),
      getCustomerReceivableAccount(scope, invoice.customerId),
      findAccount(scope, ACCOUNT_CODES.SALES_REVENUE),
      findAccount(scope, ACCOUNT_CODES.TAX_PAYABLE),
    ]);
    if (!payAcc || !salesAcc) return null;

    const lines = [];
    if (paid > 0) lines.push({ accountId: payAcc._id, debit: paid, credit: 0, description: 'Amount received' });
    if (balance > 0 && arAcc) lines.push({ accountId: arAcc._id, debit: balance, credit: 0, description: 'On account (receivable)' });
    lines.push({ accountId: salesAcc._id, debit: 0, credit: revenue, description: 'Sales revenue' });
    if (tax > 0 && taxAcc) lines.push({ accountId: taxAcc._id, debit: 0, credit: tax, description: 'Sales tax' });

    return {
      date: invoice.createdAt || new Date(),
      narration: `Sale ${invoice.invoiceNumber || ''}`.trim(),
      lines,
    };
  });
};

/**
 * Cost of goods sold for a sale (separate entry so revenue & cost are clear).
 */
const postSaleCogs = async (scope, invoice) => {
  if (!invoice) return null;
  const cost = round2(invoice.totalCost);
  if (cost <= 0) return null;
  return repostForReference(scope, 'Invoice', invoice._id, 'COGS', async () => {
    const [cogsAcc, invAcc] = await Promise.all([
      findAccount(scope, ACCOUNT_CODES.COGS),
      findAccount(scope, ACCOUNT_CODES.INVENTORY),
    ]);
    if (!cogsAcc || !invAcc) return null;
    return {
      date: invoice.createdAt || new Date(),
      narration: `Cost of sale ${invoice.invoiceNumber || ''}`.trim(),
      lines: [
        { accountId: cogsAcc._id, debit: cost, credit: 0, description: 'Cost of goods sold' },
        { accountId: invAcc._id, debit: 0, credit: cost, description: 'Inventory reduction' },
      ],
    };
  });
};

/**
 * Purchase → inventory in, cash/payable out.
 *   Dr Inventory (total)
 *       Cr Cash/Bank/Wallet (amount paid)
 *       Cr Accounts Payable (unpaid balance)
 */
const postPurchase = async (scope, purchase) => {
  if (!purchase) return null;
  return repostForReference(scope, 'Purchase', purchase._id, 'PURCHASE', async () => {
    const total = round2(purchase.totalAmount);
    if (total <= 0) return null;
    const paid = round2(purchase.paidAmount);
    const balance = round2(purchase.balance != null ? purchase.balance : total - paid);

    const [invAcc, payAcc, apAcc] = await Promise.all([
      findAccount(scope, ACCOUNT_CODES.INVENTORY),
      resolvePaymentAccount(scope, purchase.paymentType || purchase.paymentMethod, purchase.walletType),
      getSupplierPayableAccount(scope, purchase.supplier),
    ]);
    if (!invAcc) return null;

    const lines = [{ accountId: invAcc._id, debit: total, credit: 0, description: 'Inventory purchased' }];
    if (paid > 0 && payAcc) lines.push({ accountId: payAcc._id, debit: 0, credit: paid, description: 'Amount paid' });
    if (balance > 0 && apAcc) lines.push({ accountId: apAcc._id, debit: 0, credit: balance, description: 'On account (payable)' });

    return {
      date: purchase.createdAt || new Date(),
      narration: `Purchase ${purchase.invoiceNumber || purchase.referenceNumber || ''}`.trim(),
      lines,
    };
  });
};

/**
 * Customer payment received against their account (receivable settled).
 *   Dr Cash/Bank/Wallet      Cr Accounts Receivable
 */
const postCustomerPayment = async (scope, { amount, paymentMethod, walletType, ledgerId, customerId, description, date }) => {
  if (!ledgerId) return null;
  return repostForReference(scope, 'CustomerLedger', ledgerId, 'PAYMENT_IN', async () => {
    const amt = round2(amount);
    if (amt <= 0) return null;
    const [payAcc, arAcc] = await Promise.all([
      resolvePaymentAccount(scope, paymentMethod, walletType),
      getCustomerReceivableAccount(scope, customerId),
    ]);
    if (!payAcc || !arAcc) return null;
    return {
      date: date || new Date(),
      narration: description || 'Customer payment received',
      lines: [
        { accountId: payAcc._id, debit: amt, credit: 0, description: 'Payment received' },
        { accountId: arAcc._id, debit: 0, credit: amt, description: 'Receivable settled' },
      ],
    };
  });
};

/**
 * Supplier payment made against their account (payable settled).
 *   Dr Accounts Payable      Cr Cash/Bank/Wallet
 */
const postSupplierPayment = async (scope, { amount, paymentMethod, walletType, ledgerId, supplierId, description, date }) => {
  if (!ledgerId) return null;
  return repostForReference(scope, 'SupplierLedger', ledgerId, 'PAYMENT_OUT', async () => {
    const amt = round2(amount);
    if (amt <= 0) return null;
    const [payAcc, apAcc] = await Promise.all([
      resolvePaymentAccount(scope, paymentMethod, walletType),
      getSupplierPayableAccount(scope, supplierId),
    ]);
    if (!payAcc || !apAcc) return null;
    return {
      date: date || new Date(),
      narration: description || 'Supplier payment made',
      lines: [
        { accountId: apAcc._id, debit: amt, credit: 0, description: 'Payable settled' },
        { accountId: payAcc._id, debit: 0, credit: amt, description: 'Payment made' },
      ],
    };
  });
};

/**
 * General (non-school) expense.
 *   Dr Expense account      Cr Cash/Bank/Wallet
 */
const postGeneralExpense = async (scope, { amount, paymentMethod, walletType, expenseAccountCode, expenseId, description, date }) => {
  if (!expenseId) return postExpenseAdHoc(scope, { amount, paymentMethod, walletType, expenseAccountCode, description, date });
  return repostForReference(scope, 'Expense', expenseId, 'EXPENSE', async () => {
    const amt = round2(amount);
    if (amt <= 0) return null;
    const [expAcc, payAcc] = await Promise.all([
      findAccount(scope, expenseAccountCode || ACCOUNT_CODES.MISC_EXPENSE),
      resolvePaymentAccount(scope, paymentMethod, walletType),
    ]);
    if (!expAcc || !payAcc) return null;
    return {
      date: date || new Date(),
      narration: description || 'Expense',
      lines: [
        { accountId: expAcc._id, debit: amt, credit: 0, description: 'Expense' },
        { accountId: payAcc._id, debit: 0, credit: amt, description: 'Paid' },
      ],
    };
  });
};

const postExpenseAdHoc = async (scope, { amount, paymentMethod, walletType, expenseAccountCode, description, date }) => {
  await ensureSeeded(scope);
  const amt = round2(amount);
  if (amt <= 0) return null;
  const [expAcc, payAcc] = await Promise.all([
    findAccount(scope, expenseAccountCode || ACCOUNT_CODES.MISC_EXPENSE),
    resolvePaymentAccount(scope, paymentMethod, walletType),
  ]);
  if (!expAcc || !payAcc) return null;
  return createJournalEntry(
    {
      date: date || new Date(),
      entryType: 'EXPENSE',
      lines: [
        { accountId: expAcc._id, debit: amt, credit: 0, description: 'Expense' },
        { accountId: payAcc._id, debit: 0, credit: amt, description: 'Paid' },
      ],
      narration: description || 'Expense',
    },
    scope
  );
};

/**
 * Sales return / refund.
 *   Dr Sales Revenue (contra)      Cr Cash/Bank (refund) or Accounts Receivable (adjustment)
 */
const postSalesReturn = async (scope, salesReturn) => {
  if (!salesReturn) return null;
  return repostForReference(scope, 'SalesReturn', salesReturn._id, 'SALES_RETURN', async () => {
    const amt = round2(salesReturn.totalAmount);
    if (amt <= 0) return null;
    const isAdjustment = salesReturn.refundMethod === 'adjustment';
    const [salesAcc, creditAcc] = await Promise.all([
      findAccount(scope, ACCOUNT_CODES.SALES_REVENUE),
      isAdjustment
        ? getCustomerReceivableAccount(scope, salesReturn.customerId)
        : resolvePaymentAccount(scope, salesReturn.refundMethod),
    ]);
    if (!salesAcc || !creditAcc) return null;
    return {
      date: salesReturn.createdAt || new Date(),
      narration: `Sales return ${salesReturn.returnNumber || ''}`.trim(),
      lines: [
        { accountId: salesAcc._id, debit: amt, credit: 0, description: 'Sales return' },
        { accountId: creditAcc._id, debit: 0, credit: amt, description: isAdjustment ? 'Receivable reduced' : 'Refund paid' },
      ],
    };
  });
};

/**
 * Purchase return.
 *   Dr Cash/Bank (refund) or Accounts Payable (adjustment)      Cr Inventory
 */
const postPurchaseReturn = async (scope, purchaseReturn) => {
  if (!purchaseReturn) return null;
  return repostForReference(scope, 'PurchaseReturn', purchaseReturn._id, 'PURCHASE_RETURN', async () => {
    const amt = round2(purchaseReturn.totalAmount);
    if (amt <= 0) return null;
    const isAdjustment = purchaseReturn.refundMethod === 'adjustment';
    const [invAcc, debitAcc] = await Promise.all([
      findAccount(scope, ACCOUNT_CODES.INVENTORY),
      isAdjustment
        ? getSupplierPayableAccount(scope, purchaseReturn.supplierId)
        : resolvePaymentAccount(scope, purchaseReturn.refundMethod),
    ]);
    if (!invAcc || !debitAcc) return null;
    return {
      date: purchaseReturn.createdAt || new Date(),
      narration: `Purchase return ${purchaseReturn.returnNumber || ''}`.trim(),
      lines: [
        { accountId: debitAcc._id, debit: amt, credit: 0, description: isAdjustment ? 'Payable reduced' : 'Refund received' },
        { accountId: invAcc._id, debit: 0, credit: amt, description: 'Inventory returned' },
      ],
    };
  });
};

/**
 * Remove posted journal entries for a deleted source document (reverses them
 * so account balances unwind).
 */
const removePostingsForReference = async (scope, referenceModel, referenceId) => {
  const existing = await JournalEntry.find({
    ...getTenantFilter(scope),
    referenceModel,
    referenceId,
    status: 'posted',
    reversalOf: null, // never re-reverse a reversal entry
  });
  for (const entry of existing) {
    // eslint-disable-next-line no-await-in-loop
    await reverseJournalEntry(entry._id, scope).catch(() => {});
  }
  return existing.length;
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
  ensureSeeded,
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
  clearAllAccountingData,
  repairJournalEntryNumbers,
  // Auto-post (school)
  postFeePayment,
  postExpense,
  postSalaryPayment,
  postAdvancePayment,
  // Per-party subsidiary accounts
  ensureCustomerAccount,
  ensureSupplierAccount,
  getCustomerReceivableAccount,
  getSupplierPayableAccount,
  // Wallet ledger accounts
  ensureWalletAccount,
  getWalletAccount,
  resolvePaymentAccount,
  // Auto-post (retail / general)
  postSaleInvoice,
  postSaleCogs,
  postPurchase,
  postCustomerPayment,
  postSupplierPayment,
  postGeneralExpense,
  postSalesReturn,
  postPurchaseReturn,
  removePostingsForReference,
  // Utility
  getFinancialYear,
};
