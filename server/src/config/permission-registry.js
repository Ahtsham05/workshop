/**
 * Single source of truth for role permission keys and UI groups.
 */
const Joi = require('joi');

const PERMISSION_GROUPS = [
  {
    id: 'products',
    label: 'Products',
    // viewCostPrices: cost / purchase price, stock value, margin and profit wherever they
    // appear outside purchasing documents (stripped from API responses without it).
    permissions: ['viewProducts', 'createProducts', 'editProducts', 'deleteProducts', 'viewCostPrices'],
  },
  {
    // Stock transfers between branches (routes/v1/inventoryTransfer.route.js). Split out of
    // view/editProducts; roles created before the split were backfilled from those keys
    // (role.service.js backfillSplitPermissions).
    id: 'stock_transfers',
    label: 'Stock Transfers',
    permissions: ['viewStockTransfers', 'manageStockTransfers'],
  },
  {
    // Stock adjustments (routes/v1/stockAdjustment.route.js) — same split and backfill.
    id: 'stock_adjustments',
    label: 'Stock Adjustments',
    permissions: ['viewStockAdjustments', 'manageStockAdjustments'],
  },
  {
    // Initial counts, A/B/C cycle counts, surprise audits (routes/v1/stockCount.route.js).
    // Roles with editProducts can already count and approve; these split the two duties.
    id: 'stock_counts',
    label: 'Stock Counts',
    permissions: ['countStock', 'approveStockCounts'],
  },
  {
    id: 'imei_tracking',
    label: 'IMEI / Serial Tracking',
    permissions: ['viewImeiTracking', 'manageImeiTracking'],
  },
  {
    // Warranty claims (routes/v1/warrantyClaim.route.js). Roles with viewProducts /
    // editProducts (or the IMEI ones) already get in; these grant it on its own.
    id: 'warranty_claims',
    label: 'Warranty Claims',
    permissions: ['viewWarrantyClaims', 'manageWarrantyClaims'],
  },
  {
    id: 'price_checker',
    label: 'Price Checker',
    permissions: ['viewPriceChecker', 'managePriceCheckerSources'],
  },
  {
    id: 'price_updates',
    label: 'Price Updates',
    permissions: ['viewPriceUpdates', 'managePriceUpdates'],
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
    permissions: ['viewNewPhones', 'buyNewPhones', 'sellNewPhones', 'deleteNewPhones'],
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
      'viewActivityReports',
      'viewSummaryReports',
      'viewTaxReports',
      'viewTeamReports',
      'viewBillPaymentReports',
      'viewMobilePhoneReports',
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
    // viewBranchPerformance: the org-wide Branch Performance page (was owner-only).
    permissions: ['viewBranches', 'manageBranches', 'viewBranchPerformance'],
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
    id: 'tax_currency_settings',
    label: 'Tax & Currency Settings',
    permissions: [
      'viewBusinessProfile', 'manageBusinessProfile',
      'viewLocalizationSettings', 'manageLocalizationSettings',
      'viewTaxCategories', 'createTaxCategories', 'editTaxCategories', 'deleteTaxCategories',
      'viewTaxRates', 'createTaxRates', 'editTaxRates', 'deleteTaxRates',
      'viewTaxJurisdictions', 'manageTaxJurisdictions',
      'viewTaxExemptions', 'createTaxExemptions', 'editTaxExemptions', 'deleteTaxExemptions',
      'viewExchangeRates', 'createExchangeRates', 'editExchangeRates', 'deleteExchangeRates',
    ],
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
    // API keys that let the shop's own website read its inventory (routes/v1/storefront.route.js).
    id: 'website_connections',
    label: 'Website Connections',
    permissions: ['manageWebsiteConnections'],
  },
  {
    id: 'ai_assistant',
    label: 'AI Assistant',
    permissions: ['viewAiAssistant'],
  },
  {
    // Personal notepad, inter-branch team chat and the floating voice button (open to everyone
    // before these keys; existing roles were backfilled with them — role.service.js SPLIT_PERMISSIONS).
    id: 'workspace',
    label: 'Notes, Team Chat & Voice',
    permissions: ['useNotes', 'useTeamChat', 'useVoiceAssistant'],
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
  {
    // Manufacturing module (routes/v1/manufacturing.route.js).
    id: 'manufacturing',
    label: 'Manufacturing',
    permissions: [
      'viewManufacturing',
      'manageBoms',
      'manageProductionOrders',
      // One key per shop-floor task — split out of executeProduction (backfilled from it).
      'issueMaterials',
      'editMaterialIssues',
      // Issue more material than an order still requires (otherwise blocked).
      'overIssueMaterials',
      // Start / complete routing steps and assembly runs.
      'executeProduction',
      'receiveFinishedGoods',
      'recordScrap',
      // Quality inspection of reported output, and rework results.
      'inspectProduction',
      'manageManufacturingSettings',
      // Costs, values and prices inside Manufacturing — without it a role still runs
      // BOMs, orders, issues and receipts by quantity (middlewares/manufacturingCosts.js).
      'viewManufacturingCosts',
    ],
  },
];

const PERMISSION_KEYS = [...new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions))];

