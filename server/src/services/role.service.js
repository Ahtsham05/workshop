const httpStatus = require('http-status');
const { Role } = require('../models');
const ApiError = require('../utils/ApiError');
const {
  sanitizePermissions,
  buildAdminPermissions,
  buildPermissionsPayload,
} = require('../config/permission-registry');

/**
 * Whether a role is visible/usable within a given org+branch scope.
 * System roles are always accessible. Custom roles require a matching organizationId,
 * and if the role has a branchId set, it must match the scope's branchId (unless the
 * scope has no branchId — an org-level view can see every branch's roles).
 * @param {Object} role
 * @param {{organizationId?: string, branchId?: string}} scope
 * @returns {boolean}
 */
const isRoleAccessible = (role, scope = {}) => {
  if (role.isSystemRole) return true;
  if (!scope.organizationId || String(role.organizationId) !== String(scope.organizationId)) return false;
  if (role.branchId && scope.branchId && String(role.branchId) !== String(scope.branchId)) return false;
  return true;
};

/**
 * Mongo filter selecting every role visible within a scope: all system roles, plus the
 * org's own org-wide roles, plus (if a branch is active) that org's roles for this branch.
 * @param {{organizationId?: string, branchId?: string}} scope
 */
const buildTenantFilter = (scope = {}) => {
  const clauses = [{ isSystemRole: true }];
  if (scope.organizationId) {
    clauses.push(
      scope.branchId
        ? { organizationId: scope.organizationId, $or: [{ branchId: null }, { branchId: scope.branchId }] }
        : { organizationId: scope.organizationId }
    );
  }
  return { $or: clauses };
};

/**
 * Create a role
 * @param {Object} roleBody
 * @param {{organizationId: string, branchId?: string}} scope
 * @returns {Promise<Role>}
 */
const createRole = async (roleBody, scope = {}) => {
  if (!scope.organizationId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Organization context is required to create a role');
  }
  const { visibility, ...rest } = roleBody;
  if (visibility === 'branch' && !scope.branchId) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Select a branch to create a branch-specific role');
  }
  const payload = {
    ...rest,
    isSystemRole: false,
    organizationId: scope.organizationId,
    branchId: visibility === 'branch' ? scope.branchId : null,
  };
  if (await Role.isNameTaken(payload.name, { isSystemRole: true })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'A system role with this name already exists');
  }
  if (await Role.isNameTaken(payload.name, { organizationId: payload.organizationId, branchId: payload.branchId })) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Role name already taken');
  }
  if (payload.permissions) {
    payload.permissions = sanitizePermissions(payload.permissions);
  }
  return Role.create(payload);
};

/**
 * Query for roles
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @param {{organizationId?: string, branchId?: string}} scope
 * @returns {Promise<QueryResult>}
 */
const queryRoles = async (filter, options, scope = {}) => {
  const roles = await Role.paginate({ $and: [buildTenantFilter(scope), filter] }, options);
  return roles;
};

/**
 * Get role by id, scoped to the requester's org/branch (system roles always visible)
 * @param {ObjectId} id
 * @param {{organizationId?: string, branchId?: string}} scope
 * @returns {Promise<Role>}
 */
const getRoleById = async (id, scope = {}) => {
  const role = await Role.findById(id);
  if (!role || !isRoleAccessible(role, scope)) {
    return null;
  }
  return role;
};

/**
 * Get a *system* role by name (used to look up built-in defaults like "Admin"/"Manager").
 * Deliberately restricted to system roles so a tenant's identically-named custom role
 * can never be mistaken for the platform default.
 * @param {string} name
 * @returns {Promise<Role>}
 */
const getRoleByName = async (name) => {
  return Role.findOne({ name, isSystemRole: true });
};

/**
 * Update role by id
 * @param {ObjectId} roleId
 * @param {Object} updateBody
 * @param {{organizationId?: string, branchId?: string}} scope
 * @returns {Promise<Role>}
 */
