/**
 * Single source of truth for role permission keys and UI groups.
 */
const Joi = require('joi');

const PERMISSION_GROUPS = [
  {
    id: 'products',
    label: 'Products',
    permissions: ['viewProducts', 'createProducts', 'editProducts', 'deleteProducts'],
  },
  {
    id: 'invoices',
    label: 'Invoices',
    permissions: ['viewInvoices', 'createInvoices', 'editInvoices', 'deleteInvoices', 'printInvoices'],
  },
  {
    id: 'purchases',
    label: 'Purchases',
    permissions: ['viewPurchases', 'createPurchases', 'editPurchases', 'deletePurchases'],
  },
  {
    id: 'purchase_orders',
    label: 'Purchase Orders',
    permissions: [
      'viewPurchaseOrders',
      'createPurchaseOrders',
      'editPurchaseOrders',
      'deletePurchaseOrders',
      'receivePurchaseOrders',
    ],
  },
  {
    id: 'sales_returns',
    label: 'Sales Returns',
    permissions: ['viewSalesReturns', 'createSalesReturns', 'editSalesReturns', 'deleteSalesReturns'],
  },
  {
    id: 'purchase_returns',
    label: 'Purchase Returns',
    permissions: ['viewPurchaseReturns', 'createPurchaseReturns', 'editPurchaseReturns', 'deletePurchaseReturns'],
  },
  {
    id: 'customers',
    label: 'Customers',
    permissions: ['viewCustomers', 'createCustomers', 'editCustomers', 'deleteCustomers'],
  },
  {
    id: 'suppliers',
    label: 'Suppliers',
    permissions: ['viewSuppliers', 'createSuppliers', 'editSuppliers', 'deleteSuppliers'],
  },
  {
    id: 'categories',
    label: 'Categories',
    permissions: ['viewCategories', 'createCategories', 'editCategories', 'deleteCategories'],
  },
  {
    id: 'accounting',
    label: 'Accounts & Expenses',
    permissions: ['viewAccounting', 'manageExpenses', 'manageLedgers', 'managePersonalWallet'],
  },
  {
    id: 'cash',
    label: 'Cash Book & Register',
    permissions: ['viewCashBook', 'manageCashBook', 'viewCashRegister', 'manageCashRegister'],
  },
  {
    id: 'accounts_system',
    label: 'Accounts System',
    permissions: ['viewAccountsSystem', 'manageAccountsSystem'],
  },
  {
    id: 'wallet',
    label: 'Mobile Shop — Wallet',
    permissions: ['viewWallet', 'manageWallet'],
  },
  {
    id: 'load',
    label: 'Mobile Shop — Load Management',
    permissions: ['viewLoadManagement', 'manageLoadManagement'],
  },
  {
    id: 'sim_sales',
    label: 'Mobile Shop — Sim Sale',
    permissions: ['viewSimSales', 'manageSimSales'],
  },
  {
    id: 'cash_management',
    label: 'Mobile Shop — Cash Management',
    permissions: ['viewCashManagement', 'manageCashManagement'],
  },
  {
    id: 'repair',
    label: 'Mobile Shop — Repair',
    permissions: ['viewRepairs', 'manageRepairs'],
  },
  {
    id: 'services',
    label: 'Mobile Shop — Services',
    permissions: ['viewServices', 'manageServices'],
  },
  {
    id: 'bill_payments',
    label: 'Mobile Shop — Bill Payments',
    permissions: ['viewBillPayments', 'manageBillPayments'],
  },
  {
    id: 'installments',
    label: 'Mobile Shop — Installments',
    permissions: ['viewInstallments', 'manageInstallments'],
  },
  {
    id: 'imei_tracking',
    label: 'Mobile Shop — IMEI Tracking',
    permissions: ['viewImeiTracking', 'manageImeiTracking'],
  },
  {
    id: 'reports',
    label: 'Reports',
    permissions: [
      'viewReports',
      'viewSalesReports',
      'viewPurchaseReports',
      'viewInventoryReports',
      'viewCustomerReports',
      'viewSupplierReports',
      'viewProductReports',
      'viewExpenseReports',
      'viewSimSaleReports',
      'viewProfitLossReports',
      'viewLoadReports',
      'viewRepairReports',
      'viewServiceReports',
      'viewWalletReports',
      'viewInstallmentReports',
      'exportReports',
    ],
  },
  {
    id: 'hr_employees',
    label: 'HR — Employees',
    permissions: ['getEmployees', 'createEmployees', 'manageEmployees', 'deleteEmployees'],
  },
  {
    id: 'hr_departments',
    label: 'HR — Departments',
    permissions: ['getDepartments', 'createDepartments', 'manageDepartments', 'deleteDepartments'],
  },
  {
    id: 'hr_attendance',
    label: 'HR — Attendance',
    permissions: ['getAttendance', 'createAttendance', 'manageAttendance', 'deleteAttendance'],
  },
  {
    id: 'hr_leaves',
    label: 'HR — Leave Management',
    permissions: ['getLeaves', 'createLeaves', 'manageLeaves', 'approveLeaves', 'rejectLeaves', 'deleteLeaves'],
  },
  {
    id: 'hr_payroll',
    label: 'HR — Payroll',
    permissions: ['getPayroll', 'createPayroll', 'managePayroll', 'processPayroll', 'deletePayroll'],
  },
  {
    id: 'hr_performance',
    label: 'HR — Performance Reviews',
    permissions: [
      'getPerformanceReviews',
      'createPerformanceReviews',
      'managePerformanceReviews',
      'deletePerformanceReviews',
    ],
  },
  {
    id: 'school_fees',
    label: 'School — Fee Accounting',
    permissions: ['viewFeeAccounting', 'manageFeeAccounting'],
  },
  {
    id: 'users',
    label: 'User Management',
    permissions: ['viewUsers', 'createUsers', 'editUsers', 'deleteUsers'],
  },
  {
    id: 'roles',
    label: 'Role Management',
    permissions: ['viewRoles', 'createRoles', 'editRoles', 'deleteRoles'],
  },
  {
    id: 'branches',
    label: 'Branch Management',
    permissions: ['viewBranches', 'manageBranches'],
  },
  {
    id: 'staff',
    label: 'Staff Management',
    permissions: ['viewStaff', 'manageStaff'],
  },
  {
    id: 'settings',
    label: 'Settings',
    permissions: ['viewSettings', 'editSettings'],
  },
  {
    id: 'dashboard',
    label: 'Dashboard',
    permissions: ['viewDashboard'],
  },
  {
    id: 'payments',
    label: 'Payments',
    permissions: ['viewPayments', 'createPayments', 'editPayments', 'deletePayments'],
  },
];

