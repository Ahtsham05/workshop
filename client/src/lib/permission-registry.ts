export type PermissionKey =
  | 'viewProducts' | 'createProducts' | 'editProducts' | 'deleteProducts' | 'viewCostPrices'
  | 'viewStockTransfers' | 'manageStockTransfers'
  | 'viewStockAdjustments' | 'manageStockAdjustments'
  | 'viewInvoices' | 'createInvoices' | 'editInvoices' | 'deleteInvoices' | 'printInvoices'
  | 'viewPurchases' | 'createPurchases' | 'editPurchases' | 'deletePurchases'
  | 'viewPurchaseOrders' | 'createPurchaseOrders' | 'editPurchaseOrders' | 'deletePurchaseOrders' | 'receivePurchaseOrders'
  | 'viewSalesReturns' | 'createSalesReturns' | 'editSalesReturns' | 'deleteSalesReturns'
  | 'viewPurchaseReturns' | 'createPurchaseReturns' | 'editPurchaseReturns' | 'deletePurchaseReturns'
  | 'viewCustomers' | 'createCustomers' | 'editCustomers' | 'deleteCustomers'
  | 'viewSuppliers' | 'createSuppliers' | 'editSuppliers' | 'deleteSuppliers'
  | 'viewCategories' | 'createCategories' | 'editCategories' | 'deleteCategories'
  | 'viewBrands' | 'createBrands' | 'editBrands' | 'deleteBrands'
  | 'viewAccounting' | 'manageExpenses' | 'manageLedgers' | 'managePersonalWallet'
  | 'viewCashBook' | 'manageCashBook' | 'viewCashRegister' | 'manageCashRegister'
  | 'viewPaymentVouchers' | 'managePaymentVouchers'
  | 'viewBankReconciliation' | 'manageBankReconciliation'
  | 'viewAccountsSystem' | 'manageAccountsSystem'
  | 'viewWallet' | 'manageWallet'
  | 'viewLoadManagement' | 'manageLoadManagement'
  | 'viewSimSales' | 'manageSimSales'
  | 'viewCashManagement' | 'manageCashManagement'
  | 'viewRepairs' | 'manageRepairs'
  | 'viewServices' | 'manageServices'
  | 'viewBillPayments' | 'manageBillPayments'
  | 'viewInstallments' | 'manageInstallments'
  | 'viewImeiTracking' | 'manageImeiTracking'
  | 'viewWarrantyClaims' | 'manageWarrantyClaims'
  | 'viewPriceChecker' | 'managePriceCheckerSources'
  | 'viewPriceUpdates' | 'managePriceUpdates'
  | 'viewUsedPhones' | 'buyUsedPhones' | 'editUsedPhones' | 'sellUsedPhones' | 'deleteUsedPhones'
  | 'viewNewPhones' | 'buyNewPhones' | 'sellNewPhones' | 'deleteNewPhones'
  | 'viewReports' | 'viewSalesReports' | 'viewPurchaseReports' | 'viewInventoryReports'
  | 'viewCustomerReports' | 'viewSupplierReports' | 'viewProductReports'
  | 'viewExpenseReports' | 'viewSimSaleReports' | 'viewProfitLossReports'
  | 'viewLoadReports' | 'viewRepairReports' | 'viewServiceReports'
  | 'viewWalletReports' | 'viewInstallmentReports' | 'exportReports'
  | 'viewActivityReports' | 'viewSummaryReports' | 'viewTaxReports' | 'viewTeamReports' | 'viewBillPaymentReports' | 'viewMobilePhoneReports'
  | 'getEmployees' | 'createEmployees' | 'manageEmployees' | 'deleteEmployees'
  | 'getDepartments' | 'createDepartments' | 'manageDepartments' | 'deleteDepartments'
  | 'getDesignations' | 'createDesignations' | 'manageDesignations' | 'deleteDesignations'
  | 'getAttendance' | 'createAttendance' | 'manageAttendance' | 'deleteAttendance'
  | 'getLeaves' | 'createLeaves' | 'manageLeaves' | 'approveLeaves' | 'rejectLeaves' | 'deleteLeaves'
  | 'getPayroll' | 'createPayroll' | 'managePayroll' | 'processPayroll' | 'deletePayroll'
  | 'viewFeeAccounting' | 'manageFeeAccounting'
  | 'viewUsers' | 'createUsers' | 'editUsers' | 'deleteUsers'
  | 'viewRoles' | 'createRoles' | 'editRoles' | 'deleteRoles'
  | 'viewBranches' | 'manageBranches' | 'viewBranchPerformance'
  | 'viewStaff' | 'manageStaff'
  | 'viewSettings' | 'editSettings'
  | 'viewBusinessProfile' | 'manageBusinessProfile'
  | 'viewLocalizationSettings' | 'manageLocalizationSettings'
  | 'viewTaxCategories' | 'createTaxCategories' | 'editTaxCategories' | 'deleteTaxCategories'
  | 'viewTaxRates' | 'createTaxRates' | 'editTaxRates' | 'deleteTaxRates'
  | 'viewTaxJurisdictions' | 'manageTaxJurisdictions'
  | 'viewTaxExemptions' | 'createTaxExemptions' | 'editTaxExemptions' | 'deleteTaxExemptions'
  | 'viewExchangeRates' | 'createExchangeRates' | 'editExchangeRates' | 'deleteExchangeRates'
  | 'viewDashboard'
  | 'viewPayments' | 'createPayments' | 'editPayments' | 'deletePayments'
  | 'viewAuditLogs' | 'viewCreatedBy'
  | 'viewSalesmen' | 'createSalesmen' | 'editSalesmen' | 'deleteSalesmen'
  | 'viewCommissionRules' | 'manageCommissionRules'
  | 'viewCommissionLedger' | 'manageCommissionPayments'
  | 'viewPartners' | 'createPartners' | 'editPartners' | 'deletePartners'
  | 'viewPartnerProfitShareRules' | 'managePartnerProfitShareRules'
  | 'viewPartnerProfitShareLedger' | 'managePartnerPayments'
  | 'viewCommunicationLog' | 'createCommunicationLog' | 'editCommunicationLog' | 'deleteCommunicationLog'
  | 'viewReminders' | 'createReminders' | 'editReminders' | 'deleteReminders'
  | 'viewLeads' | 'viewAllLeads' | 'createLeads' | 'editLeads' | 'deleteLeads' | 'convertLeads'
  | 'viewWhatsapp' | 'manageWhatsapp'
  | 'viewSmsLog'
  | 'manageWebsiteConnections'
  | 'countStock' | 'approveStockCounts'
  | 'viewAiAssistant'
  | 'useNotes' | 'useTeamChat' | 'useVoiceAssistant'
  | 'viewInsights'
  | 'viewPurchaseSuggestions'
  | 'viewBarcodeGenerator'
  | 'viewManufacturing' | 'manageBoms' | 'manageProductionOrders' | 'executeProduction' | 'overIssueMaterials' | 'inspectProduction' | 'manageManufacturingSettings' | 'viewManufacturingCosts'
  | 'issueMaterials' | 'editMaterialIssues' | 'receiveFinishedGoods' | 'recordScrap';

