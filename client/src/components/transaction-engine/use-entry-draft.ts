import { useEffect, useMemo, useRef, useState } from 'react'
import {
  readDraft,
  removeDraft,
  serializeDraftValues,
  writeDraft,
} from '@/lib/form-draft'
import type { FormDraftControls } from '@/hooks/use-form-draft'
import type { AnyStore } from './engine-context'
import type { EntryProduct, EntryRowBase } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
interface StoredEntry {
  header: Record<string, any>
  rows: (Omit<EntryRowBase, 'id'> & Record<string, any>)[]
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const SAVE_DELAY_MS = 500

/**
 * Unsaved-entry protection on the app's existing draft storage (lib/form-draft: scoped to
 * the user and branch, 14-day expiry) — same "Unsaved draft restored" notice as every
 * create dialog. Only the started rows and the header are kept; products are stored
 * without their source record and re-linked to the live catalog when restored.
 */
export function useEntryDraft(
  store: AnyStore,
  {
    key,
    enabled,
    relink,
  }: {
    key: string
    enabled: boolean
    relink?: (product: EntryProduct) => EntryProduct | null
  }
): FormDraftControls {
  const [restoredAt, setRestoredAt] = useState<number | null>(null)
  const blankRef = useRef<string>('')
  const relinkRef = useRef(relink)
  relinkRef.current = relink
  const timerRef = useRef<number | undefined>(undefined)
  const lastRef = useRef('')

  const snapshot = (): StoredEntry => {
    const s = store.getState()
    return {
      header: s.header,
      rows: store.filledRows().map(({ id: _id, product, ...rest }) => ({
        ...rest,
        product: product ? { ...product, raw: undefined } : null,
      })),
    }
  }

  // Restore once when the entry opens.
  useEffect(() => {
    if (!enabled) return
    blankRef.current = serializeDraftValues({
      header: store.config.initialHeader(),
      rows: [],
    })
    const draft = readDraft<StoredEntry>(key)
    if (!draft || !draft.values?.rows) return
    const rows = draft.values.rows.map((r) => ({
      ...r,
      product: r.product ? (relinkRef.current?.(r.product) ?? r.product) : null,
    }))
    store.reset({ ...store.config.initialHeader(), ...draft.values.header }, [
      ...rows,
      store.config.createRow(),
    ])
    setRestoredAt(draft.savedAt)
  }, [enabled, key, store])

  // Save (debounced) on every change; an emptied entry deletes its draft.
  useEffect(() => {
    if (!enabled) return
    const flush = () => {
      const serialized = serializeDraftValues(snapshot())
      if (serialized === lastRef.current) return
      lastRef.current = serialized
      if (serialized === blankRef.current) removeDraft(key)
      else writeDraft(key, serialized)
    }
    const unsubscribe = store.subscribe(() => {
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(flush, SAVE_DELAY_MS)
    })
    return () => {
      window.clearTimeout(timerRef.current)
      unsubscribe()
    }
    // snapshot reads the store directly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, store])

  return useMemo(
    () => ({
      restoredAt,
      discard: () => {
        removeDraft(key)
        store.reset()
        setRestoredAt(null)
      },
      // After a successful save: forget the draft and don't re-save what was just saved.
      clear: () => {
        window.clearTimeout(timerRef.current)
        lastRef.current = serializeDraftValues(snapshot())
        removeDraft(key)
        setRestoredAt(null)
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [restoredAt, key, store]
  )
}
