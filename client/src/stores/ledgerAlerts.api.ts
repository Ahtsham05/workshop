import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

/**
 * Ledger alerts — invoice due dates + overdue colour bands.
 * Server: services/ledgerAlerts.service.js, routes /ledger-alerts.
 */

export type LedgerRowStyle = 'tint' | 'bar' | 'badge'
export type LedgerIntensity = 'light' | 'medium' | 'strong'
export type AgingState = 'overdue' | 'due_today' | 'due_soon' | 'current' | 'no_due_date' | 'clear'
export type AgingItemState = 'overdue' | 'due_today' | 'due_soon' | 'not_due' | 'no_due_date'

export interface LedgerBand {
  label: string
  fromDays: number
  color: string
}

export interface LedgerAlertSettings {
  dueDatesEnabled: boolean
  defaultDueDays: number
  applyToPending: boolean
  useCustomerTerms: boolean
  undatedRule: 'ignore' | 'default_days'
  colorsEnabled: boolean
  dueSoonEnabled: boolean
  dueSoonDays: number
  dueSoonColor: string
  dueSoonLabel: string
  dueTodayColor: string
  dueTodayLabel: string
  bands: LedgerBand[]
  rowStyle: LedgerRowStyle
  intensity: LedgerIntensity
  minAmount: number
  showInReports: boolean
  printColors: boolean
}

export interface AgingBuckets {
  current: number
  d1_30: number
  d31_60: number
  d61_90: number
  d90_plus: number
  noDueDate: number
}

export interface AgingItem {
  kind: 'invoice' | 'pending' | 'ledger' | 'unmatched'
  entryType?: string
  invoiceId: string | null
  ledgerEntryId: string | null
  reference: string | null
  invoiceNumber: string | null
  billNumber: string | null
  description: string | null
  date: string | null
  dueDate: string | null
  dueSource: 'invoice' | 'terms' | 'default' | 'none'
  total: number | null
  openAmount: number
  state: AgingItemState
  daysOverdue: number
  daysUntilDue: number | null
  bandIndex: number
}

export interface CustomerAging {
  customerId: string
  name: string
  nameUrdu?: string
  phone?: string
  whatsapp?: string
  balance: number
  openAmount: number
  pendingAmount: number
  overdueAmount: number
  overdueCount: number
  oldestDaysOverdue: number
  oldestDueDate: string | null
  dueTodayAmount: number
  dueSoonAmount: number
  notDueAmount: number
  noDueDateAmount: number
  nextDueDate: string | null
  nextDueAmount: number
  buckets: AgingBuckets
  state: AgingState
  bandIndex: number
  topOverdue?: AgingItem[]
  items?: AgingItem[]
}

export interface LedgerStatusBoard {
  generatedAt: string
  today: string
  settings: LedgerAlertSettings
  totals: {
    customersOwing: number
    openAmount: number
    overdueCustomers: number
    overdueAmount: number
    dueTodayCustomers: number
    dueTodayAmount: number
    dueSoonCustomers: number
    dueSoonAmount: number
    noDueDateAmount: number
    buckets: AgingBuckets
    bands: (LedgerBand & { index: number; customers: number; amount: number })[]
  }
  rows: CustomerAging[]
}

export interface CustomerAgingDetail {
  settings: LedgerAlertSettings
  today: string
  customer?: { id: string; name: string; paymentTerms: string | null }
  aging: CustomerAging | null
}

export const ledgerAlertsApi = createApi({
  reducerPath: 'ledgerAlertsApi',
  baseQuery,
  tagTypes: ['LedgerAlertSettings', 'LedgerStatus'],
  // Colours are a glance aid, not money that must be to-the-second: lists reuse one board
  // for a minute, and every sale/payment mutation invalidates it anyway.
  keepUnusedDataFor: 120,
  endpoints: (builder) => ({
    getLedgerAlertSettings: builder.query<LedgerAlertSettings, void>({
      query: () => '/ledger-alerts/settings',
      providesTags: ['LedgerAlertSettings'],
    }),
    updateLedgerAlertSettings: builder.mutation<LedgerAlertSettings, Partial<LedgerAlertSettings>>({
      query: (body) => ({ url: '/ledger-alerts/settings', method: 'PATCH', body }),
      invalidatesTags: ['LedgerAlertSettings', 'LedgerStatus'],
    }),
    getLedgerStatusBoard: builder.query<LedgerStatusBoard, void>({
      query: () => '/ledger-alerts/status',
      providesTags: ['LedgerStatus'],
    }),
    getCustomerAging: builder.query<CustomerAgingDetail, string>({
      query: (customerId) => `/ledger-alerts/customers/${customerId}`,
      providesTags: (_r, _e, customerId) => [{ type: 'LedgerStatus', id: customerId }, 'LedgerStatus'],
    }),
  }),
})

export const {
  useGetLedgerAlertSettingsQuery,
  useUpdateLedgerAlertSettingsMutation,
  useGetLedgerStatusBoardQuery,
  useGetCustomerAgingQuery,
} = ledgerAlertsApi
