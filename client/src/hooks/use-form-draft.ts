import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FieldValues, UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'
import { readDraft, removeDraft, serializeDraftValues, writeDraft } from '@/lib/form-draft'

/**
 * Unsaved-draft protection for create dialogs.
 *
 *   const draft = useFormDraft(form, { key: 'brand', enabled: open && !editing, label: 'brand' })
 *   <FormDraftNotice draft={draft} />      // "Draft restored · 3 min ago · Discard"
 *   await createBrand(values); draft.clear() // after a successful save
 *
 * While `enabled`, every edit is saved (debounced) to localStorage. Closing the dialog —
 * ✕, Escape, an outside click, a route change, a reload — keeps it and says so in a toast;
 * the next time the same form opens, the draft is put back. A draft only starts after a
 * real keystroke/pick, so values a form fills in by itself never become a "draft", and
 * clearing every field back to blank deletes it.
 *
 * Pass `enabled: false` for edit mode: an edit form must always show the record as stored.
 */

export interface FormDraftControls {
  /** When the draft now on screen was saved, or null if the form opened blank. */
  restoredAt: number | null
  /** Throws the draft away and puts the form back to how it opened blank. */
  discard: () => void
  /** Deletes the draft without touching the form — call after a successful save. */
  clear: () => void
}

interface DraftOptions {
  /** Unique per form, e.g. 'product', 'customer', 'payment-voucher'. */
  key: string
  /** Only true while the form is open for CREATING a record. */
  enabled: boolean
  /** Used in the "draft saved" toast, e.g. 'product' → "Your product is kept…". */
  label?: string
  /** Top-level fields never stored or restored (auto numbers, server-issued values…). */
  exclude?: string[]
}

const SAVE_DELAY_MS = 400

// Secrets never touch localStorage, whatever form they're in.
const SENSITIVE_FIELD = /password|passcode|^pin$|pinCode|otp|cvv|secret/i

function omit(values: unknown, exclude: string[] | undefined) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return values
  const out = { ...(values as Record<string, unknown>) }
  for (const key of Object.keys(out)) if (SENSITIVE_FIELD.test(key)) delete out[key]
  for (const key of exclude ?? []) delete out[key]
  return out
}

function useDraftCore<T>(
  { key, enabled, label, exclude }: DraftOptions,
  snapshot: () => T,
  apply: (values: T) => void,
) {
  const [restoredAt, setRestoredAt] = useState<number | null>(null)

  // Latest callbacks/options without re-running the open/close effect on every render.
  const snapshotRef = useRef(snapshot)
  const applyRef = useRef(apply)
  const excludeRef = useRef(exclude)
  const labelRef = useRef(label)
  snapshotRef.current = snapshot
  applyRef.current = apply
  excludeRef.current = exclude
  labelRef.current = label

  // Read during render: in the commit that closes the dialog, fields re-render against the
  // blanked form and can emit change events before the close effect's cleanup has run.
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  const activeRef = useRef(false) // baseline captured, edits are being tracked
  const touchedRef = useRef(false) // user edited something during this open
  const interactedRef = useRef(false) // a real pointer/key/input event since this open
  const baselineRef = useRef<{ raw: T; serialized: string } | null>(null)
  const pendingRef = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const persist = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    const serialized = pendingRef.current
    pendingRef.current = null
    if (serialized === null) return
    if (serialized === baselineRef.current?.serialized) removeDraft(key)
    else writeDraft(key, serialized)
  }, [key])

  const notify = useCallback(
    (fromUser: boolean) => {
      if (!activeRef.current || !enabledRef.current) return
      if (fromUser || interactedRef.current) touchedRef.current = true
      if (!touchedRef.current) return
      pendingRef.current = serializeDraftValues(omit(snapshotRef.current(), excludeRef.current))
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(persist, SAVE_DELAY_MS)
    },
    [persist],
  )

  // Bumped when the form opens; the draft is laid over the form in the effect of the render
  // it causes. By then every "reset to blank on open" the dialog did in the opening commit —
  // form.reset() or a batch of setState calls, in any effect order — has been committed, so
  // the draft is laid over the finished blank form instead of being wiped by it.
  const [openSeq, setOpenSeq] = useState(0)

  useEffect(() => {
    if (!openSeq || !enabledRef.current) return
    const raw = snapshotRef.current()
    baselineRef.current = { raw, serialized: serializeDraftValues(omit(raw, excludeRef.current)) }
    const stored = readDraft<Record<string, unknown>>(key)
    if (stored && stored.values && typeof stored.values === 'object') {
      const base = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
      // Merge over the blank form so fields added since the draft was saved keep defaults,
      // and excluded fields keep their freshly generated values.
      applyRef.current({ ...base, ...(omit(stored.values, excludeRef.current) as object) } as T)
      setRestoredAt(stored.savedAt)
      touchedRef.current = true
    } else {
      setRestoredAt(null)
    }
    activeRef.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per open, keyed by openSeq
  }, [openSeq])

  useEffect(() => {
    if (!enabled) return
    touchedRef.current = false
    interactedRef.current = false
    setOpenSeq((n) => n + 1)

    const onPageHide = () => persist()
    // A value change only starts a draft once the user has actually done something — state a
    // dialog fills in by itself (a default wallet arriving from the API) is not a draft.
    const onInteract = (event: Event) => {
      if (event.isTrusted) interactedRef.current = true
    }
    const interactionEvents = ['pointerdown', 'keydown', 'input'] as const
    window.addEventListener('pagehide', onPageHide)
    interactionEvents.forEach((type) => document.addEventListener(type, onInteract, true))

    return () => {
      window.removeEventListener('pagehide', onPageHide)
      interactionEvents.forEach((type) => document.removeEventListener(type, onInteract, true))
      const wasTracking = activeRef.current && touchedRef.current
      persist()
      activeRef.current = false
      if (wasTracking && readDraft(key)) {
        const what = labelRef.current ? `Your unsaved ${labelRef.current}` : 'What you typed'
        toast('Draft saved', {
          description: `${what} is kept — open the form again to continue where you left off.`,
          action: { label: 'Discard', onClick: () => removeDraft(key) },
        })
      }
    }
  }, [enabled, key, persist])

  const clear = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    pendingRef.current = null
    touchedRef.current = false
    removeDraft(key)
    setRestoredAt(null)
  }, [key])

  const discard = useCallback(() => {
    clear()
    if (baselineRef.current) applyRef.current(baselineRef.current.raw)
  }, [clear])

  const controls = useMemo<FormDraftControls>(
    () => ({ restoredAt, discard, clear }),
    [restoredAt, discard, clear],
  )
  return { controls, notify }
}

