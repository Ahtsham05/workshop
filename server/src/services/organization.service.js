const httpStatus = require('http-status');
const {
  Organization,
  Branch,
  Membership,
  User,
  Role,
  Product,
  Invoice,
  Customer,
  Expense,
  Attendance,
  Payroll,
  Leave,
  Purchase,
  Department,
  Category,
  CustomerLedger,
  SupplierLedger,
  Payment,
  Supplier,
  Employee,
  PerformanceReview,
  Shift,
  Designation,
  Voucher,
  GeneralLedger,
  Company,
  Token,
} = require('../models');
const ApiError = require('../utils/ApiError');
const { PLANS } = require('../config/plans');
const { normalizeBusinessType } = require('../config/businessTypes');
const demoDataService = require('./demoData.service');
const logger = require('../config/logger');

/**
 * Setup organization during user onboarding
 * Creates the organization, a default branch, and superAdmin membership
 * @param {ObjectId} userId
 * @param {Object} orgData
 * @returns {Promise<{organization, branch}>}
 */
const setupOrganization = async (userId, orgData) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }
  if (user.onboardingComplete) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Onboarding already completed');
  }

  const organization = await Organization.create({
    ...orgData,
    businessType: normalizeBusinessType(orgData.businessType),
    owner: userId,
    subscription: {
      planType: 'trial',
      status: 'active',
      isTrial: true,
      startDate: new Date(),
      endDate: new Date(Date.now() + PLANS.trial.durationDays * 24 * 60 * 60 * 1000),
      limits: {
        maxBranches: PLANS.trial.maxBranches,
        maxUsers: PLANS.trial.maxUsers,
      },
    },
  });

  // Create the default branch
  const branch = await Branch.create({
    organizationId: organization._id,
    name: `${organization.name} - Main Branch`,
    nameUrdu: orgData.defaultBranchNameUrdu || '',
    location: {
      address: orgData.address,
      city: orgData.city,
      country: orgData.country,
    },
    isDefault: true,
    isActive: true,
  });

  // Create the superAdmin membership for all branches
  await Membership.create({
    userId,
    organizationId: organization._id,
    branchId: branch._id,
    role: 'superAdmin',
    isActive: true,
  });

  // Update user to superAdmin and mark onboarding complete, also assign Admin role for full permissions
  const adminRole = await Role.findOne({ name: 'Admin', isSystemRole: true });
  await User.findByIdAndUpdate(userId, {
    organizationId: organization._id,
    businessType: organization.businessType,
    systemRole: 'superAdmin',
    onboardingComplete: true,
    ...(adminRole && { role: adminRole._id }),
  });

  // Deliberately NOT awaited: seeding ~14 purchases + 32 invoices through the real
  // service layer (each its own multi-step transaction/tax/ledger round trip) can take
  // well over a minute against a remote MongoDB cluster — comfortably past the client's
  // request timeout for this endpoint. Awaiting it here left onboarding stuck: the org
  // was created and onboardingComplete set, but the client never got the response, so it
  // never left the onboarding screen, and a retry then hit the "already completed" guard
  // above. Let it run in the background after the response has gone out instead; a
  // seeding hiccup must never break account creation, so failures are only logged.
  demoDataService
    .seedDemoData({ organizationId: organization._id, branchId: branch._id, userId })
    .catch((err) => {
      logger.error(`Failed to seed demo data for organization ${organization._id}: ${err.message}`);
    });

  return { organization, branch };
};

/**
 * Get organization by ID
 * @param {ObjectId} orgId
 * @returns {Promise<Organization>}
 */
const getOrganizationById = async (orgId) => {
  return Organization.findById(orgId).populate('owner', 'name email');
};

/**
 * Get organization by owner/user
 * @param {ObjectId} userId
 * @returns {Promise<Organization>}
 */
const getOrganizationByUserId = async (userId) => {
  return Organization.findOne({ owner: userId });
};

/**
 * Get organization for any member
 * @param {ObjectId} userId
 * @returns {Promise<Organization>}
 */
const getOrganizationForUser = async (userId) => {
  const user = await User.findById(userId);
  if (!user || !user.organizationId) return null;
  return Organization.findById(user.organizationId);
};

/**
 * Update organization
 * @param {ObjectId} orgId
 * @param {Object} updateBody
 * @returns {Promise<Organization>}
 */
const updateOrganization = async (orgId, updateBody) => {
  const org = await Organization.findById(orgId);
  if (!org) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Organization not found');
  }
  const removeLogo = updateBody.removeLogo === true || updateBody.removeLogo === 'true';
  const normalizedUpdateBody = {
    ...updateBody,
    ...(updateBody.businessType && { businessType: normalizeBusinessType(updateBody.businessType) }),
  };

  if (removeLogo) {
    org.logo = undefined;
    delete normalizedUpdateBody.removeLogo;
    delete normalizedUpdateBody.logo;
  }

  Object.assign(org, normalizedUpdateBody);
  await org.save();

  if (normalizedUpdateBody.businessType) {
    await User.updateMany({ organizationId: org._id }, { businessType: org.businessType });
  }

  return org;
};

/**
 * Delete organization and all related data
 * Cascade deletes: users, branches, memberships, products, invoices, customers, etc.
 * @param {ObjectId} orgId
 * @returns {Promise<Organization>}
 */
