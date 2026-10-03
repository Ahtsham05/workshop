import { useCallback } from 'react'
import { useDispatch } from 'react-redux'
import type { AppDispatch } from '@/stores/store'
import { stockCountApi, useRecordCountsMutation, type CountEntry, type StockCountLine } from '@/stores/stockCount.api'

/**
 * Saves counts and patches the returned lines straight into the cached sheet — a count of
 * thousands of items must not be refetched after every single entry.
 */
export function useLineSaver(countId: string) {
  const dispatch = useDispatch<AppDispatch>()
  const [record] = useRecordCountsMutation()

  return useCallback(
    async (entries: CountEntry[]): Promise<StockCountLine[]> => {
      const { lines } = await record({ id: countId, entries }).unwrap()
      dispatch(
        stockCountApi.util.updateQueryData('getStockCount', countId, (draft) => {
          const byId = new Map(lines.map((line) => [line.id, line]))
          draft.lines = draft.lines.map((line) => byId.get(line.id) ?? line)
          if (draft.count.progress) {
            draft.count.progress.countedCount = draft.lines.filter((l) => l.countedQty !== null && l.countedQty !== undefined).length
            draft.count.progress.recountCount = draft.lines.filter((l) => l.recount).length
          }
        })
      )
      return lines
    },
    [countId, dispatch, record]
  )
}
