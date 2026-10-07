import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { inventoryApi } from './inventory.api'
import { productApi } from './product.api'
import { purchaseCatalogApi } from './purchaseCatalog.api'

/**
 * Manufacturing module (server: routes/v1/manufacturing.route.js). Issues, receipts and
 * finished-goods scrap move real branch stock, so — like stockAdjustment.api.ts — they
 * also refresh the product catalog caches that live in other RTK Query slices.
 */
// Same untyped lifecycle signature as stockAdjustment.api.ts — it's shared by three
// mutations with different arg/result types.
const invalidateStockCaches = async (
  _arg: unknown,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  { dispatch, queryFulfilled }: any
) => {
  try {
    await queryFulfilled
    dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
    dispatch(productApi.util.invalidateTags(['Product']))
    dispatch(inventoryApi.util.invalidateTags(['Inventory'] as never))
  } catch {
    // mutation failed — nothing to invalidate
  }
}

// ── Shared types ──────────────────────────────────────────────────────────────────
export type ProductType =
  | 'raw_material'
  | 'component'
  | 'packaging_material'
  | 'sub_assembly'
  | 'wip'
  | 'finished_good'
  | 'by_product'
  | 'scrap'
  | 'service'
export type ProcurementType = 'buy' | 'make' | 'buy_or_make'
export type ProductionStatus =
  | 'draft'
  | 'planned'
  | 'released'
  | 'in_production'
  | 'paused'
  | 'completed'
  | 'cancelled'
export type ProductionPriority = 'low' | 'normal' | 'high' | 'urgent'
export type ScrapStage = 'material' | 'wip' | 'finished_good'
export type ScrapReason =
  | 'defect'
  | 'damage'
  | 'process_loss'
  | 'expired'
  | 'setup'
  | 'rework'
  | 'other'

