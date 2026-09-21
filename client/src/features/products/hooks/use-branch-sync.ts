import { useCallback, useMemo } from 'react'
import { useSelector } from 'react-redux'
import type { RootState } from '@/stores/store'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import {
  useSyncProductsToBranchesMutation,
  type BranchSyncBranchResult,
  type BranchSyncResult,
} from '@/stores/productBranchSync.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { getTimeoutErrorMessage, isRequestTimeoutError } from '@/lib/api-timeout'

/**
 * Products per request. The server takes up to 300, but every request also fans out to
 * each chosen branch, so a smaller chunk keeps a request quick however many branches are
 * ticked — and gives a big first-day sync honest progress. Any chunk can safely be
 * repeated: a branch that already has a product is skipped server-side.
 */
export const SYNC_CHUNK_SIZE = 150

/**
 * The branches the signed-in user can push products to: their other branches. Empty for a
 * shop with one branch — every "sync" control is hidden then, rather than offering to copy
 * a product to nowhere.
 */
export function useSyncTargetBranches() {
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const { data: branches, isLoading } = useGetMyBranchesQuery()
  const targets = useMemo(
    () => (activeBranchId ? (branches ?? []).filter((branch) => branch.id !== activeBranchId) : []),
    [branches, activeBranchId]
  )
  return { targets, isLoading }
}

/** Folds the results of several chunks (each covering different products) into one. */
export function mergeBranchSyncResults(results: BranchSyncResult[]): BranchSyncResult {
  const byBranch = new Map<string, BranchSyncBranchResult>()
  for (const result of results) {
    for (const row of result.branches) {
      const existing = byBranch.get(row.branchId)
      if (!existing) {
        byBranch.set(row.branchId, { ...row, failed: [...row.failed] })
        continue
      }
      existing.syncedCount += row.syncedCount
      existing.alreadyPresentCount += row.alreadyPresentCount
      existing.failedCount += row.failedCount
      existing.failed.push(...row.failed)
      existing.error = existing.error ?? row.error
    }
  }
  return {
    requestedCount: results.reduce((sum, r) => sum + r.requestedCount, 0),
    notFoundCount: results.reduce((sum, r) => sum + r.notFoundCount, 0),
    skipped: results.flatMap((r) => r.skipped),
    branches: [...byBranch.values()],
  }
}

/** Headline numbers for a result: what was created, what was already there, what failed. */
export function summarizeBranchSync(result: BranchSyncResult) {
  return {
    created: result.branches.reduce((sum, b) => sum + b.syncedCount, 0),
    alreadyPresent: result.branches.reduce((sum, b) => sum + b.alreadyPresentCount, 0),
    failed: result.branches.reduce((sum, b) => sum + b.failedCount, 0),
    branchesReached: result.branches.filter((b) => b.syncedCount > 0).length,
  }
}

export interface BranchSyncRun {
  result: BranchSyncResult
  /** Products whose chunk the server answered — equals `total` unless the run stopped early. */
  processed: number
  total: number
  /** A request itself failed (network, timeout, permission) so later chunks were not sent. */
  stoppedEarly: boolean
  errorMessage?: string
}

/**
 * Syncs `productIds` to `branchIds` a chunk at a time, reporting progress after each. A
 * problem with one product or one branch is inside the result (the server answers 200);
 * only a failed request ends the run, and it is reported as `stoppedEarly` with everything
 * done so far — running the same sync again picks up where it left off.
 */
export function useBranchSyncRunner() {
  const [syncChunk] = useSyncProductsToBranchesMutation()

  return useCallback(
    async ({
      productIds,
      branchIds,
      onProgress,
    }: {
      productIds: string[]
      branchIds: string[]
      onProgress?: (processed: number, total: number) => void
    }): Promise<BranchSyncRun> => {
      const total = productIds.length
      const results: BranchSyncResult[] = []
      let processed = 0
      for (let i = 0; i < productIds.length; i += SYNC_CHUNK_SIZE) {
        const chunk = productIds.slice(i, i + SYNC_CHUNK_SIZE)
        try {
          results.push(await syncChunk({ productIds: chunk, branchIds }).unwrap())
        } catch (error) {
          return {
            result: mergeBranchSyncResults(results),
            processed,
            total,
            stoppedEarly: true,
            errorMessage: isRequestTimeoutError(error)
              ? getTimeoutErrorMessage('sync these products')
              : getErrorMessage(error, 'Could not reach the server — please try again'),
          }
        }
        processed += chunk.length
        onProgress?.(processed, total)
      }
      return { result: mergeBranchSyncResults(results), processed, total, stoppedEarly: false }
    },
    [syncChunk]
  )
}
