export type PermissionKey =
  | 'viewProducts' | 'createProducts' | 'editProducts' | 'deleteProducts'
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
  | 'viewReports' | 'viewSalesReports' | 'viewPurchaseReports' | 'viewInventoryReports'
  | 'viewCustomerReports' | 'viewSupplierReports' | 'viewProductReports'
  | 'viewExpenseReports' | 'viewSimSaleReports' | 'viewProfitLossReports'
  | 'viewLoadReports' | 'viewRepairReports' | 'viewServiceReports'
  | 'viewWalletReports' | 'viewInstallmentReports' | 'exportReports'
  | 'getEmployees' | 'createEmployees' | 'manageEmployees' | 'deleteEmployees'
  | 'getDepartments' | 'createDepartments' | 'manageDepartments' | 'deleteDepartments'
  | 'getAttendance' | 'createAttendance' | 'manageAttendance' | 'deleteAttendance'
  | 'getLeaves' | 'createLeaves' | 'manageLeaves' | 'approveLeaves' | 'rejectLeaves' | 'deleteLeaves'
  | 'getPayroll' | 'createPayroll' | 'managePayroll' | 'processPayroll' | 'deletePayroll'
  | 'getPerformanceReviews' | 'createPerformanceReviews' | 'managePerformanceReviews' | 'deletePerformanceReviews'
  | 'viewFeeAccounting' | 'manageFeeAccounting'
  | 'viewUsers' | 'createUsers' | 'editUsers' | 'deleteUsers'
  | 'viewRoles' | 'createRoles' | 'editRoles' | 'deleteRoles'
  | 'viewBranches' | 'manageBranches'
  | 'viewStaff' | 'manageStaff'
  | 'viewSettings' | 'editSettings'
  | 'viewDashboard'
  | 'viewPayments' | 'createPayments' | 'editPayments' | 'deletePayments';

export type Permission = Partial<Record<PermissionKey, boolean>>;

export interface PermissionGroupDef {
  id: string;
  label: string;
  permissions: PermissionKey[];
}

export const PERMISSION_GROUPS: PermissionGroupDef[] = [
  { id: 'products', label: 'Products', permissions: ['viewProducts', 'createProducts', 'editProducts', 'deleteProducts'] },
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
  { id: 'accounts_system', label: 'Accounts System', permissions: ['viewAccountsSystem', 'manageAccountsSystem'] },
  { id: 'wallet', label: 'Mobile Shop — Wallet', permissions: ['viewWallet', 'manageWallet'] },
  { id: 'load', label: 'Mobile Shop — Load Management', permissions: ['viewLoadManagement', 'manageLoadManagement'] },
  { id: 'sim_sales', label: 'Mobile Shop — Sim Sale', permissions: ['viewSimSales', 'manageSimSales'] },
  { id: 'cash_management', label: 'Mobile Shop — Cash Management', permissions: ['viewCashManagement', 'manageCashManagement'] },
  { id: 'repair', label: 'Mobile Shop — Repair', permissions: ['viewRepairs', 'manageRepairs'] },
  { id: 'services', label: 'Mobile Shop — Services', permissions: ['viewServices', 'manageServices'] },
  { id: 'bill_payments', label: 'Mobile Shop — Bill Payments', permissions: ['viewBillPayments', 'manageBillPayments'] },
  { id: 'installments', label: 'Mobile Shop — Installments', permissions: ['viewInstallments', 'manageInstallments'] },
  { id: 'imei_tracking', label: 'Mobile Shop — IMEI Tracking', permissions: ['viewImeiTracking', 'manageImeiTracking'] },
  {
    id: 'reports',
    label: 'Reports',
    permissions: [
      'viewReports', 'viewSalesReports', 'viewPurchaseReports', 'viewInventoryReports',
      'viewCustomerReports', 'viewSupplierReports', 'viewProductReports',
      'viewExpenseReports', 'viewSimSaleReports', 'viewProfitLossReports',
      'viewLoadReports', 'viewRepairReports', 'viewServiceReports',
      'viewWalletReports', 'viewInstallmentReports', 'exportReports',
    ],
  },
  { id: 'hr_employees', label: 'HR — Employees', permissions: ['getEmployees', 'createEmployees', 'manageEmployees', 'deleteEmployees'] },
  { id: 'hr_departments', label: 'HR — Departments', permissions: ['getDepartments', 'createDepartments', 'manageDepartments', 'deleteDepartments'] },
  { id: 'hr_attendance', label: 'HR — Attendance', permissions: ['getAttendance', 'createAttendance', 'manageAttendance', 'deleteAttendance'] },
  { id: 'hr_leaves', label: 'HR — Leave Management', permissions: ['getLeaves', 'createLeaves', 'manageLeaves', 'approveLeaves', 'rejectLeaves', 'deleteLeaves'] },
  { id: 'hr_payroll', label: 'HR — Payroll', permissions: ['getPayroll', 'createPayroll', 'managePayroll', 'processPayroll', 'deletePayroll'] },
  { id: 'hr_performance', label: 'HR — Performance Reviews', permissions: ['getPerformanceReviews', 'createPerformanceReviews', 'managePerformanceReviews', 'deletePerformanceReviews'] },
  { id: 'school_fees', label: 'School — Fee Accounting', permissions: ['viewFeeAccounting', 'manageFeeAccounting'] },
  { id: 'users', label: 'User Management', permissions: ['viewUsers', 'createUsers', 'editUsers', 'deleteUsers'] },
  { id: 'roles', label: 'Role Management', permissions: ['viewRoles', 'createRoles', 'editRoles', 'deleteRoles'] },
  { id: 'branches', label: 'Branch Management', permissions: ['viewBranches', 'manageBranches'] },
  { id: 'staff', label: 'Staff Management', permissions: ['viewStaff', 'manageStaff'] },
  { id: 'settings', label: 'Settings', permissions: ['viewSettings', 'editSettings'] },
  { id: 'dashboard', label: 'Dashboard', permissions: ['viewDashboard'] },
  { id: 'payments', label: 'Payments', permissions: ['viewPayments', 'createPayments', 'editPayments', 'deletePayments'] },
];

export const PERMISSION_KEYS = [...new Set(PERMISSION_GROUPS.flatMap((g) => g.permissions))] as PermissionKey[];

export const PERMISSION_TAB_GROUPS = {
  business: [
    'products', 'invoices', 'purchases', 'purchase_orders', 'sales_returns', 'purchase_returns',
    'customers', 'suppliers', 'categories', 'brands', 'accounting', 'cash', 'accounts_system',
  ],
  mobile_shop: [
    'wallet', 'load', 'sim_sales', 'cash_management', 'repair', 'services', 'bill_payments', 'installments', 'imei_tracking',
  ],
  reports_hr: [
    'reports', 'hr_employees', 'hr_departments', 'hr_attendance', 'hr_leaves', 'hr_payroll', 'hr_performance', 'school_fees',
  ],
  administration: ['users', 'roles', 'branches', 'staff', 'settings', 'dashboard', 'payments'],
} as const;

export type PermissionTabId = keyof typeof PERMISSION_TAB_GROUPS;

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

export function getGroupsForTab(tab: PermissionTabId): PermissionGroupDef[] {
  const ids = PERMISSION_TAB_GROUPS[tab];
  return PERMISSION_GROUPS.filter((group) => (ids as readonly string[]).includes(group.id));
}

export function formatPermissionLabel(key: PermissionKey, t: (key: string) => string): string {
  const translated = t(key);
  if (translated !== key) return translated;
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
