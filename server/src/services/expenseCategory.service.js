const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const ExpenseCategory = require('../models/expenseCategory.model');

const DEFAULT_CATEGORIES = [
  { name: 'Rent',           color: '#3b82f6' },
  { name: 'Utilities',      color: '#f59e0b' },
  { name: 'Salaries',       color: '#10b981' },
  { name: 'Transportation', color: '#6366f1' },
  { name: 'Marketing',      color: '#ec4899' },
  { name: 'Supplies',       color: '#14b8a6' },
  { name: 'Maintenance',    color: '#f97316' },
  { name: 'Insurance',      color: '#8b5cf6' },
  { name: 'Tax',            color: '#ef4444' },
  { name: 'Other',          color: '#94a3b8' },
];

/**
 * Seed default categories for a branch if none exist yet.
 */
const seedDefaults = async (organizationId, branchId, userId) => {
  const existing = await ExpenseCategory.countDocuments({ organizationId, branchId });
  if (existing > 0) return;

  await ExpenseCategory.insertMany(
    DEFAULT_CATEGORIES.map((c) => ({
      organizationId,
      branchId,
      name: c.name,
      color: c.color,
      isDefault: true,
      createdBy: userId,
    })),
  );
};

const getCategories = async (organizationId, branchId, userId) => {
  await seedDefaults(organizationId, branchId, userId);
  return ExpenseCategory.find({ organizationId, branchId }).sort({ name: 1 }).lean();
};

const createCategory = async (data, organizationId, branchId, userId) => {
  const exists = await ExpenseCategory.findOne({
    organizationId,
    branchId,
    name: { $regex: `^${data.name.trim()}$`, $options: 'i' },
  });
  if (exists) {
    throw new ApiError(httpStatus.CONFLICT, `Category "${data.name}" already exists`);
  }
  return ExpenseCategory.create({
    ...data,
    organizationId,
    branchId,
    createdBy: userId,
  });
};

const updateCategory = async (id, data, organizationId) => {
  const cat = await ExpenseCategory.findOne({ _id: id, organizationId });
  if (!cat) throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  Object.assign(cat, data);
  await cat.save();
  return cat;
};

const deleteCategory = async (id, organizationId) => {
  const cat = await ExpenseCategory.findOne({ _id: id, organizationId });
  if (!cat) throw new ApiError(httpStatus.NOT_FOUND, 'Category not found');
  if (cat.isDefault) throw new ApiError(httpStatus.BAD_REQUEST, 'Default categories cannot be deleted');
  await cat.deleteOne();
};

module.exports = { getCategories, createCategory, updateCategory, deleteCategory, seedDefaults };
