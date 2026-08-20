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
    id: 'imei_tracking',
    label: 'IMEI / Serial Tracking',
    permissions: ['viewImeiTracking', 'manageImeiTracking'],
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
    id: 'brands',
    label: 'Brands',
    permissions: ['viewBrands', 'createBrands', 'editBrands', 'deleteBrands'],
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
    id: 'payment_vouchers',
    label: 'Payments & Receipts',
    permissions: ['viewPaymentVouchers', 'managePaymentVouchers'],
  },
  {
    id: 'bank_reconciliation',
    label: 'Bank Reconciliation',
    permissions: ['viewBankReconciliation', 'manageBankReconciliation'],
  },
  {
    id: 'accounts_system',
    label: 'Accounts System',
    permissions: ['viewAccountsSystem', 'manageAccountsSystem'],
  },
  {
    id: 'communication_log',
    label: 'Communication Log',
    permissions: ['viewCommunicationLog', 'createCommunicationLog', 'editCommunicationLog', 'deleteCommunicationLog'],
  },
  {
    id: 'reminders',
    label: 'Tasks & Reminders',
    permissions: ['viewReminders', 'createReminders', 'editReminders', 'deleteReminders'],
  },
  {
    id: 'leads',
    label: 'CRM Leads',
    permissions: ['viewLeads', 'viewAllLeads', 'createLeads', 'editLeads', 'deleteLeads', 'convertLeads'],
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
    id: 'used_phones',
    label: 'Mobile Shop — Used Phones',
    permissions: ['viewUsedPhones', 'buyUsedPhones', 'editUsedPhones', 'sellUsedPhones', 'deleteUsedPhones'],
  },
  {
    id: 'new_phones',
    label: 'Mobile Shop — New Phones',
    permissions: ['viewNewPhones', 'buyNewPhones', 'editNewPhones', 'sellNewPhones', 'deleteNewPhones'],
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
    id: 'hr_designations',
    label: 'HR — Designations',
    permissions: ['getDesignations', 'createDesignations', 'manageDesignations', 'deleteDesignations'],
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
  {
    id: 'audit_logs',
    label: 'Audit Logs',
    permissions: ['viewAuditLogs', 'viewCreatedBy'],
  },
  {
    id: 'salesmen',
    label: 'Salesmen',
    permissions: ['viewSalesmen', 'createSalesmen', 'editSalesmen', 'deleteSalesmen'],
  },
  {
    id: 'commission_rules',
    label: 'Commission Rules',
    permissions: ['viewCommissionRules', 'manageCommissionRules'],
  },
  {
    id: 'commission_ledger',
    label: 'Commission Ledger',
    permissions: ['viewCommissionLedger', 'manageCommissionPayments'],
  },
  {
    id: 'partners',
    label: 'Partners & Investors',
    permissions: ['viewPartners', 'createPartners', 'editPartners', 'deletePartners'],
  },
  {
    id: 'partner_profit_share_rules',
    label: 'Partner Profit-Share Rules',
    permissions: ['viewPartnerProfitShareRules', 'managePartnerProfitShareRules'],
  },
  {
    id: 'partner_profit_share_ledger',
    label: 'Partner Ledger & Payouts',
    permissions: ['viewPartnerProfitShareLedger', 'managePartnerPayments'],
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp',
    permissions: ['viewWhatsapp', 'manageWhatsapp'],
  },
  {
    id: 'sms',
    label: 'SMS',
    permissions: ['viewSmsLog'],
  },
  {
    id: 'ai_assistant',
    label: 'AI Assistant',
    permissions: ['viewAiAssistant'],
  },
  {
    id: 'insights',
    label: 'Insights',
    permissions: ['viewInsights'],
  },
  {
    id: 'purchase_suggestions',
    label: 'Purchase Suggestions',
    permissions: ['viewPurchaseSuggestions'],
  },
  {
    id: 'barcode',
    label: 'Barcode Generator',
    permissions: ['viewBarcodeGenerator'],
  },
];

const PERMISSION_KEYS = [...new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions))];

const PERMISSION_TAB_GROUPS = {
  business: [
    'products',
    'imei_tracking',
    'invoices',
    'purchases',
    'purchase_orders',
    'sales_returns',
    'purchase_returns',
    'customers',
    'suppliers',
    'categories',
    'brands',
    'accounting',
    'cash',
    'payment_vouchers',
    'bank_reconciliation',
    'accounts_system',
    'leads',
    'communication_log',
    'reminders',
    'whatsapp',
    'sms',
    'ai_assistant',
    'insights',
    'purchase_suggestions',
    'barcode',
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
    'used_phones',
    'new_phones',
  ],
  reports_hr: ['reports', 'hr_employees', 'hr_departments', 'hr_designations', 'hr_attendance', 'hr_leaves', 'hr_payroll', 'hr_performance', 'school_fees'],
  administration: ['users', 'roles', 'branches', 'staff', 'settings', 'dashboard', 'payments', 'audit_logs', 'salesmen', 'commission_rules', 'commission_ledger', 'partners', 'partner_profit_share_rules', 'partner_profit_share_ledger'],
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
