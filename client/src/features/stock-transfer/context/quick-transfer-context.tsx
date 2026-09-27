import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '@/stores/store'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import { purchaseCatalogApi } from '@/stores/purchaseCatalog.api'
import { usePermissions } from '@/context/permission-context'

/**
 * "Quick Stock Transfer": the Bulk Transfer form (one or many products), reachable from every screen without
 * leaving it — the header button, Ctrl/Cmd + Alt + S, the Ctrl+K menu, or "Transfer stock"
 * on a product. It opens over whatever the person is doing (a half-built invoice stays
 * exactly as it was) and closes back to it.
 *
 * Mounted once around the app shell, like the notepad. The form itself is only loaded the
 * first time it is opened, so it costs nothing on pages that never use it.
 */

const loadDialog = () => import('../components/quick-bulk-transfer-dialog')
const QuickBulkTransferDialog = lazy(() => loadDialog().then((m) => ({ default: m.QuickBulkTransferDialog })))

export const QUICK_TRANSFER_SHORTCUT_LABEL = 'Ctrl+Alt+S'

/** "Transfer stock" on a product: start the transfer with that product. */
export interface QuickTransferPrefill {
  fromProductId: string
  fromProductName?: string
}

interface QuickTransferContextValue {
  /** The person may create transfers and has another branch to send to. */
  canTransfer: boolean
  openQuickTransfer: (prefill?: QuickTransferPrefill) => void
  /** Starts loading the form and the product list, e.g. when the pointer nears a button. */
  warmUp: () => void
}

// The provider publishes itself here rather than through React context: the Ctrl+K menu
// is mounted at the app root, above the shell this provider wraps, and still needs it.
let current: QuickTransferContextValue | null = null
const listeners = new Set<() => void>()
const publish = (value: QuickTransferContextValue | null) => {
  current = value
  listeners.forEach((listener) => listener())
}
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const getCurrent = () => current

export function QuickTransferProvider({ children }: { children: ReactNode }) {
  const dispatch = useDispatch<AppDispatch>()
  const { hasPermission } = usePermissions()
  const activeBranchId = useSelector((s: RootState) => s.auth.activeBranchId)
  const { data: branches = [] } = useGetMyBranchesQuery()
  // Creating a transfer needs editProducts on the server (inventoryTransfer.route.js).
  const canTransfer = hasPermission('editProducts') && branches.some((b) => b.id !== activeBranchId)

  const [open, setOpen] = useState(false)
  const [everOpened, setEverOpened] = useState(false)
  const [prefill, setPrefill] = useState<QuickTransferPrefill | null>(null)
  const [sessionKey, setSessionKey] = useState(0)

  const warmUp = useCallback(() => {
    void loadDialog()
    // Transfers list only products in stock here, from the same catalog the form reads —
    // fetched now it is usually ready by the time the form appears.
    dispatch(purchaseCatalogApi.util.prefetch('getPurchasableCatalog', undefined, { ifOlderThan: 60 }))
  }, [dispatch])

  // Already open (e.g. the shortcut pressed again): keep the transfer being entered.
  const isOpenRef = useRef(open)
  isOpenRef.current = open

  const openQuickTransfer = useCallback(
    (next?: QuickTransferPrefill) => {
      if (!canTransfer || isOpenRef.current) return
      warmUp()
      setPrefill(next ?? null)
      setSessionKey((k) => k + 1)
      setEverOpened(true)
      setOpen(true)
    },
    [canTransfer, warmUp]
  )

  // Ctrl/Cmd + Alt + S from anywhere — including while typing in a field, since the whole
  // point is to get there mid-task. Matching on the produced key (not the physical one)
  // means a keyboard layout that types a character with Ctrl+Alt+S (AltGr) is left alone.
  const openRef = useRef(openQuickTransfer)
  openRef.current = openQuickTransfer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || !(event.ctrlKey || event.metaKey) || event.shiftKey || event.repeat) return
      if (event.key?.toLowerCase() !== 's') return
      event.preventDefault()
      openRef.current()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const value = useMemo(() => ({ canTransfer, openQuickTransfer, warmUp }), [canTransfer, openQuickTransfer, warmUp])
  useEffect(() => {
    publish(value)
    return () => publish(null)
  }, [value])

  return (
    <>
      {children}
      {everOpened && (
        <Suspense fallback={null}>
          <QuickBulkTransferDialog open={open} onOpenChange={setOpen} sessionKey={sessionKey} initialProductId={prefill?.fromProductId} />
        </Suspense>
      )}
    </>
  )
}

/**
 * Quick Stock Transfer, from anywhere in the app. Null when the shell that provides it isn't
 * mounted (e.g. the student/parent portal), where transfers don't exist.
 */
export function useQuickTransfer(): QuickTransferContextValue | null {
  return useSyncExternalStore(subscribe, getCurrent, getCurrent)
}
