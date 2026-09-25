import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

/**
 * Product performance analytics — see server/src/services/productAnalytics.service.js for
 * what counts as a sale (no quotations, no converted-pending duplicates, bill discounts
 * pro-rated onto lines, returns netted by return date). Every money figure here is net of
 * discounts and before tax; quantities are base units.
 */

export type AbcClass = 'A' | 'B' | 'C'
export type Movement = 'fast' | 'steady' | 'slow' | 'no_sales' | 'dead'
export type Granularity = 'day' | 'week' | 'month'

export interface AnalyticsPeriod {
  startDate: string
  endDate: string
  days: number
  previousStartDate: string
  previousEndDate: string
  granularity: Granularity
}

export interface AnalyticsRangeArgs {
  startDate: string
  endDate: string
}

export interface PriceRange {
  minPrice: number
  maxPrice: number
  minCost: number
  maxCost: number
}

export interface ProductMetricsRow {
  productId: string
  name: string
  nameUrdu: string
  image: { url: string } | null
  barcode: string
  sku: string
  unit?: string
  color: string | null
  flag: { color: string; reason?: string } | null
  isActive: boolean
  hasVariants: boolean
  trackImei: boolean
  trackSerial: boolean
  categories: { id: string | null; name: string }[]
  brandId: string | null
  brandName: string | null
  createdAt: string
  price: number
  cost: number
  priceRange: PriceRange | null
  unitsSold: number
  unitsReturned: number
  netUnits: number
  revenue: number
  returnValue: number
  netRevenue: number
  profit: number
  netProfit: number
  cogs: number
  discount: number
  margin: number | null
  invoiceCount: number
  avgSellingPrice: number | null
  returnRate: number | null
  unitsPurchased: number
  purchaseSpend: number
  avgPurchaseCost: number | null
  purchaseCount: number
  unitsReturnedToSupplier: number
  currentStock: number
  stockValue: number
  velocity: number
  daysOfCover: number | null
  sellThrough: number | null
  lastSoldAt: string | null
  lastPurchasedAt: string | null
  daysSinceLastSale: number | null
  daysSinceCreated: number | null
  previous: { netUnits: number; netRevenue: number; netProfit: number; margin: number | null }
  revenueGrowth: number | null
  profitGrowth: number | null
  unitsGrowth: number | null
  revenueDelta: number
  isNew: boolean
  abcClass: AbcClass | null
  revenueShare: number
  movement: Movement
  ranks: { revenue: number | null; profit: number | null; units: number | null }
}

export interface RankedCounts {
  revenue: number
  profit: number
  units: number
}

export type RankingSortField =
  | 'netRevenue'
  | 'netProfit'
  | 'netUnits'
  | 'margin'
  | 'revenueGrowth'
  | 'revenueDelta'
  | 'unitsGrowth'
  | 'velocity'
  | 'daysOfCover'
  | 'sellThrough'
  | 'stockValue'
  | 'currentStock'
  | 'returnRate'
  | 'invoiceCount'
  | 'avgSellingPrice'
  | 'daysSinceLastSale'
  | 'unitsPurchased'
  | 'purchaseSpend'
  | 'name'

export interface RankingsArgs extends AnalyticsRangeArgs {
  sortBy?: RankingSortField
  sortOrder?: 'asc' | 'desc'
  page?: number
  limit?: number
  search?: string
  categoryId?: string
  brandId?: string
  abcClass?: string
  movement?: string
  status?: 'active' | 'inactive'
  stock?: 'in_stock' | 'out_of_stock'
  export?: boolean
}

export interface CategoryFacet {
  id: string
  name: string
  productCount: number
}

export interface RankingsResponse {
  results: ProductMetricsRow[]
  page: number
  limit: number
  totalResults: number
  totalPages: number
  sortBy: RankingSortField
  sortOrder: 'asc' | 'desc'
  rankedCounts: RankedCounts
  /** Filter options counted over the whole catalog, independent of the filters applied. */
  facets: { categories: CategoryFacet[]; uncategorized: number }
  period: AnalyticsPeriod
}

