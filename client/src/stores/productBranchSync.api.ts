import { createApi } from '@reduxjs/toolkit/query/react'
import { baseQuery } from './base-query'
import { BATCH_API_TIMEOUT_MS } from '@/lib/api-timeout'

/**
 * "Sync Across Branches" — see server/src/services/productBranchSync.service.js. Copies
 * products from the branch you are working in to your other branches: only ever creates
 * (a branch that already has the product is left alone), stock is never copied.
 */

export interface SyncSkippedProduct {
  productId: string
  name: string
  reason: string
}

export interface SyncBranchPreviewRow {
  branchId: string
  name: string
  /** Products this branch does not have yet — what a sync would create there. */
  missingCount: number
  /** Products this branch already has — left untouched. */
  presentCount: number
}

export interface BranchSyncPreview {
  foundCount: number
  notFoundCount: number
  syncableCount: number
  /** The products a sync would act on, oldest first — what gets synced in chunks. */
  productIds: string[]
  skipped: SyncSkippedProduct[]
  targets: SyncBranchPreviewRow[]
}

export interface BranchSyncBranchResult {
  branchId: string
  branchName: string
  syncedCount: number
  alreadyPresentCount: number
  failedCount: number
  failed: { productId: string | null; name: string | null; error: string }[]
  /** Set when the whole branch could not be written to (the others still went ahead). */
  error?: string
}

export interface BranchSyncResult {
  requestedCount: number
  notFoundCount: number
  skipped: SyncSkippedProduct[]
  branches: BranchSyncBranchResult[]
}

/** Which products to preview: a selection, or everything this branch added today. */
export type BranchSyncPreviewArgs = { productIds: string[] } | { scope: 'addedToday' }

export const productBranchSyncApi = createApi({
  reducerPath: 'productBranchSyncApi',
  baseQuery,
  endpoints: (builder) => ({
    // A POST that only reads — a mutation so every call is fresh and nothing is cached.
    previewBranchSync: builder.mutation<BranchSyncPreview, BranchSyncPreviewArgs>({
      query: (body) => ({ url: '/products/branch-sync/preview', method: 'POST', body }),
    }),
    syncProductsToBranches: builder.mutation<BranchSyncResult, { productIds: string[]; branchIds: string[] }>({
      query: (body) => ({
        url: '/products/branch-sync',
        method: 'POST',
        body,
        timeout: BATCH_API_TIMEOUT_MS,
      }),
    }),
  }),
})

export const { usePreviewBranchSyncMutation, useSyncProductsToBranchesMutation } = productBranchSyncApi