export interface Paginated<T> {
  results: T[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
}

type Ref = string | { id?: string; _id?: string; name?: string; email?: string }

export interface ManufacturingProduct {
  id: string
  name: string
  nameUrdu?: string
  sku?: string
  barcode?: string
  unit: string
  cost: number
  price: number
  stockQuantity: number
  hasVariants: boolean
  isActive: boolean
  image?: { url?: string }
  productType: ProductType | null
  procurementType: ProcurementType | null
  defaultBomId: string | null
  manufacturingLeadTimeDays: number | null
  bomCount: number
  activeBomCount: number
}

export interface BomAlternative {
  productId: string
  variantId?: string | null
  productName?: string
  ratio: number
}

export interface BomComponent {
  _id?: string
  productId: string
  variantId?: string | null
  productName?: string
  sku?: string
  quantity: number
  unit: string
  scrapPercent: number
  isOptional: boolean
  childBomId?: string | null
  alternatives: BomAlternative[]
  notes?: string
  sequence?: number
}

export interface Bom {
  id: string
  bomNumber: string
  version: number
  name: string
  productId: string
  variantId?: string | null
  productName: string
  quantity: number
  unit: string
  components: BomComponent[]
  notes?: string
  isActive: boolean
  isDefault: boolean
  isLocked: boolean
  effectiveFrom?: string | null
  effectiveTo?: string | null
  createdAt: string
  updatedAt: string
}

export interface BomInput {
  productId?: string
  variantId?: string | null
  name?: string
  quantity?: number
  unit?: string
  components?: Omit<BomComponent, 'productName' | 'sku'>[]
  notes?: string
  isActive?: boolean
  isDefault?: boolean
  effectiveFrom?: string | null
  effectiveTo?: string | null
}

export interface BomTreeNode {
  componentId?: string
  productId: string
  variantId?: string | null
  productName: string
  sku?: string
  unit: string
  baseQuantity: number
  requiredQuantity: number
  scrapPercent: number
  isOptional: boolean
  level: number
  alternatives: BomAlternative[]
  childBom: { id: string; bomNumber: string; version: number } | null
  children: BomTreeNode[]
}

export interface BomExplosion {
  tree: {
    bomId: string
    bomNumber: string
    version: number
    productId: string
    productName: string
    quantity: number
    unit: string
    children: BomTreeNode[]
  }
  lines: Omit<
    BomTreeNode,
    'children' | 'childBom' | 'componentId' | 'scrapPercent'
  >[]
}

export interface WhereUsedEntry {
  id: string
  bomNumber: string
  version: number
  name: string
  productId: string
  productName: string
  isActive: boolean
  isDefault: boolean
  quantity: number
  unit?: string
}

export interface ProductionMaterial {
  _id: string
  productId: string
  variantId?: string | null
  productName: string
  sku?: string
  unit: string
  baseQuantity: number
  requiredQuantity: number
  issuedQuantity: number
  issuedCost: number
  scrappedQuantity: number
  isOptional: boolean
  level: number
  alternatives: BomAlternative[]
}

export interface ProductionOrder {
  id: string
  orderNumber: string
  productId: string
  variantId?: string | null
  productName: string
  sku?: string
  unit: string
  bomId?: string | null
  bomNumber?: string
  bomVersion?: number
  plannedQuantity: number
  completedQuantity: number
  scrappedQuantity: number
  plannedStartDate?: string | null
  plannedCompletionDate?: string | null
  actualStartDate?: string | null
  actualCompletionDate?: string | null
  sourceLocation: string
  wipLocation: string
  finishedGoodsLocation: string
  status: ProductionStatus
  priority: ProductionPriority
  notes?: string
  materials: ProductionMaterial[]
  materialCost: number
  finishedGoodsValue: number
  statusHistory: {
    from?: string | null
    to: ProductionStatus
    note?: string
    by?: string
    at: string
  }[]
  createdBy?: Ref
  createdAt: string
  updatedAt: string
}

export interface ProductionOrderInput {
  productId?: string
  variantId?: string | null
  bomId?: string | null
  plannedQuantity?: number
  plannedStartDate?: string | null
  plannedCompletionDate?: string | null
  sourceLocation?: string
  wipLocation?: string
  finishedGoodsLocation?: string
  priority?: ProductionPriority
  notes?: string
  status?: 'draft' | 'planned'
}

export interface RequirementLine {
  materialLineId?: string
  branchId?: string
  productId: string
  variantId?: string | null
  productName: string
  sku?: string
  unit: string
  level?: number
  isOptional?: boolean
  requiredQuantity: number
  issuedQuantity?: number
  outstandingQuantity?: number
  availableQuantity: number
  shortageQuantity: number
  alternatives?: BomAlternative[]
  orders?: {
    orderId: string
    orderNumber: string
    status: ProductionStatus
    quantity: number
  }[]
}

export interface OrderRequirements {
  orderId: string
  orderNumber: string
  status: ProductionStatus
  lines: RequirementLine[]
  shortageCount: number
}

export interface AggregatedRequirements {
  orderCount: number
  materialCount: number
  shortageCount: number
  lines: RequirementLine[]
}

export interface MaterialIssue {
  id: string
  issueNumber: string
  productionOrderId: string
  orderNumber: string
  issueDate: string
  lines: {
    materialLineId: string
    productId: string
    productName: string
    unit: string
    quantity: number
    creditedQuantity: number
    isAlternative: boolean
    unitCost: number
    totalCost: number
    balanceAfter?: number
  }[]
  totalCost: number
  notes?: string
  createdBy?: Ref
  createdAt: string
}

export interface ProductionReceipt {
  id: string
  receiptNumber: string
  productionOrderId: string
  orderNumber: string
  productId: string
  productName: string
  unit: string
  quantity: number
  unitCost: number
  totalCost: number
  location?: string
  receiptDate: string
  balanceAfter?: number
  notes?: string
  createdBy?: Ref
  createdAt: string
}

export interface ScrapRecord {
  id: string
  scrapNumber: string
  productionOrderId?: string | null
  orderNumber?: string
  productId: string
  productName: string
  unit: string
  stage: ScrapStage
  reason: ScrapReason
  quantity: number
  unitCost: number
  totalCost: number
  affectsStock: boolean
  scrapDate: string
  notes?: string
  createdBy?: Ref
  createdAt: string
}

export interface WipRow {
  id: string
  orderNumber: string
  productName: string
  sku?: string
  unit: string
  status: ProductionStatus
  priority: ProductionPriority
  plannedQuantity: number
  completedQuantity: number
  scrappedQuantity: number
  remainingQuantity: number
  materialIssuedPercent: number
  outputPercent: number
  materialCost: number
  finishedGoodsValue: number
  wipValue: number
  wipLocation?: string
  plannedStartDate?: string | null
  plannedCompletionDate?: string | null
  actualStartDate?: string | null
  isOverdue: boolean
}

export interface WipSummary {
  orders: WipRow[]
  totals: {
    orderCount: number
    wipValue: number
    materialCost: number
    overdueCount: number
  }
}

export interface Assembly
  extends Omit<ManufacturingProduct, 'bomCount' | 'activeBomCount'> {
  defaultBom: {
    id: string
    bomNumber: string
    version: number
    quantity: number
    unit: string
    componentCount: number
    isLocked: boolean
  } | null
  usedIn: {
    id: string
    bomNumber: string
    version: number
    productName: string
    isActive: boolean
  }[]
}

export interface DashboardOrder {
  id: string
  orderNumber: string
  productName: string
  plannedQuantity: number
  completedQuantity: number
  unit: string
  status: ProductionStatus
  priority: ProductionPriority
  plannedCompletionDate?: string | null
  createdAt?: string
}

export interface ManufacturingDashboard {
  byStatus: Record<ProductionStatus, number>
  openOrders: number
  inProgress: number
  overdue: number
  wipValue: number
  month: {
    producedQuantity: number
    producedValue: number
    receiptCount: number
    materialIssuedValue: number
    issueCount: number
    scrapQuantity: number
    scrapValue: number
    scrapCount: number
  }
  activeBoms: number
  productTypes: Record<ProductType | 'unclassified', number>
  dueSoon: DashboardOrder[]
  recentOrders: DashboardOrder[]
  outputTrend: { date: string; quantity: number; value: number }[]
  shortages: RequirementLine[]
  shortageCount: number
}

export interface ManufacturingSettings {
  id: string
  prefixes: {
    bom: string
    productionOrder: string
    materialIssue: string
    productionReceipt: string
    scrap: string
  }
  numberPadding: number
  defaultSourceLocation: string
  defaultWipLocation: string
  defaultFinishedGoodsLocation: string
  allowNegativeStockIssue: boolean
  allowOverProduction: boolean
  requireBomForProduction: boolean
  explodeSubAssemblies: boolean
  defaultPriority: ProductionPriority
  counters: Record<string, number>
}

interface ListParams {
  page?: number
  limit?: number
  search?: string
  sortBy?: string
}

const TAGS = [
  'MfgDashboard',
  'MfgProduct',
  'MfgBom',
  'MfgOrder',
  'MfgRequirements',
  'MfgIssue',
  'MfgReceipt',
  'MfgScrap',
  'MfgWip',
  'MfgSettings',
] as const

/** Everything a stock movement can change. */
const EXECUTION_TAGS = [
  'MfgDashboard',
  'MfgOrder',
  'MfgRequirements',
  'MfgIssue',
  'MfgReceipt',
  'MfgScrap',
  'MfgWip',
  'MfgProduct',
] as const

export const manufacturingApi = createApi({
  reducerPath: 'manufacturingApi',
  baseQuery,
  tagTypes: TAGS,
  endpoints: (builder) => ({
    getManufacturingDashboard: builder.query<ManufacturingDashboard, void>({
      query: () => '/manufacturing/dashboard',
      providesTags: ['MfgDashboard'],
    }),

    // Settings
    getManufacturingSettings: builder.query<ManufacturingSettings, void>({
      query: () => '/manufacturing/settings',
      providesTags: ['MfgSettings'],
    }),
    updateManufacturingSettings: builder.mutation<
      ManufacturingSettings,
      Partial<ManufacturingSettings>
    >({
      query: (body) => ({
        url: '/manufacturing/settings',
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['MfgSettings'],
    }),

    // Products
    getManufacturingProducts: builder.query<
      Paginated<ManufacturingProduct>,
      ListParams & {
        productType?: string
        classifiedOnly?: boolean
        hasBom?: boolean
      }
    >({
      query: (params) => ({ url: '/manufacturing/products', params }),
      providesTags: ['MfgProduct'],
    }),
    getProductTypeSummary: builder.query<
      Record<ProductType | 'unclassified', number>,
      void
    >({
      query: () => '/manufacturing/products/type-summary',
      providesTags: ['MfgProduct'],
    }),
    updateManufacturingProduct: builder.mutation<
      ManufacturingProduct,
      {
        productId: string
        productType?: ProductType | null
        procurementType?: ProcurementType | null
        manufacturingLeadTimeDays?: number | null
        defaultBomId?: string | null
      }
    >({
      query: ({ productId, ...body }) => ({
        url: `/manufacturing/products/${productId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['MfgProduct', 'MfgBom', 'MfgDashboard'],
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          await queryFulfilled
          dispatch(productApi.util.invalidateTags(['Product']))
        } catch {
          // ignore
        }
      },
    }),
    bulkClassifyProducts: builder.mutation<
      { matched: number; modified: number },
      {
        productIds: string[]
        productType: ProductType | null
        procurementType?: ProcurementType | null
      }
    >({
      query: (body) => ({
        url: '/manufacturing/products/bulk-classify',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MfgProduct', 'MfgDashboard'],
    }),
    getWhereUsed: builder.query<WhereUsedEntry[], string>({
      query: (productId) => `/manufacturing/products/${productId}/where-used`,
      providesTags: ['MfgBom'],
    }),
    getAssemblies: builder.query<Assembly[], void>({
      query: () => '/manufacturing/assemblies',
      providesTags: ['MfgBom', 'MfgProduct'],
    }),

    // BOMs
    getBoms: builder.query<
      Paginated<Bom>,
      ListParams & {
        productId?: string
        isActive?: boolean
        isDefault?: boolean
        bomNumber?: string
      }
    >({
      query: (params) => ({ url: '/manufacturing/boms', params }),
      providesTags: ['MfgBom'],
    }),
    getBom: builder.query<Bom, string>({
      query: (id) => `/manufacturing/boms/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'MfgBom', id }],
    }),
    getBomVersions: builder.query<Bom[], string>({
      query: (id) => `/manufacturing/boms/${id}/versions`,
      providesTags: ['MfgBom'],
    }),
    explodeBom: builder.query<
      BomExplosion,
      { bomId: string; quantity?: number; explode?: boolean }
    >({
      query: ({ bomId, ...params }) => ({
        url: `/manufacturing/boms/${bomId}/explode`,
        params,
      }),
      providesTags: ['MfgBom'],
    }),
    createBom: builder.mutation<Bom, BomInput>({
      query: (body) => ({ url: '/manufacturing/boms', method: 'POST', body }),
      invalidatesTags: ['MfgBom', 'MfgProduct', 'MfgDashboard'],
    }),
    updateBom: builder.mutation<Bom, { bomId: string } & BomInput>({
      query: ({ bomId, ...body }) => ({
        url: `/manufacturing/boms/${bomId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['MfgBom', 'MfgProduct', 'MfgDashboard'],
    }),
    createBomVersion: builder.mutation<Bom, { bomId: string } & BomInput>({
      query: ({ bomId, ...body }) => ({
        url: `/manufacturing/boms/${bomId}/versions`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MfgBom', 'MfgProduct', 'MfgDashboard'],
    }),
    setDefaultBom: builder.mutation<Bom, string>({
      query: (bomId) => ({
        url: `/manufacturing/boms/${bomId}/set-default`,
        method: 'POST',
      }),
      invalidatesTags: ['MfgBom', 'MfgProduct'],
    }),
    setBomActive: builder.mutation<Bom, { bomId: string; isActive: boolean }>({
      query: ({ bomId, isActive }) => ({
        url: `/manufacturing/boms/${bomId}/set-active`,
        method: 'POST',
        body: { isActive },
      }),
      invalidatesTags: ['MfgBom', 'MfgProduct', 'MfgDashboard'],
    }),
    deleteBom: builder.mutation<void, string>({
      query: (bomId) => ({
        url: `/manufacturing/boms/${bomId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['MfgBom', 'MfgProduct', 'MfgDashboard'],
    }),

    // Production orders
    getProductionOrders: builder.query<
      Paginated<ProductionOrder>,
      ListParams & {
        status?: string
        priority?: ProductionPriority
        productId?: string
        overdue?: boolean
      }
    >({
      query: (params) => ({ url: '/manufacturing/production-orders', params }),
      providesTags: ['MfgOrder'],
    }),
    getProductionOrder: builder.query<ProductionOrder, string>({
      query: (id) => `/manufacturing/production-orders/${id}`,
      providesTags: (_r, _e, id) => ['MfgOrder', { type: 'MfgOrder', id }],
    }),
    createProductionOrder: builder.mutation<
      ProductionOrder,
      ProductionOrderInput
    >({
      query: (body) => ({
        url: '/manufacturing/production-orders',
        method: 'POST',
        body,
      }),
      invalidatesTags: ['MfgOrder', 'MfgDashboard', 'MfgRequirements'],
    }),
    updateProductionOrder: builder.mutation<
      ProductionOrder,
      { orderId: string } & ProductionOrderInput
    >({
      query: ({ orderId, ...body }) => ({
        url: `/manufacturing/production-orders/${orderId}`,
        method: 'PATCH',
        body,
      }),
      invalidatesTags: ['MfgOrder', 'MfgDashboard', 'MfgRequirements'],
    }),
    refreshProductionMaterials: builder.mutation<ProductionOrder, string>({
      query: (orderId) => ({
        url: `/manufacturing/production-orders/${orderId}/refresh-materials`,
        method: 'POST',
      }),
      invalidatesTags: ['MfgOrder', 'MfgRequirements'],
    }),
    changeProductionStatus: builder.mutation<
      ProductionOrder,
      { orderId: string; status: ProductionStatus; note?: string }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/manufacturing/production-orders/${orderId}/status`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [
        'MfgOrder',
        'MfgDashboard',
        'MfgRequirements',
        'MfgWip',
        'MfgBom',
      ],
    }),
    deleteProductionOrder: builder.mutation<void, string>({
      query: (orderId) => ({
        url: `/manufacturing/production-orders/${orderId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['MfgOrder', 'MfgDashboard', 'MfgRequirements'],
    }),
    getOrderRequirements: builder.query<OrderRequirements, string>({
      query: (orderId) =>
        `/manufacturing/production-orders/${orderId}/requirements`,
      providesTags: ['MfgRequirements'],
    }),
    getRequirements: builder.query<
      AggregatedRequirements,
      { statuses?: string } | void
    >({
      query: (params) => ({
        url: '/manufacturing/requirements',
        params: params ?? undefined,
      }),
      providesTags: ['MfgRequirements'],
    }),

    // Execution
    issueMaterials: builder.mutation<
      MaterialIssue,
      {
        orderId: string
        lines: {
          materialLineId: string
          quantity: number
          alternativeProductId?: string | null
        }[]
        notes?: string
        issueDate?: string
      }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/manufacturing/production-orders/${orderId}/issue`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    receiveFinishedGoods: builder.mutation<
      ProductionReceipt,
      {
        orderId: string
        quantity: number
        location?: string
        notes?: string
        receiptDate?: string
      }
    >({
      query: ({ orderId, ...body }) => ({
        url: `/manufacturing/production-orders/${orderId}/receive`,
        method: 'POST',
        body,
      }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    recordScrap: builder.mutation<
      ScrapRecord,
      {
        productionOrderId?: string | null
        stage: ScrapStage
        materialLineId?: string
        productId?: string
        quantity: number
        reason?: ScrapReason
        notes?: string
      }
    >({
      query: (body) => ({ url: '/manufacturing/scrap', method: 'POST', body }),
      invalidatesTags: [...EXECUTION_TAGS],
      onQueryStarted: invalidateStockCaches,
    }),
    getMaterialIssues: builder.query<
      Paginated<MaterialIssue>,
      ListParams & {
        productionOrderId?: string
        dateFrom?: string
        dateTo?: string
      }
    >({
      query: (params) => ({ url: '/manufacturing/material-issues', params }),
      providesTags: ['MfgIssue'],
    }),
    getProductionReceipts: builder.query<
      Paginated<ProductionReceipt>,
      ListParams & {
        productionOrderId?: string
        dateFrom?: string
        dateTo?: string
      }
    >({
      query: (params) => ({ url: '/manufacturing/finished-goods', params }),
      providesTags: ['MfgReceipt'],
    }),
    getScrapRecords: builder.query<
      Paginated<ScrapRecord>,
      ListParams & {
        productionOrderId?: string
        stage?: ScrapStage
        reason?: ScrapReason
        dateFrom?: string
        dateTo?: string
      }
    >({
      query: (params) => ({ url: '/manufacturing/scrap', params }),
      providesTags: ['MfgScrap'],
    }),
    getWip: builder.query<WipSummary, void>({
      query: () => '/manufacturing/wip',
      providesTags: ['MfgWip'],
    }),
  }),
})

export const {
  useGetManufacturingDashboardQuery,
  useGetManufacturingSettingsQuery,
  useUpdateManufacturingSettingsMutation,
  useGetManufacturingProductsQuery,
  useGetProductTypeSummaryQuery,
  useUpdateManufacturingProductMutation,
  useBulkClassifyProductsMutation,
  useGetWhereUsedQuery,
  useGetAssembliesQuery,
  useGetBomsQuery,
  useGetBomQuery,
  useGetBomVersionsQuery,
  useExplodeBomQuery,
  useCreateBomMutation,
  useUpdateBomMutation,
  useCreateBomVersionMutation,
  useSetDefaultBomMutation,
  useSetBomActiveMutation,
  useDeleteBomMutation,
  useGetProductionOrdersQuery,
  useGetProductionOrderQuery,
  useCreateProductionOrderMutation,
  useUpdateProductionOrderMutation,
  useRefreshProductionMaterialsMutation,
  useChangeProductionStatusMutation,
  useDeleteProductionOrderMutation,
  useGetOrderRequirementsQuery,
  useGetRequirementsQuery,
  useIssueMaterialsMutation,
  useReceiveFinishedGoodsMutation,
  useRecordScrapMutation,
  useGetMaterialIssuesQuery,
  useGetProductionReceiptsQuery,
  useGetScrapRecordsQuery,
  useGetWipQuery,
} = manufacturingApi
