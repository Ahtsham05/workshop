const httpStatus = require('http-status');
const ApiError = require('../utils/ApiError');
const CustomerAccountType = require('../models/customerAccountType.model');

const DEFAULT_ACCOUNT_TYPES = [
  { name: 'JazzCash', slug: 'jazzcash', color: '#ef4444' },
  { name: 'EasyPaisa', slug: 'easypaisa', color: '#10b981' },
  { name: 'Bank', slug: 'bank', color: '#3b82f6' },
  { name: 'Other', slug: 'other', color: '#94a3b8' },
];

const slugify = (name) => {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  return base || 'account';
};

const seedDefaults = async (organizationId, branchId, userId) => {
  const ops = DEFAULT_ACCOUNT_TYPES.map((item) => ({
    updateOne: {
      filter: { organizationId, branchId, slug: item.slug },
      update: {
        $setOnInsert: {
          organizationId,
          branchId,
          name: item.name,
          slug: item.slug,
          color: item.color,
          isDefault: true,
          createdBy: userId,
        },
      },
      upsert: true,
    },
  }));

  await CustomerAccountType.bulkWrite(ops, { ordered: false });
};

const getAccountTypes = async (organizationId, branchId, userId) => {
  await seedDefaults(organizationId, branchId, userId);
  return CustomerAccountType.find({ organizationId, branchId }).sort({ isDefault: -1, name: 1 });
};

const createAccountType = async (data, organizationId, branchId, userId) => {
  const name = String(data.name || '').trim();
  if (!name) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Account type name is required');
  }

  const slug = data.slug ? slugify(data.slug) : slugify(name);

  const exists = await CustomerAccountType.findOne({
    organizationId,
    branchId,
    slug,
  });
  if (exists) {
    throw new ApiError(httpStatus.CONFLICT, `Account type "${name}" already exists`);
  }

  try {
    return await CustomerAccountType.create({
      name,
      slug,
      color: data.color || '#6366f1',
      organizationId,
      branchId,
      createdBy: userId,
    });
  } catch (err) {
    if (err.code === 11000) {
      throw new ApiError(httpStatus.CONFLICT, `Account type "${name}" already exists`);
    }
    throw err;
  }
};

const updateAccountType = async (id, data, organizationId) => {
  const accountType = await CustomerAccountType.findOne({ _id: id, organizationId });
  if (!accountType) throw new ApiError(httpStatus.NOT_FOUND, 'Account type not found');

  const patch = { ...data };
  if (patch.name !== undefined) {
    patch.name = String(patch.name).trim();
    if (!patch.name) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Account type name is required');
    }
  }

  delete patch.slug;

  Object.assign(accountType, patch);
  await accountType.save();
  return accountType;
};

const deleteAccountType = async (id, organizationId) => {
  const accountType = await CustomerAccountType.findOne({ _id: id, organizationId });
  if (!accountType) throw new ApiError(httpStatus.NOT_FOUND, 'Account type not found');
  if (accountType.isDefault) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Default account types cannot be deleted');
  }
  await accountType.deleteOne();
};

module.exports = {
  getAccountTypes,
  createAccountType,
  updateAccountType,
  deleteAccountType,
  seedDefaults,
  slugify,
};