const deleteOrganization = async (orgId) => {
  const org = await Organization.findById(orgId);
  if (!org) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Organization not found');
  }

  // Delete all data related to this organization - cascade delete
  const deletionResults = await Promise.all([
    // Core business models
    Product.deleteMany({ organizationId: orgId }),
    Invoice.deleteMany({ organizationId: orgId }),
    Customer.deleteMany({ organizationId: orgId }),
    Supplier.deleteMany({ organizationId: orgId }),
    Expense.deleteMany({ organizationId: orgId }),
    Purchase.deleteMany({ organizationId: orgId }),
    Payment.deleteMany({ organizationId: orgId }),
    Category.deleteMany({ organizationId: orgId }),

    // Ledger models
    CustomerLedger.deleteMany({ organizationId: orgId }),
    SupplierLedger.deleteMany({ organizationId: orgId }),
    GeneralLedger.deleteMany({ organizationId: orgId }),
    Voucher.deleteMany({ organizationId: orgId }),

    // HR models
    Employee.deleteMany({ organizationId: orgId }),
    Department.deleteMany({ organizationId: orgId }),
    Attendance.deleteMany({ organizationId: orgId }),
    Leave.deleteMany({ organizationId: orgId }),
    Payroll.deleteMany({ organizationId: orgId }),
    PerformanceReview.deleteMany({ organizationId: orgId }),
    Shift.deleteMany({ organizationId: orgId }),
    Designation.deleteMany({ organizationId: orgId }),

    // Organization structure models
    Membership.deleteMany({ organizationId: orgId }),
    Branch.deleteMany({ organizationId: orgId }),
  ]);

  // Update users: remove organizationId reference, clear systemRole if they only belonged to this org
  const users = await User.find({ organizationId: orgId });
  for (const user of users) {
    await User.findByIdAndUpdate(user._id, {
      organizationId: null,
      businessType: 'other',
      systemRole: null,
      onboardingComplete: false,
    });
  }

  // Delete the organization itself
  const deletedOrg = await Organization.findByIdAndDelete(orgId);

  return {
    success: true,
    message: `Organization "${org.name}" and all associated data have been permanently deleted`,
    deletedOrganization: deletedOrg,
  };
};

/**
 * Clear all business data for an organization without deleting the org itself.
 * Preserves: Organization, Branches, Users, Memberships, Subscription Payments.
 * Deletes: Products, Invoices, Customers, Suppliers, Expenses, Purchases,
 *          Categories, Ledgers, Vouchers, and all HR records.
 * @param {ObjectId} orgId
 * @returns {Promise<{success, message}>}
 */
const clearOrganizationData = async (orgId) => {
  const org = await Organization.findById(orgId);
  if (!org) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Organization not found');
  }

  await Promise.all([
    // Core business models
    Product.deleteMany({ organizationId: orgId }),
    Invoice.deleteMany({ organizationId: orgId }),
    Customer.deleteMany({ organizationId: orgId }),
    Supplier.deleteMany({ organizationId: orgId }),
    Expense.deleteMany({ organizationId: orgId }),
    Purchase.deleteMany({ organizationId: orgId }),
    Category.deleteMany({ organizationId: orgId }),

    // Ledger models
    CustomerLedger.deleteMany({ organizationId: orgId }),
    SupplierLedger.deleteMany({ organizationId: orgId }),
    GeneralLedger.deleteMany({ organizationId: orgId }),
    Voucher.deleteMany({ organizationId: orgId }),

    // HR models
    Employee.deleteMany({ organizationId: orgId }),
    Department.deleteMany({ organizationId: orgId }),
    Attendance.deleteMany({ organizationId: orgId }),
    Leave.deleteMany({ organizationId: orgId }),
    Payroll.deleteMany({ organizationId: orgId }),
    PerformanceReview.deleteMany({ organizationId: orgId }),
    Shift.deleteMany({ organizationId: orgId }),
    Designation.deleteMany({ organizationId: orgId }),
  ]);

  return {
    success: true,
    message: `All business data for "${org.name}" has been cleared. Organization structure, users, and subscription are preserved.`,
  };
};

/**
 * Self-service reset of a trial org's seeded demo data (Products, Customers, Suppliers,
 * Categories, Invoices, Purchases, Expenses tagged isDemo: true) — wipes it and reseeds a
 * fresh batch. Only permitted while the org is still on a trial subscription; enforced by
 * the caller (organization.controller.js), not here.
 * @param {ObjectId} orgId
 * @returns {Promise<{categories, suppliers, customers, products, purchases, invoices, expenses}>}
 */
const resetDemoData = async (orgId) => {
  const org = await Organization.findById(orgId);
  if (!org) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Organization not found');
  }
  const branch = await Branch.findOne({ organizationId: orgId, isDefault: true });
  if (!branch) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Default branch not found for this organization');
  }
  return demoDataService.resetDemoData({
    organizationId: orgId,
    branchId: branch._id,
    userId: org.owner,
  });
};

module.exports = {
  setupOrganization,
  getOrganizationById,
  getOrganizationByUserId,
  getOrganizationForUser,
  updateOrganization,
  deleteOrganization,
  clearOrganizationData,
  resetDemoData,
  getAllOrganizations,
};

/**
 * Get all organizations (system_admin only)
 * @param {Object} filter
 * @param {Object} options
 * @returns {Promise<QueryResult>}
 */
async function getAllOrganizations(filter = {}, options = {}) {
  return Organization.paginate(filter, {
    ...options,
    populate: 'owner',
  });
}
