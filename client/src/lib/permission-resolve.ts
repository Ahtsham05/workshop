import type { Permission, PermissionKey } from '@/lib/permission-registry';

/** Legacy / derived access until roles are updated with explicit flags. */
export const PERMISSION_FALLBACKS: Partial<Record<PermissionKey, PermissionKey>> = {
  viewPurchaseOrders: 'viewPurchases',
  createPurchaseOrders: 'createPurchases',
  editPurchaseOrders: 'editPurchases',
  deletePurchaseOrders: 'deletePurchases',
  receivePurchaseOrders: 'createPurchases',
  viewSalesReturns: 'viewInvoices',
  createSalesReturns: 'createInvoices',
  editSalesReturns: 'editInvoices',
  deleteSalesReturns: 'deleteInvoices',
  viewPurchaseReturns: 'viewPurchases',
  createPurchaseReturns: 'createPurchases',
  editPurchaseReturns: 'editPurchases',
  deletePurchaseReturns: 'deletePurchases',
  viewAccounting: 'viewDashboard',
  manageExpenses: 'viewAccounting',
  manageLedgers: 'viewAccounting',
  managePersonalWallet: 'viewAccounting',
  viewCashBook: 'viewAccounting',
  manageCashBook: 'viewCashBook',
  viewCashRegister: 'viewAccounting',
  manageCashRegister: 'viewCashRegister',
  viewAccountsSystem: 'viewAccounting',
  manageAccountsSystem: 'viewAccountsSystem',
  viewWallet: 'viewDashboard',
  manageWallet: 'viewWallet',
  viewLoadManagement: 'viewDashboard',
  manageLoadManagement: 'viewLoadManagement',
  viewSimSales: 'viewDashboard',
  manageSimSales: 'viewSimSales',
  viewCashManagement: 'viewLoadManagement',
  manageCashManagement: 'viewCashManagement',
  viewRepairs: 'viewDashboard',
  manageRepairs: 'viewRepairs',
  viewServices: 'viewDashboard',
  manageServices: 'viewServices',
  viewBillPayments: 'viewDashboard',
  manageBillPayments: 'viewBillPayments',
  viewInstallments: 'viewDashboard',
  manageInstallments: 'viewInstallments',
  viewExpenseReports: 'viewReports',
  viewSimSaleReports: 'viewReports',
  viewProfitLossReports: 'viewReports',
  viewLoadReports: 'viewReports',
  viewRepairReports: 'viewReports',
  viewServiceReports: 'viewReports',
  viewWalletReports: 'viewReports',
  viewInstallmentReports: 'viewReports',
  getEmployees: 'viewDashboard',
  createEmployees: 'getEmployees',
  manageEmployees: 'getEmployees',
  deleteEmployees: 'getEmployees',
  getDepartments: 'getEmployees',
  createDepartments: 'getDepartments',
  manageDepartments: 'getDepartments',
  deleteDepartments: 'getDepartments',
  getAttendance: 'getEmployees',
  createAttendance: 'getAttendance',
  manageAttendance: 'getAttendance',
  deleteAttendance: 'getAttendance',
  getLeaves: 'getEmployees',
  createLeaves: 'getLeaves',
  manageLeaves: 'getLeaves',
  approveLeaves: 'manageLeaves',
  rejectLeaves: 'manageLeaves',
  deleteLeaves: 'getLeaves',
  getPayroll: 'getEmployees',
  createPayroll: 'getPayroll',
  managePayroll: 'getPayroll',
  processPayroll: 'managePayroll',
  deletePayroll: 'getPayroll',
  getPerformanceReviews: 'getEmployees',
  createPerformanceReviews: 'getPerformanceReviews',
  managePerformanceReviews: 'getPerformanceReviews',
  deletePerformanceReviews: 'getPerformanceReviews',
  viewFeeAccounting: 'viewDashboard',
  manageFeeAccounting: 'viewFeeAccounting',
  viewBranches: 'viewUsers',
  manageBranches: 'viewBranches',
  viewStaff: 'viewUsers',
  manageStaff: 'viewStaff',
};

export function resolvePermission(
  permissions: Permission | null | undefined,
  permission: PermissionKey,
): boolean {
  if (!permissions) return false;
  if (permissions[permission] === true) return true;
  const fallback = PERMISSION_FALLBACKS[permission];
  if (fallback) return resolvePermission(permissions, fallback);
  return false;
}

/** Strict flag — no fallbacks (use for create/edit/delete). */
export function hasExplicitPermission(
  permissions: Permission | null | undefined,
  permission: PermissionKey,
): boolean {
  return permissions?.[permission] === true;
}

export function hasAnyPermission(
  permissions: Permission | null | undefined,
  keys: PermissionKey[],
): boolean {
  return keys.some((key) => resolvePermission(permissions, key));
}
