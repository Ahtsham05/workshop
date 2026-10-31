import { useCallback, useMemo, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '@/stores/store'
import { setUiPreferences } from '@/stores/auth.slice'
import { useUpdateTransactionLayoutMutation } from '@/stores/user-preferences.api'

/**
 * The person's own New Invoice / New Purchase screen: which toolbar buttons and side cards
 * they want to see. Saved on the account (User.uiPreferences.transactionLayout) so it follows
 * them to every device.
 *
 * Only the ids of HIDDEN parts are stored, so anything added later shows up by default.
 * Save / Save & Print and the details card (party, date, type) can't be hidden — a bill
 * can't be made without them.
 */

export type TransactionKind = 'sale' | 'purchase'

export interface TransactionLayoutPart {
  id: string
  /** One label, or a different one per screen. */
  label: string | Record<TransactionKind, string>
  /** Shown under the switch — what happens once it's off. */
  hint?: string | Record<TransactionKind, string>
  group: 'toolbar' | 'cards'
  /** Limited to one screen; both when omitted. */
  only?: TransactionKind
}

export const TRANSACTION_LAYOUT_PARTS: TransactionLayoutPart[] = [
  { id: 'history', group: 'toolbar', label: { sale: 'Invoice history', purchase: 'Purchase history' } },
  {
    id: 'recent',
    group: 'toolbar',
    label: { sale: 'Recent sales', purchase: 'Recent purchases' },
    hint: 'Alt+H still opens it.',
  },
  {
    id: 'browse',
    group: 'toolbar',
    label: { sale: 'Browse invoices', purchase: 'Browse purchases' },
    hint: 'Alt+B still opens it.',
  },
  { id: 'convert-pending', group: 'toolbar', label: 'Convert pending invoices', only: 'sale' },
  { id: 'purchase-orders', group: 'toolbar', label: 'Purchase orders', only: 'purchase' },
  { id: 'hold', group: 'toolbar', label: 'Hold' },
  { id: 'held-drafts', group: 'toolbar', label: 'Held drafts' },
  {
    id: 'catalog-toggle',
    group: 'toolbar',
    label: 'Show catalog',
    hint: 'Off: the product catalog stays closed and the items list keeps the full width.',
  },
  { id: 'preview', group: 'toolbar', label: 'Preview' },
  { id: 'stats', group: 'cards', label: 'Totals strip', hint: 'Items · Subtotal · Discount · Total above the items list.' },
  { id: 'summary', group: 'cards', label: 'Summary card' },
  {
    id: 'payment',
    group: 'cards',
    label: 'Payment & Amount card',
    hint: {
      sale: 'Off: a Cash invoice is saved as fully paid into the default account, a Credit invoice as unpaid. Still shown on Pending invoices (send by SMS/WhatsApp) and when editing a Quotation (Convert to Invoice).',
      purchase: 'Off: a Cash purchase is saved as fully paid from the default account, a Credit purchase as unpaid.',
    },
  },
  { id: 'autosave-hint', group: 'cards', label: 'Autosave / shortcuts note', hint: 'The green line at the bottom.' },
]

export function partsFor(kind: TransactionKind) {
  return TRANSACTION_LAYOUT_PARTS.filter((p) => !p.only || p.only === kind)
}

export function partLabel(part: TransactionLayoutPart, kind: TransactionKind) {
  return typeof part.label === 'string' ? part.label : part.label[kind]
}

export function partHint(part: TransactionLayoutPart, kind: TransactionKind) {
  return typeof part.hint === 'object' ? part.hint[kind] : part.hint
}

export interface TransactionLayout {
  sale: string[]
  purchase: string[]
}

const KNOWN_IDS = new Set(TRANSACTION_LAYOUT_PARTS.map((p) => p.id))

const cleanIds = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((v): v is string => typeof v === 'string' && KNOWN_IDS.has(v)))]
    : []

export function normalizeTransactionLayout(value: unknown): TransactionLayout {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>
  return { sale: cleanIds(v.sale), purchase: cleanIds(v.purchase) }
}

export function useTransactionLayout(kind: TransactionKind) {
  const dispatch = useDispatch<AppDispatch>()
  const stored = useSelector(
    (state: RootState) =>
      (state.auth.data?.user as { uiPreferences?: { transactionLayout?: unknown } } | undefined)?.uiPreferences
        ?.transactionLayout
  )
  const layout = useMemo(() => normalizeTransactionLayout(stored), [stored])
  const [save] = useUpdateTransactionLayoutMutation()
  const latest = useRef(layout)
  latest.current = layout

  const hidden = layout[kind]

  const write = useCallback(
    (nextHidden: string[]) => {
      const next = { ...latest.current, [kind]: nextHidden }
      // Instant on screen (and in the cached user), then saved to the account.
      dispatch(setUiPreferences({ transactionLayout: next }))
      save({ transactionLayout: next })
        .unwrap()
        .catch(() => undefined)
    },
    [dispatch, kind, save]
  )

  const setShown = useCallback(
    (id: string, shown: boolean) => {
      const current = latest.current[kind]
      write(shown ? current.filter((x) => x !== id) : [...new Set([...current, id])])
    },
    [kind, write]
  )

  const isShown = useCallback((id: string) => !hidden.includes(id), [hidden])
  const reset = useCallback(() => write([]), [write])

  return { isShown, setShown, reset, isCustomised: hidden.length > 0 }
}
