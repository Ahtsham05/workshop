import { usePermissions } from '@/context/permission-context'
import type { PermissionKey } from '@/lib/permission-registry'

/**
 * Which permission each dashboard card needs. Seeing the dashboard (viewDashboard) only
 * opens the page: a card about a module shows to roles that may use that module, and cards
 * built on cost (inventory value, profit, ROI) also need viewCostPrices.
 * `any` = one of these; `all` = every one of these. Cards not listed are always shown.
 */
const CARD_PERMISSIONS: Record<string, { any?: PermissionKey[]; all?: PermissionKey[] }> = {
  'cash-in-hand': { any: ['viewCashBook', 'viewCashRegister', 'viewAccounting'] },
  'cash-in-hand-2': { any: ['viewCashBook', 'viewCashRegister', 'viewAccounting'] },
  'bank-accounts-balance': { any: ['viewWallet'] },
  'load-sold': { any: ['viewLoadManagement'] },
  'load-purchased': { any: ['viewLoadManagement'] },
  'repair-income': { any: ['viewRepairs'] },
  'bill-collection': { any: ['viewBillPayments'] },
  'bills-due': { any: ['viewBillPayments'] },
  'overdue-bills': { any: ['viewBillPayments'] },
  'sim-sale': { any: ['viewSimSales'] },
  services: { any: ['viewServices'] },
  send: { any: ['viewCashManagement', 'viewLoadManagement'] },
  received: { any: ['viewCashManagement', 'viewLoadManagement'] },
  'total-receivable': { any: ['viewCustomers', 'viewPayments', 'viewAccounting'] },
  'payments-received': { any: ['viewPayments', 'viewAccounting', 'viewCustomers'] },
  'total-payable': { any: ['viewSuppliers', 'viewPayments', 'viewAccounting'] },
  'payments-paid': { any: ['viewPayments', 'viewAccounting', 'viewSuppliers'] },
  'my-wallet': { any: ['managePersonalWallet', 'viewAccounting'] },
  leads: { any: ['viewLeads'] },
  'tasks-due-today': { any: ['viewReminders'] },
  'total-revenue': { any: ['viewInvoices', 'viewSalesReports'] },
  'total-sales': { any: ['viewInvoices', 'viewSalesReports'] },
  'sales-returns': { any: ['viewSalesReturns', 'viewSalesReports'] },
  'net-sales': { any: ['viewInvoices', 'viewSalesReports'] },
  'total-purchases': { any: ['viewPurchases', 'viewPurchaseReports'] },
  'purchase-returns': { any: ['viewPurchaseReturns', 'viewPurchaseReports'] },
  'net-purchases': { any: ['viewPurchases', 'viewPurchaseReports'] },
  'low-stock-items': { any: ['viewProducts', 'viewInventoryReports'] },
  'pending-invoices': { any: ['viewInvoices'] },
  'total-expenses': { any: ['viewAccounting', 'manageExpenses', 'viewExpenseReports'] },
  'total-cost': { all: ['viewCostPrices'] },
  'inventory-value': { all: ['viewCostPrices'] },
  'total-profit': { all: ['viewCostPrices'] },
  'net-profit-after-expense': { all: ['viewCostPrices'] },
  'net-profit-after-all-expenses': { all: ['viewCostPrices'] },
  roi: { all: ['viewCostPrices'] },
}

export function useDashboardCardVisible(): (cardId: string) => boolean {
  const { hasExplicitPermission } = usePermissions()
  return (cardId) => {
    const rule = CARD_PERMISSIONS[cardId]
    if (!rule) return true
    if (rule.all && !rule.all.every((p) => hasExplicitPermission(p))) return false
    if (rule.any && !rule.any.some((p) => hasExplicitPermission(p))) return false
    return true
  }
}
