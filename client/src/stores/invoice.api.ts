import { createApi } from '@reduxjs/toolkit/query/react'
import { createAppFetchBaseQuery } from './app-fetch-base-query'
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query'
import { imeiApi } from './imei.api'
import { purchaseCatalogApi } from './purchaseCatalog.api'
import { batchApi } from './batch.api'
import { invalidateWalletCaches } from './wallet-cache-invalidation'

/** Invoice mutations live in separate RTK Query slices from imeiApi/purchaseCatalogApi/
 *  batchApi/the wallet-cache slices, so a sale's effect on stock/IMEI status, or on the
 *  cash book / bank account balance (invoices post cash-book + wallet entries server-side),
 *  doesn't auto-invalidate the IMEI picker, the product catalog's stock+batch chips, the
 *  per-variant batch list, or the Bank Accounts/Cash Book/Bank Statement/Reconciliation
 *  pages — those would otherwise stay stale (showing the pre-invoice balance) until an
 *  unrelated action happens to refetch them, or a full page reload. Force that refresh
 *  explicitly whenever an invoice is created/updated/deleted/cancelled/converted, or paid. */
const invalidateDownstreamCaches = async (_arg: unknown, { dispatch, queryFulfilled }: any) => {
  try {
    await queryFulfilled
    dispatch(imeiApi.util.invalidateTags(['Imei']))
    dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
    dispatch(batchApi.util.invalidateTags(['Batch']))
    invalidateWalletCaches(dispatch)
  } catch {
    // mutation failed — nothing to invalidate
  }
}

/** Decrements just the sold rows' stock (and batch quantity, if batch-tracked) in the
 *  purchase-catalog cache in place. Used on invoice *creation* — by far the most
 *  frequent mutation — so a sale doesn't force a full unpaginated refetch of the whole
 *  product catalog (every product, with nested batches/stockout history) just to reflect
 *  a stock change on the handful of items actually sold. */
const patchPurchaseCatalogStockForSale = (dispatch: any, invoiceData: any) => {
  const items = invoiceData?.items
  if (invoiceData?.type === 'quotation' || !Array.isArray(items) || items.length === 0) return

  dispatch(
    purchaseCatalogApi.util.updateQueryData('getPurchasableCatalog', undefined, (draft: any[]) => {
      items.forEach((item: any) => {
        const qty = Number(item.stockQuantity ?? item.quantity ?? 0)
        if (!qty || !item.productId) return

        const row = item.variantId
          ? draft.find((r) => r.variantId === item.variantId)
          : draft.find((r) => r.productId === item.productId && r.type === 'product')
        if (!row) return

        row.stockQuantity = Math.max(0, Number(row.stockQuantity || 0) - qty)

        if (!row.batches) return

        // A line can be split across several batches — an auto FEFO split, or a
        // serial/IMEI-tracked line where different scanned units belong to different
        // batches (see updateItemImeis in invoice-panel.tsx) — so walk every allocation
        // instead of assuming the whole line's qty came from one batch. Mirrors the
        // server's own fallback (getItemBatchAllocations in invoice.service.js): use
        // batchAllocations when present, else treat batchId as a single allocation of
        // the full line quantity. Decrementing only the first/display batch by the
        // whole qty (the old behavior) left every other batch in the split showing a
        // stale "left" count until something else forced a refetch.
        const allocations = Array.isArray(item.batchAllocations) && item.batchAllocations.length > 0
          ? item.batchAllocations
          : item.batchId
            ? [{ batchId: item.batchId, quantity: qty }]
            : []

        allocations.forEach((alloc: any) => {
          const batch = row.batches.find((b: any) => b.id === alloc.batchId)
          if (batch) batch.quantity = Math.max(0, Number(batch.quantity || 0) - Number(alloc.quantity || 0))
        })
      })
    }),
  )
}

const onInvoiceCreated = async (invoiceData: any, { dispatch, queryFulfilled }: any) => {
  try {
    await queryFulfilled
    dispatch(imeiApi.util.invalidateTags(['Imei']))
    dispatch(batchApi.util.invalidateTags(['Batch']))
    invalidateWalletCaches(dispatch)
    patchPurchaseCatalogStockForSale(dispatch, invoiceData)
  } catch {
    // mutation failed — nothing to invalidate
  }
}

const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'

// Custom base query with auth handling
const baseQueryWithAuth: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  const baseQuery = createAppFetchBaseQuery({
    baseUrl: `${baseUrl}/invoices`,
    prepareHeaders: (headers) => {
      // Get token from localStorage (same way as existing Axios setup)
      const token = localStorage.getItem('accessToken')
      if (token) {
        headers.set('authorization', `Bearer ${token}`)
      }
      const activeBranchId = localStorage.getItem('activeBranchId')
      if (activeBranchId) {
        headers.set('x-branch-id', activeBranchId)
      }
      return headers
    },
  })

  const result = await baseQuery(args, api, extraOptions)
  
  // Handle 401 errors
  if (result.error && result.error.status === 401) {
    // Token might be expired, you could implement refresh logic here
    // For now, we'll just return the error
    console.error('Authentication failed. Please login again.')
  }
  
  return result
}