export type Permission = Partial<Record<PermissionKey, boolean>>;

export interface PermissionGroupDef {
  id: string;
  label: string;
  permissions: PermissionKey[];
}

export const PERMISSION_GROUPS: PermissionGroupDef[] = [
  { id: 'products', label: 'Products', permissions: ['viewProducts', 'createProducts', 'editProducts', 'deleteProducts', 'viewCostPrices'] },
  { id: 'stock_transfers', label: 'Stock Transfers', permissions: ['viewStockTransfers', 'manageStockTransfers'] },
  { id: 'stock_adjustments', label: 'Stock Adjustments', permissions: ['viewStockAdjustments', 'manageStockAdjustments'] },
  { id: 'stock_counts', label: 'Stock Counts', permissions: ['countStock', 'approveStockCounts'] },
  { id: 'imei_tracking', label: 'IMEI / Serial Tracking', permissions: ['viewImeiTracking', 'manageImeiTracking'] },
  { id: 'warranty_claims', label: 'Warranty Claims', permissions: ['viewWarrantyClaims', 'manageWarrantyClaims'] },
  { id: 'price_checker', label: 'Price Checker', permissions: ['viewPriceChecker', 'managePriceCheckerSources'] },
  { id: 'price_updates', label: 'Price Updates', permissions: ['viewPriceUpdates', 'managePriceUpdates'] },
  { id: 'invoices', label: 'Invoices', permissions: ['viewInvoices', 'createInvoices', 'editInvoices', 'deleteInvoices', 'printInvoices'] },
  { id: 'purchases', label: 'Purchases', permissions: ['viewPurchases', 'createPurchases', 'editPurchases', 'deletePurchases'] },
  { id: 'purchase_orders', label: 'Purchase Orders', permissions: ['viewPurchaseOrders', 'createPurchaseOrders', 'editPurchaseOrders', 'deletePurchaseOrders', 'receivePurchaseOrders'] },
  { id: 'sales_returns', label: 'Sales Returns', permissions: ['viewSalesReturns', 'createSalesReturns', 'editSalesReturns', 'deleteSalesReturns'] },
  { id: 'purchase_returns', label: 'Purchase Returns', permissions: ['viewPurchaseReturns', 'createPurchaseReturns', 'editPurchaseReturns', 'deletePurchaseReturns'] },
  { id: 'customers', label: 'Customers', permissions: ['viewCustomers', 'createCustomers', 'editCustomers', 'deleteCustomers'] },
  { id: 'suppliers', label: 'Suppliers', permissions: ['viewSuppliers', 'createSuppliers', 'editSuppliers', 'deleteSuppliers'] },
  { id: 'categories', label: 'Categories', permissions: ['viewCategories', 'createCategories', 'editCategories', 'deleteCategories'] },
  { id: 'brands', label: 'Brands', permissions: ['viewBrands', 'createBrands', 'editBrands', 'deleteBrands'] },
  { id: 'accounting', label: 'Accounts & Expenses', permissions: ['viewAccounting', 'manageExpenses', 'manageLedgers', 'managePersonalWallet'] },
  { id: 'cash', label: 'Cash Book & Register', permissions: ['viewCashBook', 'manageCashBook', 'viewCashRegister', 'manageCashRegister'] },
  { id: 'payment_vouchers', label: 'Payments & Receipts', permissions: ['viewPaymentVouchers', 'managePaymentVouchers'] },
  { id: 'bank_reconciliation', label: 'Bank Reconciliation', permissions: ['viewBankReconciliation', 'manageBankReconciliation'] },
  { id: 'accounts_system', label: 'Accounts System', permissions: ['viewAccountsSystem', 'manageAccountsSystem'] },
  { id: 'communication_log', label: 'Communication Log', permissions: ['viewCommunicationLog', 'createCommunicationLog', 'editCommunicationLog', 'deleteCommunicationLog'] },
  { id: 'reminders', label: 'Tasks & Reminders', permissions: ['viewReminders', 'createReminders', 'editReminders', 'deleteReminders'] },
  { id: 'leads', label: 'CRM Leads', permissions: ['viewLeads', 'viewAllLeads', 'createLeads', 'editLeads', 'deleteLeads', 'convertLeads'] },
  { id: 'wallet', label: 'Bank Accounts', permissions: ['viewWallet', 'manageWallet'] },
  { id: 'load', label: 'Load Management', permissions: ['viewLoadManagement', 'manageLoadManagement'] },
  { id: 'sim_sales', label: 'SIM Sales', permissions: ['viewSimSales', 'manageSimSales'] },
  { id: 'cash_management', label: 'Cash Management', permissions: ['viewCashManagement', 'manageCashManagement'] },
  { id: 'repair', label: 'Repairs', permissions: ['viewRepairs', 'manageRepairs'] },
  { id: 'services', label: 'Services', permissions: ['viewServices', 'manageServices'] },
  { id: 'bill_payments', label: 'Bill Payments', permissions: ['viewBillPayments', 'manageBillPayments'] },
  { id: 'installments', label: 'Installments', permissions: ['viewInstallments', 'manageInstallments'] },
  { id: 'used_phones', label: 'Used Phones', permissions: ['viewUsedPhones', 'buyUsedPhones', 'editUsedPhones', 'sellUsedPhones', 'deleteUsedPhones'] },
  { id: 'new_phones', label: 'New Phones', permissions: ['viewNewPhones', 'buyNewPhones', 'sellNewPhones', 'deleteNewPhones'] },
  {
    id: 'reports',
    label: 'Reports',
    permissions: [
      'viewReports', 'viewSalesReports', 'viewPurchaseReports', 'viewInventoryReports',
      'viewCustomerReports', 'viewSupplierReports', 'viewProductReports',
      'viewExpenseReports', 'viewSimSaleReports', 'viewProfitLossReports',
      'viewLoadReports', 'viewRepairReports', 'viewServiceReports',
      'viewWalletReports', 'viewInstallmentReports',
      'viewActivityReports', 'viewSummaryReports', 'viewTaxReports', 'viewTeamReports', 'viewBillPaymentReports', 'viewMobilePhoneReports',
      'exportReports',
    ],
  },
  { id: 'hr_employees', label: 'Employees', permissions: ['getEmployees', 'createEmployees', 'manageEmployees', 'deleteEmployees'] },
  { id: 'hr_departments', label: 'Departments', permissions: ['getDepartments', 'createDepartments', 'manageDepartments', 'deleteDepartments'] },
  { id: 'hr_designations', label: 'Designations', permissions: ['getDesignations', 'createDesignations', 'manageDesignations', 'deleteDesignations'] },
  { id: 'hr_attendance', label: 'Attendance', permissions: ['getAttendance', 'createAttendance', 'manageAttendance', 'deleteAttendance'] },
  { id: 'hr_leaves', label: 'Leave Management', permissions: ['getLeaves', 'createLeaves', 'manageLeaves', 'approveLeaves', 'rejectLeaves', 'deleteLeaves'] },
  { id: 'hr_payroll', label: 'Payroll', permissions: ['getPayroll', 'createPayroll', 'managePayroll', 'processPayroll', 'deletePayroll'] },
  { id: 'school_fees', label: 'Fee Accounting', permissions: ['viewFeeAccounting', 'manageFeeAccounting'] },
  { id: 'users', label: 'User Management', permissions: ['viewUsers', 'createUsers', 'editUsers', 'deleteUsers'] },
  { id: 'roles', label: 'Role Management', permissions: ['viewRoles', 'createRoles', 'editRoles', 'deleteRoles'] },
  { id: 'branches', label: 'Branch Management', permissions: ['viewBranches', 'manageBranches', 'viewBranchPerformance'] },
  { id: 'staff', label: 'Staff Management', permissions: ['viewStaff', 'manageStaff'] },
  { id: 'settings', label: 'Settings', permissions: ['viewSettings', 'editSettings'] },
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
  { id: 'dashboard', label: 'Dashboard', permissions: ['viewDashboard'] },
  { id: 'payments', label: 'Payments', permissions: ['viewPayments', 'createPayments', 'editPayments', 'deletePayments'] },
  { id: 'audit_logs', label: 'Audit Logs', permissions: ['viewAuditLogs', 'viewCreatedBy'] },
  { id: 'salesmen', label: 'Salesmen', permissions: ['viewSalesmen', 'createSalesmen', 'editSalesmen', 'deleteSalesmen'] },
  { id: 'commission_rules', label: 'Commission Rules', permissions: ['viewCommissionRules', 'manageCommissionRules'] },
  { id: 'commission_ledger', label: 'Commission Ledger', permissions: ['viewCommissionLedger', 'manageCommissionPayments'] },
  { id: 'partners', label: 'Partners & Investors', permissions: ['viewPartners', 'createPartners', 'editPartners', 'deletePartners'] },
  { id: 'partner_profit_share_rules', label: 'Partner Profit-Share Rules', permissions: ['viewPartnerProfitShareRules', 'managePartnerProfitShareRules'] },
  { id: 'partner_profit_share_ledger', label: 'Partner Ledger & Payouts', permissions: ['viewPartnerProfitShareLedger', 'managePartnerPayments'] },
  { id: 'whatsapp', label: 'WhatsApp', permissions: ['viewWhatsapp', 'manageWhatsapp'] },
  { id: 'sms', label: 'SMS', permissions: ['viewSmsLog'] },
  { id: 'website_connections', label: 'Website Connections', permissions: ['manageWebsiteConnections'] },
  { id: 'ai_assistant', label: 'AI Assistant', permissions: ['viewAiAssistant'] },
  { id: 'workspace', label: 'Notes, Team Chat & Voice', permissions: ['useNotes', 'useTeamChat', 'useVoiceAssistant'] },
  { id: 'insights', label: 'Insights', permissions: ['viewInsights'] },
  { id: 'purchase_suggestions', label: 'Purchase Suggestions', permissions: ['viewPurchaseSuggestions'] },
  { id: 'barcode', label: 'Barcode Generator', permissions: ['viewBarcodeGenerator'] },
  {
    id: 'manufacturing',
    label: 'Manufacturing',
    permissions: [
      'viewManufacturing',
      'manageBoms',
      'manageProductionOrders',
      'issueMaterials',
      'editMaterialIssues',
      'overIssueMaterials',
      'executeProduction',
      'receiveFinishedGoods',
      'recordScrap',
      'inspectProduction',
      'manageManufacturingSettings',
      'viewManufacturingCosts',
    ],
  },
];

