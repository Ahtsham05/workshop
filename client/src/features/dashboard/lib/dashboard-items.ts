import { useCallback } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '@/stores/store'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { isCashBookBusiness, isMobileShopBusiness } from '@/lib/business-types'
import { useDashboardCardVisible } from './card-permissions'
import type { DashboardSectionId } from './dashboard-layout'

/**
 * Everything on the main dashboard that a person can switch on or off (Settings → Dashboard).
 * Ids are the same ones the page uses: section ids (dashboard-layout.ts), KPI `cardId`s and
 * widget ids (card-permissions.ts). Keep this list in step with features/dashboard/index.tsx.
 */

/** Which businesses see an item: mobile shops, or cash-book businesses that are not mobile shops. */
type Only = 'mobile' | 'cashbook'

export interface DashboardItem {
  id: string
  label: string
  hint?: string
  only?: Only
}

export interface DashboardCardGroup {
  label: string
  items: DashboardItem[]
}

export interface DashboardSectionInfo {
  id: DashboardSectionId
  label: string
  hint: string
  /** Charts / lists inside the section that can be switched off on their own. */
  widgets?: DashboardItem[]
}

export const DASHBOARD_SECTION_INFO: Record<DashboardSectionId, DashboardSectionInfo> = {
  'quick-links': { id: 'quick-links', label: 'Quick Links', hint: 'One-tap shortcut tiles at the top of the page.' },
  kpis: { id: 'kpis', label: 'Key figure cards', hint: 'The small number cards — pick exactly which ones below.' },
  finance: {
    id: 'finance',
    label: 'Profit & Loss and dues',
    hint: 'Monthly profit chart with what customers owe you and what you owe suppliers.',
    widgets: [
      { id: 'insight-profit-loss', label: 'Profit & Loss chart', hint: 'Income, cost of goods, expenses and net profit by month.' },
      { id: 'insight-due-invoices', label: 'Due Invoices', hint: 'Unpaid customer invoices: overdue vs not due yet.' },
      { id: 'insight-bills-to-pay', label: 'Bills to Pay', hint: 'Unpaid supplier bills: overdue vs not due yet.' },
    ],
  },
  'sales-expenses': {
    id: 'sales-expenses',
    label: 'Sales and expenses',
    hint: 'Sales by month and where the money was spent.',
    widgets: [
      { id: 'insight-sales', label: 'Sales chart', hint: 'Sales by month (by day for the last 30 days).' },
      { id: 'insight-expenses', label: 'Expenses by category', hint: 'Donut of your biggest expense categories.' },
    ],
  },
  money: {
    id: 'money',
    label: 'Money in & out, receivable and payable',
    hint: 'Cash flow by month and how old your unpaid amounts are.',
    widgets: [
      { id: 'insight-money-flow', label: 'Track Money', hint: 'Money in and out for 4 months, plus 2 months expected.' },
      { id: 'insight-receivable-aging', label: 'Accounts Receivable aging', hint: 'What customers owe, by age.' },
      { id: 'insight-payable-aging', label: 'Accounts Payable aging', hint: 'What you owe suppliers, by age.' },
    ],
  },
  charts: {
    id: 'charts',
    label: 'Revenue chart & low stock',
    hint: 'Revenue for the selected period and products running low.',
    widgets: [
      { id: 'revenue-chart', label: 'Revenue overview chart' },
      { id: 'low-stock', label: 'Low stock list' },
    ],
  },
  'top-lists': {
    id: 'top-lists',
    label: 'Top products & customers',
    hint: 'Best sellers and best customers for the selected period.',
    widgets: [
      { id: 'top-products', label: 'Top products' },
      { id: 'top-customers', label: 'Top customers' },
    ],
  },
  activities: { id: 'activities', label: 'Recent activities', hint: 'Latest invoices, purchases, payments and stock changes.' },
  upcoming: { id: 'upcoming', label: 'Upcoming invoices', hint: 'Credit invoices coming due, overdue first.' },
}

