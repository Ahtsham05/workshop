const mongoose = require('mongoose');
const { toJSON, paginate } = require('./plugins');

const permissionSchema = mongoose.Schema({
  // Product Permissions
  viewProducts: { type: Boolean, default: false },
  createProducts: { type: Boolean, default: false },
  editProducts: { type: Boolean, default: false },
  deleteProducts: { type: Boolean, default: false },
  
  // Invoice Permissions
  viewInvoices: { type: Boolean, default: false },
  createInvoices: { type: Boolean, default: false },
  editInvoices: { type: Boolean, default: false },
  deleteInvoices: { type: Boolean, default: false },
  printInvoices: { type: Boolean, default: false },
  
  // Purchase Permissions
  viewPurchases: { type: Boolean, default: false },
  createPurchases: { type: Boolean, default: false },
  editPurchases: { type: Boolean, default: false },
  deletePurchases: { type: Boolean, default: false },
  
  // Customer Permissions
  viewCustomers: { type: Boolean, default: false },
  createCustomers: { type: Boolean, default: false },
  editCustomers: { type: Boolean, default: false },
  deleteCustomers: { type: Boolean, default: false },
  
  // Supplier Permissions
  viewSuppliers: { type: Boolean, default: false },
  createSuppliers: { type: Boolean, default: false },
  editSuppliers: { type: Boolean, default: false },
  deleteSuppliers: { type: Boolean, default: false },
  
  // Category Permissions
  viewCategories: { type: Boolean, default: false },
  createCategories: { type: Boolean, default: false },
  editCategories: { type: Boolean, default: false },
  deleteCategories: { type: Boolean, default: false },
  
  // Report Permissions
  viewReports: { type: Boolean, default: false },
  viewSalesReports: { type: Boolean, default: false },
  viewPurchaseReports: { type: Boolean, default: false },
  viewInventoryReports: { type: Boolean, default: false },
  viewCustomerReports: { type: Boolean, default: false },
  viewSupplierReports: { type: Boolean, default: false },
  viewProductReports: { type: Boolean, default: false },
  exportReports: { type: Boolean, default: false },
  
  // User Management Permissions
  viewUsers: { type: Boolean, default: false },
  createUsers: { type: Boolean, default: false },
  editUsers: { type: Boolean, default: false },
  deleteUsers: { type: Boolean, default: false },
  
  // Role Management Permissions
  viewRoles: { type: Boolean, default: false },
  createRoles: { type: Boolean, default: false },
  editRoles: { type: Boolean, default: false },
  deleteRoles: { type: Boolean, default: false },
  
  // Settings Permissions
  viewSettings: { type: Boolean, default: false },
  editSettings: { type: Boolean, default: false },
  
  // Dashboard Permissions
  viewDashboard: { type: Boolean, default: false },
  
  // Payment Permissions
  viewPayments: { type: Boolean, default: false },
  createPayments: { type: Boolean, default: false },
  editPayments: { type: Boolean, default: false },
  deletePayments: { type: Boolean, default: false },
});

const roleSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    permissions: {
      type: permissionSchema,
      default: () => ({}),
    },
    isSystemRole: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// add plugin that converts mongoose to json
roleSchema.plugin(toJSON);
roleSchema.plugin(paginate);

/**
 * Check if role name is taken
 * @param {string} name - The role's name
 * @param {ObjectId} [excludeRoleId] - The id of the role to be excluded
 * @returns {Promise<boolean>}
 */
roleSchema.statics.isNameTaken = async function (name, excludeRoleId) {
  const role = await this.findOne({ name, _id: { $ne: excludeRoleId } });
  return !!role;
};

/**
 * Get default admin role with all permissions
 * @returns {Object}
 */
roleSchema.statics.getAdminPermissions = function () {
  return {
    // Product Permissions
    viewProducts: true,
    createProducts: true,
    editProducts: true,
    deleteProducts: true,
    
    // Invoice Permissions
    viewInvoices: true,
    createInvoices: true,
    editInvoices: true,
    deleteInvoices: true,
    printInvoices: true,
    
    // Purchase Permissions
    viewPurchases: true,
    createPurchases: true,
    editPurchases: true,
    deletePurchases: true,
    
    // Customer Permissions
    viewCustomers: true,
    createCustomers: true,
    editCustomers: true,
    deleteCustomers: true,
    
    // Supplier Permissions
    viewSuppliers: true,
    createSuppliers: true,
    editSuppliers: true,
    deleteSuppliers: true,
    
    // Category Permissions
    viewCategories: true,
    createCategories: true,
    editCategories: true,
    deleteCategories: true,
    
    // Report Permissions
    viewReports: true,
    viewSalesReports: true,
    viewPurchaseReports: true,
    viewInventoryReports: true,
    viewCustomerReports: true,
    viewSupplierReports: true,
    viewProductReports: true,
    exportReports: true,
    
    // User Management Permissions
    viewUsers: true,
    createUsers: true,
    editUsers: true,
    deleteUsers: true,
    
    // Role Management Permissions
    viewRoles: true,
    createRoles: true,
    editRoles: true,
    deleteRoles: true,
    
    // Settings Permissions
    viewSettings: true,
    editSettings: true,
    
    // Dashboard Permissions
    viewDashboard: true,
    
    // Payment Permissions
    viewPayments: true,
    createPayments: true,
    editPayments: true,
    deletePayments: true,
  };
};

/**
 * @typedef Role
 */
const Role = mongoose.model('Role', roleSchema);

module.exports = Role;
