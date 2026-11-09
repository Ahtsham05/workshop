import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

/**
 * Ledger discounts — Discount Allowed (customers) / Discount Received (suppliers).
 * Server: services/ledgerDiscount.service.js, routes /ledger-discounts.
 */

export type LedgerDiscountReason =
  | 'cash_discount'
  | 'early_payment'
  | 'settlement'
  | 'volume_rebate'
  | 'round_off'
  | 'goodwill'
  | 'bad_debt'
  | 'other'

export interface LedgerDiscountSettings {
  enabled: boolean
  customerEnabled: boolean
  supplierEnabled: boolean
  /** 0 = no limit */
  maxPercent: number
  /** 0 = no limit */
  maxAmount: number
  requireApprovalNote: boolean
  requireNote: boolean
  defaultReason: LedgerDiscountReason
  allowStandalone: boolean
  quickPercents: number[]
  showOnStatements: boolean
  showOnReceipts: boolean
}

export type DiscountSide = 'customer' | 'supplier'

export interface DiscountRegisterRow {
  id: string
  side: DiscountSide
  date: string
  partyId: string
  partyName: string
  partyNameUrdu?: string
  partyPhone?: string
  reason: LedgerDiscountReason
  amount: number
  percent: number | null
  paymentAmount: number | null
  settledAmount: number | null
  linked: boolean
  overLimit: boolean
  approvalNote?: string
  description?: string
  reference?: string
  notes?: string
  createdById: string | null
  createdByName: string | null
}

export interface DiscountGroup {
  key: string
  label: string
  count: number
  amount: number
  allowed: number
  received: number
  side?: DiscountSide
  partyId?: string
}

export interface DiscountRegister {
  period: { startDate: string; endDate: string }
  side: 'all' | DiscountSide
  summary: {
    allowed: { total: number; count: number; withPayment: number; overLimit: number; collections: number; rateOfCollections: number; parties: number }
    received: { total: number; count: number; withPayment: number; overLimit: number; payments: number; rateOfPayments: number; parties: number }
    net: number
    billDiscounts: {
      sales: { bill: number; lines: number; total: number; invoices: number; rateOfSales: number }
      purchases: { bill: number; lines: number; total: number; invoices: number; rateOfPurchases: number }
    }
  }
  byReason: DiscountGroup[]
  byParty: DiscountGroup[]
  byUser: DiscountGroup[]
  byMonth: DiscountGroup[]
  rows: DiscountRegisterRow[]
}

export interface DiscountRegisterQuery {
  startDate: string
  endDate: string
  side?: 'all' | DiscountSide
  partyId?: string
  reason?: LedgerDiscountReason
  createdBy?: string
  search?: string
}

export const ledgerDiscountsApi = createApi({
  reducerPath: 'ledgerDiscountsApi',
  baseQuery,
  tagTypes: ['LedgerDiscountSettings', 'DiscountRegister'],
  endpoints: (builder) => ({
    getLedgerDiscountSettings: builder.query<LedgerDiscountSettings, void>({
      query: () => '/ledger-discounts/settings',
      providesTags: ['LedgerDiscountSettings'],
    }),
    updateLedgerDiscountSettings: builder.mutation<LedgerDiscountSettings, Partial<LedgerDiscountSettings>>({
      query: (body) => ({ url: '/ledger-discounts/settings', method: 'PATCH', body }),
      invalidatesTags: ['LedgerDiscountSettings'],
    }),
    getDiscountRegister: builder.query<DiscountRegister, DiscountRegisterQuery>({
      query: (params) => ({
        url: '/ledger-discounts/register',
        params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== 'all')),
      }),
      providesTags: ['DiscountRegister'],
    }),
  }),
})

export const { useGetLedgerDiscountSettingsQuery, useUpdateLedgerDiscountSettingsMutation, useGetDiscountRegisterQuery } =
  ledgerDiscountsApi