/** Draft protection for a react-hook-form form. */
export function useFormDraft<T extends FieldValues>(
  form: UseFormReturn<T>,
  options: DraftOptions,
): FormDraftControls {
  const { controls, notify } = useDraftCore<T>(
    options,
    () => form.getValues(),
    (values) => form.reset(values, { keepDefaultValues: true }),
  )

  useEffect(() => {
    // form.reset() emits one { name, values } event per field (it setValue()s each one) and
    // then a final nameless { values } event. A dialog blanking itself on close must not be
    // mistaken for an edit, so programmatic changes wait a microtask and are dropped if a
    // reset finished in the same synchronous burst. Keystrokes/picks carry type 'change'
    // (reset never does) and count immediately. Events without `values` are
    // register/validation noise.
    let resetGeneration = 0
    const subscription = form.watch((_values, payload) => {
      // A watched field makes RHF re-broadcast its whole form state ({ ...formState }), which
      // can carry a stale name/type from an earlier keystroke — never an edit in itself.
      if (!('values' in payload) || 'submitCount' in payload) return
      if (!payload.name) {
        resetGeneration++
        return
      }
      if (payload.type === 'change') {
        notify(true)
        return
      }
      const generation = resetGeneration
      queueMicrotask(() => {
        if (generation === resetGeneration) notify(false)
      })
    })
    return () => subscription.unsubscribe()
  }, [form, notify])

  return controls
}

/**
 * Draft protection for a form kept in plain useState. `values` is the form's current
 * state (any JSON-able object); `onRestore` receives a full value set to put back.
 */
export function useStateDraft<T extends Record<string, unknown>>(
  values: T,
  onRestore: (values: T) => void,
  options: DraftOptions,
): FormDraftControls {
  const valuesRef = useRef(values)
  valuesRef.current = values
  const { controls, notify } = useDraftCore<T>(options, () => valuesRef.current, onRestore)

  const serialized = serializeDraftValues(values)
  const lastSerializedRef = useRef(serialized)
  useEffect(() => {
    if (serialized === lastSerializedRef.current) return
    lastSerializedRef.current = serialized
    if (options.enabled) notify(false)
  }, [serialized, options.enabled, notify])

  return controls
}