export const PERMISSION_KEYS = [...new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions))] as PermissionKey[];

/**
 * Business types each group applies to — mirrors the sidebar gating in
 * components/layout/data/sidebar-data.ts, so the roles screen only offers modules the
 * business can actually open. Groups not listed here apply to every business type.
 * Values are normalized business types (see lib/business-types.ts).
 */
const NOT_SCHOOL_OR_RESTAURANT = { excludeBusinessTypes: ['school', 'restaurant'] };
const NOT_SCHOOL = { excludeBusinessTypes: ['school'] };
const MOBILE_SHOP_ONLY = { businessTypes: ['mobile_shop'] };

export const PERMISSION_GROUP_AVAILABILITY: Record<string, { businessTypes?: string[]; excludeBusinessTypes?: string[] }> = {
  products: NOT_SCHOOL_OR_RESTAURANT,
  stock_transfers: NOT_SCHOOL_OR_RESTAURANT,
  stock_adjustments: NOT_SCHOOL_OR_RESTAURANT,
  stock_counts: NOT_SCHOOL_OR_RESTAURANT,
  imei_tracking: NOT_SCHOOL_OR_RESTAURANT,
  warranty_claims: NOT_SCHOOL_OR_RESTAURANT,
  price_checker: NOT_SCHOOL_OR_RESTAURANT,
  price_updates: NOT_SCHOOL_OR_RESTAURANT,
  categories: NOT_SCHOOL_OR_RESTAURANT,
  brands: NOT_SCHOOL_OR_RESTAURANT,
  barcode: NOT_SCHOOL_OR_RESTAURANT,
  invoices: NOT_SCHOOL_OR_RESTAURANT,
  sales_returns: NOT_SCHOOL_OR_RESTAURANT,
  customers: NOT_SCHOOL_OR_RESTAURANT,
  leads: NOT_SCHOOL_OR_RESTAURANT,
  communication_log: NOT_SCHOOL_OR_RESTAURANT,
  reminders: NOT_SCHOOL_OR_RESTAURANT,
  purchases: NOT_SCHOOL,
  purchase_orders: NOT_SCHOOL,
  suppliers: NOT_SCHOOL,
  purchase_returns: NOT_SCHOOL_OR_RESTAURANT,
  accounting: NOT_SCHOOL_OR_RESTAURANT,
  cash: NOT_SCHOOL_OR_RESTAURANT,
  wallet: NOT_SCHOOL_OR_RESTAURANT,
  payment_vouchers: NOT_SCHOOL_OR_RESTAURANT,
  bank_reconciliation: NOT_SCHOOL_OR_RESTAURANT,
  accounts_system: NOT_SCHOOL_OR_RESTAURANT,
  payments: NOT_SCHOOL_OR_RESTAURANT,
  load: MOBILE_SHOP_ONLY,
  sim_sales: MOBILE_SHOP_ONLY,
  cash_management: MOBILE_SHOP_ONLY,
  repair: MOBILE_SHOP_ONLY,
  services: MOBILE_SHOP_ONLY,
  bill_payments: MOBILE_SHOP_ONLY,
  installments: MOBILE_SHOP_ONLY,
  used_phones: MOBILE_SHOP_ONLY,
  new_phones: MOBILE_SHOP_ONLY,
  manufacturing: { businessTypes: ['factory'] },
  school_fees: { businessTypes: ['school'] },
  reports: NOT_SCHOOL_OR_RESTAURANT,
  hr_employees: NOT_SCHOOL,
  hr_departments: NOT_SCHOOL,
  hr_designations: NOT_SCHOOL,
  hr_attendance: NOT_SCHOOL,
  hr_leaves: NOT_SCHOOL,
  hr_payroll: NOT_SCHOOL,
  website_connections: NOT_SCHOOL_OR_RESTAURANT,
  ai_assistant: NOT_SCHOOL,
  insights: NOT_SCHOOL_OR_RESTAURANT,
  purchase_suggestions: NOT_SCHOOL_OR_RESTAURANT,
  dashboard: NOT_SCHOOL_OR_RESTAURANT,
  salesmen: NOT_SCHOOL,
  commission_rules: NOT_SCHOOL,
  commission_ledger: NOT_SCHOOL,
  partners: NOT_SCHOOL,
  partner_profit_share_rules: NOT_SCHOOL,
  partner_profit_share_ledger: NOT_SCHOOL,
};