export interface SeriesPoint {
  bucket: string
  unitsSold: number
  revenue: number
  profit: number
  invoiceCount: number
  unitsPurchased: number
  purchaseSpend: number
  avgSellingPrice: number | null
  avgPurchaseCost: number | null
}

export interface LeaderboardRow {
  productId: string
  name: string
  nameUrdu: string
  image: { url: string } | null
  unit?: string
  netRevenue: number
  netProfit: number
  netUnits: number
  margin: number | null
  revenueGrowth: number | null
  revenueDelta: number
  previousRevenue: number
  currentStock: number
  stockValue: number
  daysOfCover: number | null
  velocity: number
  daysSinceLastSale: number | null
  returnRate: number | null
  unitsReturned: number
  abcClass: AbcClass | null
  movement: Movement
  isNew: boolean
}

export interface AnalyticsOverviewResponse {
  period: AnalyticsPeriod
  totals: {
    netRevenue: number
    netProfit: number
    margin: number | null
    netUnits: number
    unitsReturned: number
    returnValue: number
    discount: number
    unitsPurchased: number
    purchaseSpend: number
    stockValue: number
  }
  previous: { netRevenue: number; netProfit: number; netUnits: number; margin: number | null }
  growth: { revenue: number | null; profit: number | null; units: number | null }
  counts: {
    totalProducts: number
    activeProducts: number
    productsSold: number
    fast: number
    steady: number
    slow: number
    noSales: number
    dead: number
    stockoutRisk: number
    newProducts: number
  }
  deadStock: { count: number; value: number }
  abc: Record<AbcClass, { count: number; revenue: number; share: number }>
  leaderboards: {
    topRevenue: LeaderboardRow[]
    topProfit: LeaderboardRow[]
    topUnits: LeaderboardRow[]
    rising: LeaderboardRow[]
    declining: LeaderboardRow[]
    stockoutRisk: LeaderboardRow[]
    deadStock: LeaderboardRow[]
    mostReturned: LeaderboardRow[]
  }
  series: SeriesPoint[]
}

export type InsightSeverity = 'critical' | 'warning' | 'info' | 'positive'

export interface ProductInsight {
  code: string
  severity: InsightSeverity
  params: Record<string, string | number | boolean | null>
}

export interface ProductAnalyticsResponse {
  product: {
    id: string
    name: string
    nameUrdu: string
    description: string
    image: { url: string } | null
    /** Ordered gallery; images[0] is the same photo as `image` above. */
    images: { url: string; sourceUrl?: string }[]
    barcode: string
    sku: string
    unit?: string
    color: string | null
    tags: string[]
    shelfLocation: string
    isActive: boolean
    hasVariants: boolean
    trackImei: boolean
    trackSerial: boolean
    warrantyMonths: number
    flag: { color: string; reason?: string; note?: string } | null
    lowStockThreshold: number | null
    criticalStockThreshold: number | null
    categories: { id: string | null; name: string }[]
    subCategories: { id: string | null; name: string }[]
    brand: { id: string; name: string; logo: string | null } | null
    defaultSupplier: { id: string; name: string; phone: string } | null
    price: number
    cost: number
    priceRange: PriceRange | null
    createdAt: string
    updatedAt: string
  }
  period: AnalyticsPeriod
  metrics: ProductMetricsRow & { lastPurchaseUnitCost: number | null }
  rankedCounts: RankedCounts
  totalProducts: number
  series: SeriesPoint[]
  customers: {
    uniqueCustomers: number
    walkIn: { units: number; revenue: number; invoices: number }
    top: {
      customerId: string
      name: string
      nameUrdu: string
      phone: string
      units: number
      revenue: number
      profit: number
      invoices: number
      lastPurchasedAt: string
    }[]
  }
  suppliers: {
    supplierId: string | null
    name: string
    nameUrdu: string
    phone: string
    units: number
    spend: number
    purchases: number
    avgUnitCost: number | null
    minUnitCost: number | null
    maxUnitCost: number | null
    lastUnitCost: number | null
    lastPurchasedAt: string
  }[]
  supplierWindow: { startDate: string; endDate: string }
  variants: {
    variantId: string
    label: string
    sku: string
    barcode: string
    price: number
    cost: number
    isActive: boolean
    currentStock: number
    unitsSold: number
    revenue: number
    profit: number
    margin: number | null
  }[]
  lastSale: { date: string; invoiceNumber: string; unitPrice: number; invoiceId: string } | null
  lastPurchase: {
    date: string
    invoiceNumber: string
    purchaseId: string
    supplierId: string | null
    supplierName: string | null
    unitCost: number | null
  } | null
  insights: ProductInsight[]
}

