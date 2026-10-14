import { useMemo } from 'react'
import { useEngine } from '../engine-context'

/**
 * What every cell needs: its focus registration, "this row is active" on focus, and the
 * shared key handling — Enter goes to the next logical field (never submits anything),
 * Arrow Up / Down move to the same column in the next row.
 */
export function useCell(
  rowId: string,
  key: string,
  opts: { vertical?: boolean } = {}
) {
  const { store, nav } = useEngine()
  const ref = useMemo(() => nav.register(rowId, key), [nav, rowId, key])
  const vertical = opts.vertical !== false
  return useMemo(
    () => ({
      ref,
      onFocus: () => store.setActiveRow(rowId),
      next: () => nav.enter(rowId, key),
      onKeyDown: (e: React.KeyboardEvent) => {
        if (
          e.key === 'Enter' &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          !e.shiftKey
        ) {
          e.preventDefault()
          nav.enter(rowId, key)
        } else if (
          vertical &&
          (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
          !e.altKey
        ) {
          e.preventDefault()
          nav.vertical(rowId, key, e.key === 'ArrowDown' ? 1 : -1)
        }
      },
    }),
    [ref, store, nav, rowId, key, vertical]
  )
}
