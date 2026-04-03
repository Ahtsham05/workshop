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
  const adminRole = await Role.findOne({ name: 'Admin' });
  await User.findByIdAndUpdate(userId, {
    organizationId: organization._id,
    businessType: organization.businessType,
    systemRole: 'superAdmin',
    onboardingComplete: true,
    ...(adminRole && { role: adminRole._id }),
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
  const normalizedUpdateBody = {
    ...updateBody,
    ...(updateBody.businessType && { businessType: normalizeBusinessType(updateBody.businessType) }),
  };

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

module.exports = {
  setupOrganization,
  getOrganizationById,
  getOrganizationByUserId,
  getOrganizationForUser,
  updateOrganization,
  deleteOrganization,
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