const updateRoleById = async (roleId, updateBody, scope = {}) => {
  const role = await getRoleById(roleId, scope);
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  if (role.isSystemRole) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot modify system roles');
  }
  const { visibility, ...rest } = updateBody;
  if (visibility) {
    if (visibility === 'branch' && !scope.branchId) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Select a branch to scope this role to');
    }
    rest.branchId = visibility === 'branch' ? scope.branchId : null;
  }
  if (rest.name) {
    const nameScope = { organizationId: role.organizationId, branchId: rest.branchId ?? role.branchId };
    if (await Role.isNameTaken(rest.name, { isSystemRole: true })) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'A system role with this name already exists');
    }
    if (await Role.isNameTaken(rest.name, nameScope, roleId)) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'Role name already taken');
    }
  }
  if (rest.permissions) {
    rest.permissions = sanitizePermissions(rest.permissions);
  }
  Object.assign(role, rest);
  await role.save();
  return role;
};

/**
 * Delete role by id
 * @param {ObjectId} roleId
 * @param {{organizationId?: string, branchId?: string}} scope
 * @returns {Promise<Role>}
 */
const deleteRoleById = async (roleId, scope = {}) => {
  const role = await getRoleById(roleId, scope);
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  if (role.isSystemRole) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot delete system roles');
  }
  // Check if any users have this role
  const { User } = require('../models');
  const usersWithRole = await User.countDocuments({ role: roleId });
  if (usersWithRole > 0) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Cannot delete role. ${usersWithRole} user(s) are assigned to this role`);
  }
  await role.deleteOne();
  return role;
};

/**
 * Update role permissions
 * @param {ObjectId} roleId
 * @param {Object} permissions
 * @param {{organizationId?: string, branchId?: string}} scope
 * @returns {Promise<Role>}
 */
const updateRolePermissions = async (roleId, permissions, scope = {}) => {
  const role = await getRoleById(roleId, scope);
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  if (role.isSystemRole) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot modify permissions of system roles');
  }
  role.permissions = buildPermissionsPayload(permissions);
  await role.save();
  return role;
};

/**
 * Create default roles (upsert — safe to run multiple times)
 * @returns {Promise<void>}
 */
const createDefaultRoles = async () => {
  const adminPermissions = buildAdminPermissions();

  const defaultRoles = [
    {
      name: 'Admin',
      description: 'Full system access with all permissions',
      permissions: adminPermissions,
      isSystemRole: true,
      isActive: true,
    },
    {
      name: 'Manager',
      description: 'Can manage products, invoices, purchases, and view reports',
      permissions: {
        viewProducts: true, createProducts: true, editProducts: true, deleteProducts: true,
        viewInvoices: true, createInvoices: true, editInvoices: true, printInvoices: true,
        viewPurchases: true, createPurchases: true, editPurchases: true,
        viewPurchaseOrders: true, createPurchaseOrders: true, editPurchaseOrders: true, receivePurchaseOrders: true,
        viewSalesReturns: true, createSalesReturns: true, editSalesReturns: true,
        viewPurchaseReturns: true, createPurchaseReturns: true, editPurchaseReturns: true,
        viewCustomers: true, createCustomers: true, editCustomers: true, deleteCustomers: true,
        viewSuppliers: true, createSuppliers: true, editSuppliers: true, deleteSuppliers: true,
        viewCategories: true, createCategories: true, editCategories: true, deleteCategories: true,
        viewBrands: true, createBrands: true, editBrands: true, deleteBrands: true,
        viewAccounting: true, manageExpenses: true, manageLedgers: true, managePersonalWallet: true,
        viewCashBook: true, manageCashBook: true, viewCashRegister: true, manageCashRegister: true,
        viewAccountsSystem: true, manageAccountsSystem: true,
        viewWallet: true, manageWallet: true,
        viewLoadManagement: true, manageLoadManagement: true,
        viewSimSales: true, manageSimSales: true,
        viewCashManagement: true, manageCashManagement: true,
        viewRepairs: true, manageRepairs: true,
        viewServices: true, manageServices: true,
        viewBillPayments: true, manageBillPayments: true,
        viewInstallments: true, manageInstallments: true,
        viewImeiTracking: true, manageImeiTracking: true,
        viewReports: true, viewSalesReports: true, viewPurchaseReports: true, viewInventoryReports: true,
        viewExpenseReports: true, viewSimSaleReports: true, viewProfitLossReports: true,
        viewLoadReports: true, viewRepairReports: true, viewServiceReports: true,
        viewWalletReports: true, viewInstallmentReports: true,
        getEmployees: true, createEmployees: true, manageEmployees: true,
        getDepartments: true, createDepartments: true, manageDepartments: true,
        getAttendance: true, createAttendance: true, manageAttendance: true,
        getLeaves: true, createLeaves: true, manageLeaves: true, approveLeaves: true,
        getPayroll: true, createPayroll: true, managePayroll: true, processPayroll: true,
        viewSalesmen: true, createSalesmen: true, editSalesmen: true,
        viewCommissionRules: true, manageCommissionRules: true,
        viewCommissionLedger: true, manageCommissionPayments: true,
        viewCommunicationLog: true, createCommunicationLog: true, editCommunicationLog: true, deleteCommunicationLog: true,
        viewReminders: true, createReminders: true, editReminders: true, deleteReminders: true,
        viewWhatsapp: true, manageWhatsapp: true,
        viewSmsLog: true,
        viewAiAssistant: true,
        viewInsights: true,
        viewPurchaseSuggestions: true,
        viewBarcodeGenerator: true,
        viewDashboard: true,
      },
      isSystemRole: true,
      isActive: true,
    },
    {
      name: 'Cashier',
      description: 'Can create invoices and view products',
      permissions: {
        viewProducts: true,
        viewInvoices: true, createInvoices: true, printInvoices: true,
        viewCustomers: true, createCustomers: true,
        viewDashboard: true,
      },
      isSystemRole: true,
      isActive: true,
    },
    {
      name: 'Viewer',
      description: 'Read-only access to view data',
      permissions: {
        viewProducts: true, viewInvoices: true, viewPurchases: true,
        viewPurchaseOrders: true, viewSalesReturns: true, viewPurchaseReturns: true,
        viewCustomers: true, viewSuppliers: true, viewCategories: true, viewBrands: true,
        viewAccounting: true, viewCashBook: true, viewCashRegister: true, viewAccountsSystem: true,
        viewWallet: true, viewLoadManagement: true, viewSimSales: true, viewCashManagement: true,
        viewRepairs: true, viewServices: true, viewBillPayments: true, viewInstallments: true,
        viewImeiTracking: true,
        viewReports: true, viewSalesReports: true, viewPurchaseReports: true, viewInventoryReports: true,
        viewExpenseReports: true, viewSimSaleReports: true, viewProfitLossReports: true,
        viewLoadReports: true, viewRepairReports: true, viewServiceReports: true,
        viewWalletReports: true, viewInstallmentReports: true,
        getEmployees: true, getDepartments: true, getAttendance: true, getLeaves: true, getPayroll: true,
        viewSalesmen: true,
        viewCommissionRules: true,
        viewCommissionLedger: true,
        viewCommunicationLog: true,
        viewReminders: true,
        viewWhatsapp: true,
        viewSmsLog: true,
        viewBarcodeGenerator: true,
        viewDashboard: true,
      },
      isSystemRole: true,
      isActive: true,
    },
  ];

  for (const roleData of defaultRoles) {
    await Role.findOneAndUpdate(
      { name: roleData.name, isSystemRole: true },
      {
        $set: { permissions: roleData.permissions, isActive: roleData.isActive },
        $setOnInsert: {
          name: roleData.name,
          description: roleData.description,
          isSystemRole: roleData.isSystemRole,
          organizationId: null,
          branchId: null,
        },
      },
      { upsert: true, new: true }
    );
  }
};

module.exports = {
  createRole,
  queryRoles,
  getRoleById,
  getRoleByName,
  updateRoleById,
  deleteRoleById,
  updateRolePermissions,
  createDefaultRoles,
};
