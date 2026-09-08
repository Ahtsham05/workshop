import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

// Mirrors server/src/models/schemas/taxLine.schema.js exactly — this is the
// header-level tax breakdown persisted on Invoice/Purchase (and, going forward,
// Purchase Order/Restaurant Order/Sales Return/Purchase Return).
export interface TaxLineComponent {
  taxRateId: string
  name: string
  ratePercent: number | null
  isCompound: boolean
  amount: number
}

export interface TaxLine {
  taxCategoryId: string | null
  taxCategoryName: string | null
  taxableAmount: number
  taxAmount: number
  components: TaxLineComponent[]
}

export interface TaxPreviewLine {
  lineId: string
  amount: number
  taxCategoryId?: string | null
}

export interface TaxPreviewResultLine {
  lineId: string
  taxableAmount: number
  taxAmount: number
  effectiveRatePercent: number
  components: TaxLineComponent[]
}

export interface TaxPreviewResponse {
  lines: TaxPreviewResultLine[]
  totalTax: number
  taxBreakdownByCategory: TaxLine[]
  exemptionApplied: boolean
}

export interface TaxPreviewRequest {
  currency: string
  lines: TaxPreviewLine[]
  customerId?: string
  asOfDate?: string
  taxInclusive?: boolean
  jurisdictionIds?: string[]
}

// Wraps the already-existing, already-authoritative POST /tax/calculate preview
// endpoint (taxCalculator.controller.js) — a pure, read-only call into the same
// taxCalculator.service.js used at save time, so the client never reimplements
// tax math, it only previews the server's own calculation before submit.
export const taxCalculatorApi = createApi({
  reducerPath: 'taxCalculatorApi',
  baseQuery,
  endpoints: (builder) => ({
    previewTax: builder.mutation<TaxPreviewResponse, TaxPreviewRequest>({
      query: (body) => ({ url: '/tax/calculate', method: 'POST', body }),
    }),
  }),
})

export const { usePreviewTaxMutation } = taxCalculatorApi