const PERMISSION_TAB_GROUPS = {
  business: [
    'products',
    'stock_transfers',
    'stock_adjustments',
    'stock_counts',
    'imei_tracking',
    'warranty_claims',
    'price_updates',
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
    'website_connections',
    'ai_assistant',
    'insights',
    'purchase_suggestions',
    'barcode',
    'manufacturing',
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
  reports_hr: ['reports', 'hr_employees', 'hr_departments', 'hr_designations', 'hr_attendance', 'hr_leaves', 'hr_payroll', 'school_fees'],
  administration: ['users', 'roles', 'branches', 'staff', 'settings', 'tax_currency_settings', 'dashboard', 'payments', 'audit_logs', 'salesmen', 'commission_rules', 'commission_ledger', 'partners', 'partner_profit_share_rules', 'partner_profit_share_ledger'],
};

/**
 * Keys that are a doorway for other keys: every Manufacturing task (issue materials, BOMs,
 * scrap…) lives behind the Manufacturing menu, pages and read API, which all need
 * viewManufacturing — a role with a task but not the view would see nothing at all.
 * { required: [keys that need it] }. Mirrored in client/src/lib/permission-registry.ts.
 */
const PERMISSION_REQUIRES = {
  viewManufacturing: PERMISSION_GROUPS.find((g) => g.id === 'manufacturing').permissions.filter(
    (key) => key !== 'viewManufacturing'
  ),
};

/** Turns on every key a granted key needs (never turns anything off). */
const applyPermissionRequirements = (permissions) => {
  Object.entries(PERMISSION_REQUIRES).forEach(([required, dependents]) => {
    if (dependents.some((key) => permissions[key] === true)) permissions[required] = true;
  });
  return permissions;
};

const sanitizePermissions = (input = {}) => {
  const sanitized = {};
  for (const key of PERMISSION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      sanitized[key] = Boolean(input[key]);
    }
  }
  return applyPermissionRequirements(sanitized);
};

/** Full permission map — every key explicit (used when saving role permissions). */
const buildPermissionsPayload = (input = {}) =>
  applyPermissionRequirements(Object.fromEntries(PERMISSION_KEYS.map((key) => [key, input[key] === true])));

const buildPermissionsState = buildPermissionsPayload;

const buildAdminPermissions = () => Object.fromEntries(PERMISSION_KEYS.map((key) => [key, true]));

const getPermissionSchemaDefinition = () =>
  Object.fromEntries(PERMISSION_KEYS.map((key) => [key, Joi.boolean()]));

module.exports = {
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  PERMISSION_TAB_GROUPS,
  PERMISSION_REQUIRES,
  applyPermissionRequirements,
  sanitizePermissions,
  buildPermissionsPayload,
  buildPermissionsState,
  buildAdminPermissions,
  getPermissionSchemaDefinition,
};