/** Single permissions inside a shared group that only one business type uses. */
export const PERMISSION_KEY_BUSINESS_TYPES: Partial<Record<PermissionKey, string[]>> = {
  viewLoadReports: ['mobile_shop'],
  viewSimSaleReports: ['mobile_shop'],
  viewRepairReports: ['mobile_shop'],
  viewServiceReports: ['mobile_shop'],
  viewInstallmentReports: ['mobile_shop'],
  viewBillPaymentReports: ['mobile_shop'],
  viewMobilePhoneReports: ['mobile_shop'],
};

export type PermissionCategoryId =
  | 'sales' | 'purchasing' | 'inventory' | 'finance' | 'mobile_shop' | 'manufacturing'
  | 'school' | 'reports' | 'hr' | 'communication' | 'team' | 'administration';

export interface PermissionCategoryDef {
  id: PermissionCategoryId;
  label: string;
  description: string;
  groups: string[];
}

/** How the roles screen arranges the groups — every group belongs to exactly one category. */
export const PERMISSION_CATEGORIES: PermissionCategoryDef[] = [
  { id: 'sales', label: 'Sales & Customers', description: 'Invoices, returns, customers and follow-ups', groups: ['invoices', 'sales_returns', 'customers', 'leads', 'communication_log', 'reminders'] },
  { id: 'purchasing', label: 'Purchasing', description: 'Purchases, orders, returns and suppliers', groups: ['purchases', 'purchase_orders', 'purchase_returns', 'suppliers', 'price_updates', 'purchase_suggestions'] },
  { id: 'inventory', label: 'Inventory', description: 'Products, stock, serials and warranty', groups: ['products', 'categories', 'brands', 'stock_transfers', 'stock_adjustments', 'stock_counts', 'imei_tracking', 'warranty_claims', 'price_checker', 'barcode'] },
  { id: 'finance', label: 'Finance & Accounts', description: 'Expenses, cash, banks and ledgers', groups: ['accounting', 'cash', 'wallet', 'payment_vouchers', 'payments', 'bank_reconciliation', 'accounts_system'] },
  { id: 'mobile_shop', label: 'Mobile Shop', description: 'Load, SIMs, repairs, phones and installments', groups: ['load', 'sim_sales', 'cash_management', 'repair', 'services', 'bill_payments', 'installments', 'used_phones', 'new_phones'] },
  { id: 'manufacturing', label: 'Manufacturing', description: 'BOMs, production orders and quality', groups: ['manufacturing'] },
  { id: 'school', label: 'School', description: 'Fee vouchers, collections and fee accounts', groups: ['school_fees'] },
  { id: 'reports', label: 'Reports', description: 'Business reports and exports', groups: ['reports'] },
  { id: 'hr', label: 'Human Resources', description: 'Employees, attendance, leave and payroll', groups: ['hr_employees', 'hr_departments', 'hr_designations', 'hr_attendance', 'hr_leaves', 'hr_payroll'] },
  { id: 'communication', label: 'Messaging & AI', description: 'WhatsApp, SMS, website and AI tools', groups: ['workspace', 'whatsapp', 'sms', 'website_connections', 'ai_assistant', 'insights'] },
  { id: 'team', label: 'Salesmen & Partners', description: 'Commissions and partner profit share', groups: ['salesmen', 'commission_rules', 'commission_ledger', 'partners', 'partner_profit_share_rules', 'partner_profit_share_ledger'] },
  { id: 'administration', label: 'Administration', description: 'Users, roles, branches and settings', groups: ['dashboard', 'users', 'roles', 'staff', 'branches', 'settings', 'tax_currency_settings', 'audit_logs'] },
];