export const invoiceApi = createApi({
  reducerPath: 'invoiceApi',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['Invoice'],
  endpoints: (builder) => ({
    // Create invoice
    createInvoice: builder.mutation({
      query: (invoiceData) => ({
        url: '',
        method: 'POST',
        body: invoiceData,
      }),
      invalidatesTags: ['Invoice'],
      onQueryStarted: onInvoiceCreated,
    }),

    // Get all invoices
    getInvoices: builder.query({
      query: (params = {}) => ({
        url: '',
        params,
      }),
      providesTags: ['Invoice'],
    }),

    // Get invoice by ID
    getInvoiceById: builder.query({
      query: (id) => `/${id}`,
      providesTags: (id) => [{ type: 'Invoice', id }],
    }),

    // Update invoice
    updateInvoice: builder.mutation({
      query: ({ id, ...patch }) => ({
        url: `/${id}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: ( { id }) => [{ type: 'Invoice', id }, 'Invoice'],
      onQueryStarted: invalidateDownstreamCaches,
    }),

    // Delete invoice
    deleteInvoice: builder.mutation({
      query: (id) => ({
        url: `/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Invoice'],
      onQueryStarted: invalidateDownstreamCaches,
    }),

    // Finalize invoice
    finalizeInvoice: builder.mutation({
      query: (id) => ({
        url: `/${id}/finalize`,
        method: 'PATCH',
      }),
      invalidatesTags: ( id) => [{ type: 'Invoice', id }],
      onQueryStarted: invalidateDownstreamCaches,
    }),

    // Process payment
    processPayment: builder.mutation({
      query: ({ id, paymentData }) => ({
        url: `/${id}/payment`,
        method: 'POST',
        body: paymentData,
      }),
      invalidatesTags: ( { id }) => [{ type: 'Invoice', id }],
      onQueryStarted: invalidateDownstreamCaches,
    }),

    // Cancel invoice
    cancelInvoice: builder.mutation({
      query: (id) => ({
        url: `/${id}/cancel`,
        method: 'PATCH',
      }),
      invalidatesTags: (id) => [{ type: 'Invoice', id }],
      onQueryStarted: invalidateDownstreamCaches,
    }),

    // Duplicate invoice
    duplicateInvoice: builder.mutation({
      query: (id) => ({
        url: `/${id}/duplicate`,
        method: 'POST',
      }),
      invalidatesTags: ['Invoice'],
    }),

    // Convert quotation to cash/credit invoice
    convertQuotation: builder.mutation({
      query: ({ id, ...body }) => ({
        url: `/${id}/convert-quotation`,
        method: 'POST',
        body,
      }),
      invalidatesTags: ['Invoice'],
      onQueryStarted: invalidateDownstreamCaches,
    }),

    // Get invoice statistics
    getInvoiceStatistics: builder.query({
      query: (params = {}) => ({
        url: '/statistics',
        params,
      }),
    }),

    // Get daily sales report
    getDailySalesReport: builder.query({
      query: (date) => ({
        url: '/reports/daily',
        params: date ? { date } : {},
      }),
    }),

    // Get outstanding invoices
    getOutstandingInvoices: builder.query({
      query: (params = {}) => ({
        url: '/outstanding',
        params,
      }),
      providesTags: ['Invoice'],
    }),

    // Get invoices by customer
    getInvoicesByCustomer: builder.query({
      query: ({ customerId, ...params }) => ({
        url: `/customer/${customerId}`,
        params,
      }),
      providesTags: ['Invoice'],
    }),

    // Generate bill number
    generateBillNumber: builder.query({
      query: () => '/generate-bill-number',
    }),

    // Preview the invoice number the next save would receive (see next-number route) —
    // not reserved, just what the New Invoice form shows before an invoice exists to save.
    // Tagged 'Invoice' so it refetches after createInvoice — otherwise the preview would
    // keep showing the number that was just used until something else invalidates it.
    getNextInvoiceNumber: builder.query({
      query: (type) => ({
        url: '/next-number',
        params: type ? { type } : {},
      }),
      providesTags: ['Invoice'],
    }),

    // Get customer product history
    getCustomerProductHistory: builder.query({
      query: ({ customerId, productId }) => ({
        url: `/customer/${customerId}/product/${productId}/history`,
      }),
    }),

    // Per-customer pending (goods-handoff) invoice summary — count, total, and
    // previous/current ledger balance for every customer who has unconverted pending invoices.
    getPendingInvoiceSummaryByCustomer: builder.query({
      query: () => '/pending-summary',
      providesTags: ['Invoice'],
    }),
  }),
})

export const {
  useCreateInvoiceMutation,
  useGetInvoicesQuery,
  useLazyGetInvoicesQuery,
  useGetInvoiceByIdQuery,
  useUpdateInvoiceMutation,
  useDeleteInvoiceMutation,
  useFinalizeInvoiceMutation,
  useProcessPaymentMutation,
  useCancelInvoiceMutation,
  useDuplicateInvoiceMutation,
  useConvertQuotationMutation,
  useGetInvoiceStatisticsQuery,
  useGetDailySalesReportQuery,
  useGetOutstandingInvoicesQuery,
  useGetInvoicesByCustomerQuery,
  useGenerateBillNumberQuery,
  useGetNextInvoiceNumberQuery,
  useLazyGetNextInvoiceNumberQuery,
  useGetCustomerProductHistoryQuery,
  useGetPendingInvoiceSummaryByCustomerQuery,
} = invoiceApi
