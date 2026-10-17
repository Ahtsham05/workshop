import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'

/**
 * Product lists — "To order", "Do not order", "Online", "High value", custom. Server:
 * routes/v1/productList.route.js. A manual list holds the products put on it; a smart
 * list is a rule the server evaluates live (always current).
 */

export type ProductListPurpose = 'custom' | 'to_order' | 'do_not_order' | 'online' | 'high_value'
export type ProductListRuleType = 'top_stock_value' | 'top_price' | 'low_stock' | 'out_of_stock' | 'inactive_with_stock'

export interface ProductListRule {
  type: ProductListRuleType
  limit?: number
  threshold?: number | null
  categoryId?: string | null
}

export interface ProductListItem {
  productId: string
  quantity: number | null
  note: string
  addedAt: string
}

export interface ProductListSummary {
  id: string
  name: string
  description: string
  purpose: ProductListPurpose
  color: string | null
  kind: 'manual' | 'smart'
  rule: ProductListRule | null
  pinned: boolean
  /** Manual lists: rows stored (incl. since-deleted products). */
  itemCount: number
  /** Products currently on it (live). */
  productCount: number
  stockQuantity: number
  /** At cost. Omitted from nothing — the route needs viewProducts anyway. */
  stockValue: number
  saleValue: number
  updatedAt?: string
}

export interface ProductListDetail extends ProductListSummary {
  items: ProductListItem[]
}

export interface ProductListInput {
  name?: string
  description?: string
  purpose?: ProductListPurpose
  color?: string | null
  kind?: 'manual' | 'smart'
  rule?: ProductListRule | null
  pinned?: boolean
}

export interface DoNotOrderEntry {
  listId: string
  listName: string
  note: string
}

/** GET /product-lists/:id/insights — read-only decision figures for a list over a period. */
export interface ProductListInsights {
  listId: string
  period: { startDate: string; endDate: string; days: number }
  productCount: number
  inStock: number
  outOfStock: number
  lowStock: number
  stockQuantity: number
  stockValue: number
  saleValue: number
  potentialProfit: number
  unitsSold: number
  revenue: number
  profit: number
  margin: number | null
  sellingProducts: number
  deadStock: number
  deadStockValue: number
  abc: { A: number; B: number; C: number }
}

export const productListApi = createApi({
  reducerPath: 'productListApi',
  baseQuery,
  tagTypes: ['ProductList', 'ProductListFlags'],
  endpoints: (builder) => ({
    getProductLists: builder.query<ProductListSummary[], void>({
      query: () => '/product-lists',
      providesTags: ['ProductList'],
    }),
    getProductList: builder.query<ProductListDetail, string>({
      query: (id) => `/product-lists/${id}`,
      providesTags: (_r, _e, id) => [{ type: 'ProductList', id }],
    }),
    createProductList: builder.mutation<ProductListDetail, ProductListInput>({
      query: (body) => ({ url: '/product-lists', method: 'POST', body }),
      invalidatesTags: ['ProductList', 'ProductListFlags'],
    }),
    updateProductList: builder.mutation<ProductListDetail, { id: string } & ProductListInput>({
      query: ({ id, ...body }) => ({ url: `/product-lists/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['ProductList', 'ProductListFlags'],
    }),
    deleteProductList: builder.mutation<void, string>({
      query: (id) => ({ url: `/product-lists/${id}`, method: 'DELETE' }),
      invalidatesTags: ['ProductList', 'ProductListFlags'],
    }),
    addProductsToList: builder.mutation<
      { added: number; alreadyOnList: number; notFound: number },
      { id: string; productIds: string[]; quantity?: number | null; note?: string }
    >({
      query: ({ id, ...body }) => ({ url: `/product-lists/${id}/products`, method: 'POST', body }),
      invalidatesTags: ['ProductList', 'ProductListFlags'],
    }),
    removeProductsFromList: builder.mutation<{ removed: number }, { id: string; productIds: string[] }>({
      query: ({ id, ...body }) => ({ url: `/product-lists/${id}/products`, method: 'DELETE', body }),
      invalidatesTags: ['ProductList', 'ProductListFlags'],
    }),
    updateProductListItem: builder.mutation<ProductListItem, { id: string; productId: string; quantity?: number | null; note?: string }>({
      query: ({ id, productId, ...body }) => ({ url: `/product-lists/${id}/products/${productId}`, method: 'PATCH', body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: 'ProductList', id }],
    }),
    getProductListMemberships: builder.query<Record<string, string[]>, string[]>({
      query: (productIds) => ({ url: '/product-lists/memberships', params: { productIds: productIds.join(',') } }),
      providesTags: ['ProductList'],
    }),
    /** productId → the "Do not order" list it is on. Read by the purchase screens. */
    getDoNotOrderProducts: builder.query<Record<string, DoNotOrderEntry>, void>({
      query: () => '/product-lists/do-not-order',
      providesTags: ['ProductListFlags'],
      keepUnusedDataFor: 300,
    }),
    getProductListInsights: builder.query<ProductListInsights, { id: string; startDate: string; endDate: string }>({
      query: ({ id, ...params }) => ({ url: `/product-lists/${id}/insights`, params }),
      providesTags: (_r, _e, { id }) => [{ type: 'ProductList', id }, 'ProductList'],
    }),
    getProductListOrderLines: builder.query<{ productId: string; quantity: number | null }[], string>({
      query: (id) => `/product-lists/${id}/order-lines`,
      keepUnusedDataFor: 0,
    }),
  }),
})

export const {
  useGetProductListsQuery,
  useGetProductListQuery,
  useCreateProductListMutation,
  useUpdateProductListMutation,
  useDeleteProductListMutation,
  useAddProductsToListMutation,
  useRemoveProductsFromListMutation,
  useUpdateProductListItemMutation,
  useGetProductListMembershipsQuery,
  useGetDoNotOrderProductsQuery,
  useLazyGetProductListOrderLinesQuery,
  useGetProductListInsightsQuery,
} = productListApi