const PERMISSION_KEYS = [...new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions))];

const PERMISSION_TAB_GROUPS = {
  business: [
    'products',
    'invoices',
    'purchases',
    'purchase_orders',
    'sales_returns',
    'purchase_returns',
    'customers',
    'suppliers',
    'categories',
    'accounting',
    'cash',
    'accounts_system',
  ],
  mobile_shop: [
    'wallet',
    'load',
    'sim_sales',
    'cash_management',
    'repair',
    'services',
    'bill_payments',
    'installments',
    'imei_tracking',
  ],
  reports_hr: ['reports', 'hr_employees', 'hr_departments', 'hr_attendance', 'hr_leaves', 'hr_payroll', 'hr_performance', 'school_fees'],
  administration: ['users', 'roles', 'branches', 'staff', 'settings', 'dashboard', 'payments'],
};

const sanitizePermissions = (input = {}) => {
  const sanitized = {};
  for (const key of PERMISSION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      sanitized[key] = Boolean(input[key]);
    }
  }
  return sanitized;
};

/** Full permission map — every key explicit (used when saving role permissions). */
const buildPermissionsPayload = (input = {}) =>
  Object.fromEntries(PERMISSION_KEYS.map((key) => [key, input[key] === true]));

const buildPermissionsState = buildPermissionsPayload;

const buildAdminPermissions = () => Object.fromEntries(PERMISSION_KEYS.map((key) => [key, true]));

const getPermissionSchemaDefinition = () =>
  Object.fromEntries(PERMISSION_KEYS.map((key) => [key, Joi.boolean()]));

module.exports = {
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  PERMISSION_TAB_GROUPS,
  sanitizePermissions,
  buildPermissionsPayload,
  buildPermissionsState,
  buildAdminPermissions,
  getPermissionSchemaDefinition,
};