export type ActivityType = 'sale' | 'purchase' | 'sale_return' | 'purchase_return' | 'adjustment' | 'transfer'

export interface ActivityRow {
  id: string
  type: ActivityType
  date: string
  referenceId: string
  reference: string | null
  subtype?: string
  status?: string
  note?: string | null
  partyId?: string | null
  partyName: string | null
  quantity: number
  unitPrice?: number | null
  amount?: number | null
  profit?: number
  variantId: string | null
  variantLabel: string | null
  batchNumber?: string | null
  imeis?: (string | { imei?: string; imei2?: string })[]
}

export interface ActivityArgs {
  productId: string
  type?: string
  page?: number
  limit?: number
  startDate?: string
  endDate?: string
}

export interface ActivityResponse {
  results: ActivityRow[]
  page: number
  limit: number
  totalResults: number
  totalPages: number
  summary: Record<ActivityType, { count: number; units: number }>
  types: ActivityType[]
}

export interface ProductMetricsResponse {
  data: Record<
    string,
    Pick<
      ProductMetricsRow,
      'netUnits' | 'netRevenue' | 'netProfit' | 'margin' | 'revenueGrowth' | 'unitsGrowth' | 'daysOfCover' | 'abcClass' | 'movement' | 'ranks' | 'isNew'
    >
  >
  rankedCounts: RankedCounts
  period: AnalyticsPeriod
}

/** Drops empty filter values so they never reach the query string (or split the cache key). */
const compactParams = <T extends object>(args: T) =>
  Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined && value !== '' && value !== null))

// Analytics re-aggregates sales history on the server (with a short shared cache there), so
// a revisit within a minute reuses what's already on screen instead of re-running it.
const ANALYTICS_CACHE_SECONDS = 60

export const productAnalyticsApi = createApi({
  reducerPath: 'productAnalyticsApi',
  baseQuery,
  tagTypes: ['ProductAnalytics'],
  keepUnusedDataFor: ANALYTICS_CACHE_SECONDS,
  endpoints: (builder) => ({
    getProductAnalyticsOverview: builder.query<AnalyticsOverviewResponse, AnalyticsRangeArgs>({
      query: (params) => ({ url: '/products/analytics/overview', params }),
      providesTags: ['ProductAnalytics'],
    }),
    getProductRankings: builder.query<RankingsResponse, RankingsArgs>({
      query: (params) => ({ url: '/products/analytics/rankings', params: compactParams(params) }),
      providesTags: ['ProductAnalytics'],
    }),
    getProductAnalyticsMetrics: builder.query<ProductMetricsResponse, AnalyticsRangeArgs & { ids: string[] }>({
      query: ({ ids, ...range }) => ({ url: '/products/analytics/metrics', params: { ...range, ids: ids.join(',') } }),
      providesTags: ['ProductAnalytics'],
    }),
    getProductAnalytics: builder.query<ProductAnalyticsResponse, AnalyticsRangeArgs & { productId: string }>({
      query: ({ productId, ...params }) => ({ url: `/products/${productId}/analytics`, params }),
      providesTags: (_result, _error, { productId }) => ['ProductAnalytics', { type: 'ProductAnalytics', id: productId }],
    }),
    getProductActivity: builder.query<ActivityResponse, ActivityArgs>({
      query: ({ productId, ...params }) => ({ url: `/products/${productId}/activity`, params: compactParams(params) }),
      providesTags: (_result, _error, { productId }) => ['ProductAnalytics', { type: 'ProductAnalytics', id: productId }],
    }),
  }),
})

export const {
  useGetProductAnalyticsOverviewQuery,
  useGetProductRankingsQuery,
  useLazyGetProductRankingsQuery,
  useGetProductAnalyticsMetricsQuery,
  useGetProductAnalyticsQuery,
  useGetProductActivityQuery,
} = productAnalyticsApi
