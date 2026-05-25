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
  await seedDefaultsForType(organizationId, branchId, userId, type);
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
    name: { $regex: `^${name}$`, $options: 'i' },
  });
  if (exists) {
    throw new ApiError(httpStatus.CONFLICT, `Category "${name}" already exists`);
  }

  try {
    return await ExpenseCategory.create({
      name,
      color: data.color || '#6366f1',
      transactionType,
      organizationId,
      branchId,
      createdBy: userId,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(httpStatus.CONFLICT, `Category "${name}" already exists`);
    }
    throw err;
  }
};

const updateCategory = async (id, data, organizationId) => {
  const cat = await ExpenseCategory.findOne({ _id: id, organizationId });
  if (!cat) throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');

  const patch = { ...data };
  if (patch.transactionType !== undefined) {
    patch.transactionType = normalizeTransactionType(patch.transactionType);
  }
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
        name: { $regex: `^${patch.name}$`, $options: 'i' },
        _id: { $ne: cat._id },
      });
      if (exists) {
        throw new ApiError(httpStatus.CONFLICT, `Category "${patch.name}" already exists`);
      }
    }
  }

  Object.assign(cat, patch);
  await cat.save();
  return cat;
};

const deleteCategory = async (id, organizationId) => {
  const cat = await ExpenseCategory.findOne({ _id: id, organizationId });
  if (!cat) throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  if (cat.isDefault) throw new ApiError(httpStatus.BAD_REQUEST, 'Default categories cannot be deleted');
  await cat.deleteOne();
};

module.exports = {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  seedDefaultsForType,
};