function availableFor(rule: { businessTypes?: string[]; excludeBusinessTypes?: string[] } | undefined, businessType: string) {
  if (!rule) return true;
  if (rule.businessTypes && !rule.businessTypes.includes(businessType)) return false;
  if (rule.excludeBusinessTypes && rule.excludeBusinessTypes.includes(businessType)) return false;
  return true;
}

/**
 * The categories (and the groups/permissions inside them) a business of this type uses.
 * `businessType` must already be normalized; pass null to get everything.
 * `extraGroups` force groups on regardless of type (e.g. manufacturing for a tester login).
 */
export function getPermissionCategories(
  businessType: string | null,
  extraGroups: string[] = [],
): (PermissionCategoryDef & { groupDefs: PermissionGroupDef[] })[] {
  const byId = new Map(PERMISSION_GROUPS.map((g) => [g.id, g]));
  return PERMISSION_CATEGORIES.map((category) => ({
    ...category,
    groupDefs: category.groups
      .map((id) => byId.get(id))
      .filter((g): g is PermissionGroupDef => !!g)
      .filter((g) => businessType === null || extraGroups.includes(g.id) || availableFor(PERMISSION_GROUP_AVAILABILITY[g.id], businessType))
      .map((g) => ({
        ...g,
        permissions: businessType === null
          ? g.permissions
          : g.permissions.filter((key) => availableFor({ businessTypes: PERMISSION_KEY_BUSINESS_TYPES[key] }, businessType)),
      }))
      .filter((g) => g.permissions.length > 0),
  })).filter((category) => category.groupDefs.length > 0);
}

