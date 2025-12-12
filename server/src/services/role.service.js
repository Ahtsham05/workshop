const httpStatus = require('http-status');
const { Role } = require('../models');
const ApiError = require('../utils/ApiError');

/**
 * Create a role
 * @param {Object} roleBody
 * @returns {Promise<Role>}
 */
const createRole = async (roleBody) => {
  if (await Role.isNameTaken(roleBody.name)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Role name already taken');
  }
  return Role.create(roleBody);
};

/**
 * Query for roles
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryRoles = async (filter, options) => {
  const roles = await Role.paginate(filter, options);
  return roles;
};

/**
 * Get role by id
 * @param {ObjectId} id
 * @returns {Promise<Role>}
 */
const getRoleById = async (id) => {
  return Role.findById(id);
};

/**
 * Get role by name
 * @param {string} name
 * @returns {Promise<Role>}
 */
const getRoleByName = async (name) => {
  return Role.findOne({ name });
};

/**
 * Update role by id
 * @param {ObjectId} roleId
 * @param {Object} updateBody
 * @returns {Promise<Role>}
 */
const updateRoleById = async (roleId, updateBody) => {
  const role = await getRoleById(roleId);
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  if (role.isSystemRole) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot modify system roles');
  }
  if (updateBody.name && (await Role.isNameTaken(updateBody.name, roleId))) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Role name already taken');
  }
  Object.assign(role, updateBody);
  await role.save();
  return role;
};

/**
 * Delete role by id
 * @param {ObjectId} roleId
 * @returns {Promise<Role>}
 */
const deleteRoleById = async (roleId) => {
  const role = await getRoleById(roleId);
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
  await role.remove();
  return role;
};

/**
 * Update role permissions
 * @param {ObjectId} roleId
 * @param {Object} permissions
 * @returns {Promise<Role>}
 */
const updateRolePermissions = async (roleId, permissions) => {
  const role = await getRoleById(roleId);
  if (!role) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Role not found');
  }
  if (role.isSystemRole) {
    throw new ApiError(httpStatus.FORBIDDEN, 'Cannot modify permissions of system roles');
  }
  role.permissions = { ...role.permissions.toObject(), ...permissions };
  await role.save();
  return role;
};

/**
 * Create default roles
 * @returns {Promise<void>}
 */
const createDefaultRoles = async () => {
  // Create Admin role if not exists
  const adminRole = await getRoleByName('Admin');
  if (!adminRole) {
    await Role.create({
      name: 'Admin',
      description: 'Full system access with all permissions',
      permissions: Role.getAdminPermissions(),
      isSystemRole: true,
      isActive: true,
    });
  }

  // Create Manager role if not exists
  const managerRole = await getRoleByName('Manager');
  if (!managerRole) {
    await Role.create({
      name: 'Manager',
      description: 'Can manage products, invoices, purchases, and view reports',
      permissions: {
        viewProducts: true,
        createProducts: true,
        editProducts: true,
        deleteProducts: true,
        viewInvoices: true,
        createInvoices: true,
        editInvoices: true,
        printInvoices: true,
        viewPurchases: true,
        createPurchases: true,
        editPurchases: true,
        viewCustomers: true,
        createCustomers: true,
        editCustomers: true,
        viewSuppliers: true,
        createSuppliers: true,
        editSuppliers: true,
        viewCategories: true,
        createCategories: true,
        editCategories: true,
        viewReports: true,
        viewSalesReports: true,
        viewPurchaseReports: true,
        viewInventoryReports: true,
        viewDashboard: true,
      },
      isSystemRole: true,
      isActive: true,
    });
  }

  // Create Cashier role if not exists
  const cashierRole = await getRoleByName('Cashier');
  if (!cashierRole) {
    await Role.create({
      name: 'Cashier',
      description: 'Can create invoices and view products',
      permissions: {
        viewProducts: true,
        viewInvoices: true,
        createInvoices: true,
        printInvoices: true,
        viewCustomers: true,
        createCustomers: true,
        viewDashboard: true,
      },
      isSystemRole: true,
      isActive: true,
    });
  }

  // Create Viewer role if not exists
  const viewerRole = await getRoleByName('Viewer');
  if (!viewerRole) {
    await Role.create({
      name: 'Viewer',
      description: 'Read-only access to view data',
      permissions: {
        viewProducts: true,
        viewInvoices: true,
        viewPurchases: true,
        viewCustomers: true,
        viewSuppliers: true,
        viewCategories: true,
        viewReports: true,
        viewSalesReports: true,
        viewPurchaseReports: true,
        viewInventoryReports: true,
        viewDashboard: true,
      },
      isSystemRole: true,
      isActive: true,
    });
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
