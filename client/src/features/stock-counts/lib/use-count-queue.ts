import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import type { AppDispatch } from '@/stores/store'
import { stockCountApi, useRecordCountsMutation, type CountEntry, type StockCountLine, type VarianceReason } from '@/stores/stockCount.api'

/** What is waiting to be saved for one line. `qty: null` clears the count. Always absolute, so re-sending is harmless. */
export interface PendingChange {
  qty?: number | null
  reason?: VarianceReason | null
  note?: string
  newCost?: number | null
}

export type QueuedLine = StockCountLine & { pending?: boolean }
export type QueueStatus = 'idle' | 'saving' | 'error'

const MAX_BATCH = 300
const storageKey = (countId: string) => `stockCount.pending.${countId}`

const merge = (older?: PendingChange, newer?: PendingChange): PendingChange | undefined =>
  older || newer ? { ...(older ?? {}), ...(newer ?? {}) } : undefined

const toEntry = (lineId: string, change: PendingChange): CountEntry => {
  const entry: CountEntry = { lineId }
  if ('qty' in change) {
    if (change.qty === null) entry.clear = true
    else entry.qty = change.qty
  }
  if ('reason' in change) entry.reason = change.reason ?? null
  if ('note' in change) entry.note = change.note
  if ('newCost' in change) entry.newCost = change.newCost ?? null
  return entry
}

const load = (countId: string): Map<string, PendingChange> => {
  try {
    const raw = localStorage.getItem(storageKey(countId))
    return new Map(raw ? Object.entries(JSON.parse(raw) as Record<string, PendingChange>) : [])
  } catch {
    return new Map()
  }
}

/**
 * Draft counting. An entry shows on screen at once and stays a local draft until the person
 * presses "Save count" (or Ctrl+S) — then everything goes to the server in as few requests as
 * possible. Nothing waits for the network while counting, so Enter → next item is instant.
 * The draft survives a reload (localStorage); submitting, posting etc. save it first.
 */
export function useCountQueue(countId: string, { onRejected }: { onRejected: (message: string) => void }) {
  const dispatch = useDispatch<AppDispatch>()
  const [record] = useRecordCountsMutation()
  const pending = useRef<Map<string, PendingChange>>(load(countId))
  const inFlight = useRef<Map<string, PendingChange>>(new Map())
  const flushing = useRef<Promise<boolean> | null>(null)
  const [version, setVersion] = useState(0)
  const [status, setStatus] = useState<QueueStatus>('idle')
  const [savedOnce, setSavedOnce] = useState(false)
  const onRejectedRef = useRef(onRejected)
  onRejectedRef.current = onRejected

  const bump = () => setVersion((v) => v + 1)

  const persist = useCallback(() => {
    try {
      const all: Record<string, PendingChange> = {}
      inFlight.current.forEach((change, id) => (all[id] = change))
      pending.current.forEach((change, id) => (all[id] = merge(all[id], change)!))
      if (Object.keys(all).length) localStorage.setItem(storageKey(countId), JSON.stringify(all))
      else localStorage.removeItem(storageKey(countId))
    } catch {
      // storage full / blocked: the queue still works in memory
    }
  }, [countId])

  const flushRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true))

  const flush = useCallback((): Promise<boolean> => {
    if (flushing.current) return flushing.current
    if (pending.current.size === 0) return Promise.resolve(true)

    const batch = [...pending.current.entries()].slice(0, MAX_BATCH)
    batch.forEach(([id, change]) => {
      inFlight.current.set(id, merge(inFlight.current.get(id), change)!)
      pending.current.delete(id)
    })
    setStatus('saving')
    bump()

    flushing.current = (async () => {
      let ok = false
      try {
        const { lines } = await record({ id: countId, entries: batch.map(([id, change]) => toEntry(id, change)) }).unwrap()
        dispatch(
          stockCountApi.util.updateQueryData('getStockCount', countId, (draft) => {
            const byId = new Map(lines.map((line) => [line.id, line]))
            draft.lines = draft.lines.map((line) => byId.get(line.id) ?? line)
          })
        )
        batch.forEach(([id]) => inFlight.current.delete(id))
        setSavedOnce(true)
        ok = true
      } catch (err) {
        const code = (err as { status?: unknown })?.status
        if (typeof code === 'number' && code >= 400 && code < 500 && code !== 408 && code !== 429) {
          // The server refused (e.g. the count was submitted meanwhile): drop and show its truth.
          batch.forEach(([id]) => inFlight.current.delete(id))
          onRejectedRef.current((err as { data?: { message?: string } })?.data?.message || 'Some counts were not accepted')
          dispatch(stockCountApi.util.invalidateTags([{ type: 'StockCount', id: countId }]))
        } else {
          // Offline / timeout: put back (anything typed since stays newer); the person can save again.
          batch.forEach(([id, change]) => {
            pending.current.set(id, merge(change, pending.current.get(id))!)
            inFlight.current.delete(id)
          })
        }
      } finally {
        flushing.current = null
        persist()
        setStatus(ok ? (pending.current.size ? 'idle' : 'idle') : 'error')
        bump()
      }
      return ok
    })()
    return flushing.current
  }, [countId, dispatch, persist, record])
  flushRef.current = flush

  const enqueue = useCallback(
    (lineId: string, change: PendingChange) => {
      pending.current.set(lineId, merge(pending.current.get(lineId), change)!)
      persist()
      bump()
    },
    [persist]
  )

  /** Sends everything, waiting for each batch. False if something could not be saved. */
  const flushAll = useCallback(async () => {
    for (let guard = 0; guard < 50; guard += 1) {
      if (flushing.current) await flushing.current
      if (pending.current.size === 0 && inFlight.current.size === 0) return true
      if (!(await flush())) return false
    }
    return pending.current.size === 0
  }, [flush])

  /** The change waiting for a line, newest on top of what is being sent. */
  const changeFor = useCallback((lineId: string) => merge(inFlight.current.get(lineId), pending.current.get(lineId)), [])

  const overlay = useCallback(
    (lines: StockCountLine[]): QueuedLine[] =>
      lines.map((line) => {
        const change = changeFor(line.id)
        if (!change) return line
        const next: QueuedLine = { ...line, pending: true }
        if ('qty' in change) {
          next.countedQty = change.qty ?? null
          // A blind count has no expected quantity on the client — nothing to compare yet.
          const system = line.systemQtyAtCount ?? line.systemQtyAtStart
          if (system === undefined || system === null) next.variance = undefined
          else next.variance = change.qty === null || change.qty === undefined ? null : Math.round((change.qty - system) * 1000) / 1000
          if (change.qty !== null) next.recount = false
        }
        if ('reason' in change) next.reason = change.reason ?? null
        if ('note' in change) next.note = change.note
        if ('newCost' in change) next.newCost = change.newCost ?? undefined
        return next
      }),
    // version: re-run when the queue changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [changeFor, version]
  )

  // Closing the tab with unsaved counts: the browser asks first (the draft is also kept locally).
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (pending.current.size || inFlight.current.size) event.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  const unsaved = useMemo(
    () => pending.current.size + inFlight.current.size,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [version]
  )

  return { enqueue, flush, flushAll, overlay, changeFor, status, unsaved, savedOnce, retry: () => void flush() }
}