export function sanitizePermissions(input: Permission = {}): Permission {
  const sanitized: Permission = {};
  for (const key of PERMISSION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      sanitized[key] = Boolean(input[key]);
    }
  }
  return sanitized;
}

/** Full permission map for the roles UI (every key explicit). */
export function buildPermissionsState(input: Permission = {}): Permission {
  return Object.fromEntries(
    PERMISSION_KEYS.map((key) => [key, input[key] === true]),
  ) as Permission;
}

/** Payload for save — every registry key sent so unchecked permissions persist as false. */
export function buildPermissionsPayload(input: Permission = {}): Permission {
  return buildPermissionsState(input);
}

export function buildAllPermissionsTrue(): Permission {
  return Object.fromEntries(PERMISSION_KEYS.map((key) => [key, true])) as Permission;
}

/**
 * Plain-language names where the key alone reads badly ("Manage Boms", "Get Employees")
 * or hides what it really allows. Everything else is spelled out from the key.
 */
export const PERMISSION_LABELS: Partial<Record<PermissionKey, string>> = {
  viewManufacturing: 'View manufacturing',
  manageBoms: 'Create & edit BOMs',
  manageProductionOrders: 'Plan production orders',
  issueMaterials: 'Issue materials',
  editMaterialIssues: 'Edit & cancel issue vouchers',
  overIssueMaterials: 'Issue more than required',
  executeProduction: 'Run production steps',
  receiveFinishedGoods: 'Receive finished goods',
  recordScrap: 'Record scrap',
  inspectProduction: 'Quality inspection',
  manageManufacturingSettings: 'Manufacturing settings',
  viewManufacturingCosts: 'See costs & prices',
  viewCostPrices: 'See cost prices & profit',
  viewReports: 'View all reports',
  viewImeiTracking: 'View IMEI / serial tracking',
  manageImeiTracking: 'Manage IMEI / serial tracking',
  useNotes: 'Use notes',
  useTeamChat: 'Use team chat',
  useVoiceAssistant: 'Use voice button',
  viewBranchPerformance: 'View branch performance',
  viewCreatedBy: 'See who created records',
  managePersonalWallet: 'Manage my personal account',
};