export const DASHBOARD_CARD_GROUPS: DashboardCardGroup[] = [
  {
    label: 'Cash & banking',
    items: [
      { id: 'cash-in-hand', label: 'Cash in Hand', only: 'mobile' },
      { id: 'cash-in-hand-2', label: 'Cash in Hand', only: 'cashbook' },
      { id: 'bank-accounts-balance', label: 'Bank Accounts Balance', only: 'mobile' },
      { id: 'payments-received', label: 'Payments Received' },
      { id: 'payments-paid', label: 'Payments Paid' },
      { id: 'my-wallet', label: 'My Wallet' },
      { id: 'send', label: 'Send', only: 'mobile' },
      { id: 'received', label: 'Received', only: 'mobile' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { id: 'total-revenue', label: 'Total Revenue' },
      { id: 'total-sales', label: 'Total Sales' },
      { id: 'sales-returns', label: 'Sales Returns' },
      { id: 'net-sales', label: 'Net Sales' },
      { id: 'pending-invoices', label: 'Pending Invoices' },
    ],
  },
  {
    label: 'Purchases',
    items: [
      { id: 'total-purchases', label: 'Total Purchases' },
      { id: 'purchase-returns', label: 'Purchase Returns' },
      { id: 'net-purchases', label: 'Net Purchases' },
    ],
  },
  {
    label: 'Customers & suppliers',
    items: [
      { id: 'total-receivable', label: 'Total Receivable' },
      { id: 'total-payable', label: 'Total Payable' },
    ],
  },
  {
    label: 'Profit & expenses',
    items: [
      { id: 'total-profit', label: 'Total Profit' },
      { id: 'total-expenses', label: 'Total Expenses' },
      { id: 'net-profit-after-expense', label: 'Net Profit After Expense' },
      { id: 'net-profit-after-all-expenses', label: 'Net Profit After All Expenses' },
      { id: 'roi', label: 'ROI' },
      { id: 'total-cost', label: 'Total Cost', only: 'mobile' },
    ],
  },
  {
    label: 'Inventory',
    items: [
      { id: 'inventory-value', label: 'Inventory Value' },
      { id: 'low-stock-items', label: 'Low Stock Items' },
    ],
  },
  {
    label: 'Mobile shop services',
    items: [
      { id: 'load-sold', label: 'Load Sold', only: 'mobile' },
      { id: 'load-purchased', label: 'Load Purchased', only: 'mobile' },
      { id: 'repair-income', label: 'Repair Income', only: 'mobile' },
      { id: 'bill-collection', label: 'Bill Collection', only: 'mobile' },
      { id: 'bills-due', label: 'Bills Due', only: 'mobile' },
      { id: 'overdue-bills', label: 'Overdue Bills', only: 'mobile' },
      { id: 'sim-sale', label: 'Sim Sale', only: 'mobile' },
      { id: 'services', label: 'Services', only: 'mobile' },
    ],
  },
  {
    label: 'Leads & tasks',
    items: [
      { id: 'leads', label: 'Leads' },
      { id: 'tasks-due-today', label: 'Tasks Due Today' },
    ],
  },
]

/**
 * Whether an item can appear for this person at all — their role's permissions and the
 * business type. Settings only lists items that pass, so nobody gets a switch that does nothing.
 */
export function useDashboardItemAvailable(): (item: DashboardItem) => boolean {
  const cardVisible = useDashboardCardVisible()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery()
  const businessType = org?.businessType ?? user?.businessType
  const mobile = isMobileShopBusiness(businessType)
  const cashbook = isCashBookBusiness(businessType) && !mobile
  return useCallback(
    (item: DashboardItem) => {
      if (item.only === 'mobile' && !mobile) return false
      if (item.only === 'cashbook' && !cashbook) return false
      return cardVisible(item.id)
    },
    [cardVisible, mobile, cashbook]
  )
}
