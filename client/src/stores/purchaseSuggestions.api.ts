import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

export type HorizonDays = 30 | 60 | 90

export interface DemandTrend {
  growthPercent: number
  label: 'rising' | 'falling' | 'stable'
  last7Qty: number
  prev7Qty: number
}

export interface SeasonalFactorRef {
  name: string
  multiplier: number
}

export interface SupplierRecommendation {
  supplierId: string
  supplierName: string
  avgPrice: number | null
  avgLeadTimeDays: number | null
  onTimeDeliveryRate: number | null
  cancellationRate: number | null
  returnRate: number | null
  ordersCount: number
  priceScore: number
  deliveryScore: number
  reliabilityScore: number
  overallScore: number
}

export interface ExpiryWarning {
  batchNumber: string
  daysUntilExpiry: number
}

export interface PurchaseSuggestion {
  // The per-unit key — a variantId when this row is a specific real variant or a
  // batch-tracked simple product's hidden default variant, else the real product id.
  // `name` already includes the variant label (e.g. "Toshiba — 12") when it is.
  productId: string
  // The real Product._id — always present, distinct from `productId` above when
  // `variantId` is set. Needed when adding this suggestion to a purchase invoice/order.
  realProductId?: string
  variantId?: string | null
  name: string
  categoryName: string
  currentStock: number
  incomingPOQty: number
  coveredByTransfer: number
  horizonDays: HorizonDays
  dailyDemand: number
  leadTimeDays: number
  safetyStock: number
  reorderPoint: number
  suggestedOrderQty: number
  daysRemaining: number | null
  trend: DemandTrend
  seasonalFactor: SeasonalFactorRef | null
  recommendedSupplier: SupplierRecommendation | null
  expiryWarning?: ExpiryWarning | null
  reason: string
}

export interface TransferSuggestion {
  productName: string
  fromBranchId: string
  fromProductId: string
  toBranchId: string
  toProductId: string
  quantity: number
  reason: string
}

export interface PurchaseSuggestionsResponse {
  branchId: string
  horizonDays: HorizonDays
  suggestions: PurchaseSuggestion[]
  relevantTransfers: TransferSuggestion[]
}

export interface StockoutPrediction {
  productId: string
  name: string
  stock: number
  dailyDemand: number
  daysRemaining: number | null
  reason: string
}

export interface DeadStockItem {
  productId: string
  name: string
  stock: number
  stockValue: number
  daysSinceLastSale: number | null
  recommendedAction: 'discount' | 'bundle' | 'liquidation'
  reason: string
}

export interface DemandTrendItem extends DemandTrend {
  productId: string
  name: string
  reason: string
}

export const purchaseSuggestionsApi = createApi({
  reducerPath: 'purchaseSuggestionsApi',
  baseQuery,
  tagTypes: ['PurchaseSuggestion'],
  endpoints: (builder) => ({
    getPurchaseSuggestions: builder.query<PurchaseSuggestionsResponse, { horizonDays?: HorizonDays } | void>({
      query: (params) => ({ url: '/purchase-suggestions', params: params?.horizonDays ? { horizonDays: params.horizonDays } : undefined }),
      providesTags: ['PurchaseSuggestion'],
    }),
    getStockoutPredictions: builder.query<StockoutPrediction[], void>({
      query: () => '/stockout-predictions',
      providesTags: ['PurchaseSuggestion'],
    }),
    getDeadStock: builder.query<DeadStockItem[], void>({
      query: () => '/dead-stock',
      providesTags: ['PurchaseSuggestion'],
    }),
    getDemandTrends: builder.query<DemandTrendItem[], void>({
      query: () => '/demand-trends',
      providesTags: ['PurchaseSuggestion'],
    }),
    getTransferSuggestions: builder.query<TransferSuggestion[], void>({
      query: () => '/transfer-suggestions',
      providesTags: ['PurchaseSuggestion'],
    }),
    getSupplierRecommendations: builder.query<SupplierRecommendation[], { productId: string }>({
      query: ({ productId }) => ({ url: '/supplier-recommendations', params: { productId } }),
    }),
    runPurchaseSuggestionsNow: builder.mutation<{ generated: number }, void>({
      query: () => ({ url: '/purchase-suggestions/run', method: 'POST' }),
      invalidatesTags: ['PurchaseSuggestion'],
    }),
  }),
})

export const {
  useGetPurchaseSuggestionsQuery,
  useGetStockoutPredictionsQuery,
  useGetDeadStockQuery,
  useGetDemandTrendsQuery,
  useGetTransferSuggestionsQuery,
  useGetSupplierRecommendationsQuery,
  useRunPurchaseSuggestionsNowMutation,
} = purchaseSuggestionsApi