/** One line under the checkbox saying what the permission actually allows. */
export const PERMISSION_HINTS: Partial<Record<PermissionKey, string>> = {
  viewManufacturing: 'Open the manufacturing pages, orders, stock and reports',
  manageBoms: 'Recipes, routing steps and BOM versions',
  manageProductionOrders: 'Create, schedule, release, complete and cancel orders',
  issueMaterials: 'Issue vouchers — move materials to the floor, return unused',
  editMaterialIssues: 'Change or reverse a posted issue voucher',
  overIssueMaterials: 'Issue above what the order still needs',
  executeProduction: 'Start and complete operations and assembly runs',
  receiveFinishedGoods: 'Record output, receive into stock, reverse a receipt',
  recordScrap: 'Write off scrap and wastage',
  inspectProduction: 'Pass or reject output at QC, send to rework',
  manageManufacturingSettings: 'Warehouses, QC rules and numbering',
  viewManufacturingCosts: 'Material cost, WIP and finished-goods value, prices',
  viewCostPrices: 'Purchase cost, stock value, margin and profit',
  viewReports: 'Every report, including ones without their own permission',
  exportReports: 'Download reports to Excel',
  printInvoices: 'Save & print invoices and receipts',
  viewAllLeads: 'Leads assigned to other staff too',
  viewCreatedBy: 'The "Created by" column and filter',
  viewBranchPerformance: 'Sales, cash and stock of every branch side by side',
  useVoiceAssistant: 'The floating voice / quick-actions button (bottom right)',
};

export function formatPermissionLabel(key: PermissionKey, t: (key: string) => string): string {
  const label = PERMISSION_LABELS[key];
  if (label) return t(label);
  const translated = t(key);
  if (translated !== key) return translated;
  // HR keys are named get* (getEmployees) — show them as "View …".
  return key
    .replace(/^get(?=[A-Z])/, 'view')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
