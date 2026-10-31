import { useCallback, useEffect, useState } from 'react'
import { ChevronFirst, ChevronLeft, ChevronRight, Loader2, ScanSearch } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { InvoiceDetailDialog } from '@/components/invoice-detail-dialog'
import { PurchaseViewDrawer } from '@/features/purchase-invoice/components/purchase-view-drawer'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import { purchaseApi, useGetPurchaseNavigationQuery } from '@/stores/purchase.api'
import { invoiceApi, useGetInvoiceNavigationQuery } from '@/stores/invoice.api'
import type { RecordNavigationParams } from '@/stores/transactionHistory.types'

/**
 * "Previous / next invoice" on the New Purchase and New Invoice screens: opens the saved
 * documents one FULL record at a time (all lines, totals, party, bill no.), newest first,
 * and steps back and forward with buttons or PageUp/PageDown — the quick "did I already
 * enter this one?" look while typing in a pile of paper invoices. Alt+B opens it.
 *
 * Order is "as entered" (the last one saved first — what you just typed) or by the
 * document's own date; "this supplier/customer only" narrows it to the party on the form.
 */

export type RecordNavigatorMode = 'purchase' | 'sale'

type Order = 'entered' | 'date'
const ORDER_KEY = (mode: RecordNavigatorMode) => `recordNavigatorOrder:${mode}`
// Same "real sales" set the history panel uses: no quotations.
const SALE_TYPES = 'cash,credit,pending'

function readOrder(mode: RecordNavigatorMode): Order {
  try {
    return localStorage.getItem(ORDER_KEY(mode)) === 'date' ? 'date' : 'entered'
  } catch {
    return 'entered'
  }
}

/** Typing in a field (or a picker) keeps its own arrow/Page keys. */
const isTypingTarget = (target: EventTarget | null) => {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable || !!el.closest('[role="combobox"],[role="listbox"]')
}

export interface RecordNavigatorTarget {
  /** Open straight at this document (e.g. from the duplicate warning). */
  aroundId?: string
}

interface RecordNavigatorProps {
  mode: RecordNavigatorMode
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The supplier/customer currently on the form, for "only this party". */
  currentParty?: { id: string; name: string } | null
  /** Where to start; changes while open re-position the viewer. */
  target?: RecordNavigatorTarget | null
}

/** The viewer: the module's own full-detail view with a stepper bar on top. */
export function RecordNavigator({ mode, open, onOpenChange, currentParty, target }: RecordNavigatorProps) {
  const { t } = useLanguage()
  const [order, setOrderState] = useState<Order>(() => readOrder(mode))
  const [partyOnly, setPartyOnly] = useState(false)
  const [index, setIndex] = useState(0)
  // A one-shot "open at this record" — cleared once the server has told us its position.
  const [around, setAround] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (!open) return
    setAround(target?.aroundId)
    setIndex(0)
  }, [open, target])

  const setOrder = (next: Order) => {
    setOrderState(next)
    setIndex(0)
    try {
      localStorage.setItem(ORDER_KEY(mode), next)
    } catch {
      // Storage blocked — the order just isn't remembered.
    }
  }

  const partyId = partyOnly && currentParty?.id ? currentParty.id : undefined
  const params: RecordNavigationParams = {
    index,
    order,
    ...(around ? { around } : {}),
    ...(mode === 'purchase' ? (partyId ? { supplier: partyId } : {}) : { type: SALE_TYPES, ...(partyId ? { customerId: partyId } : {}) }),
  }
  const purchaseNav = useGetPurchaseNavigationQuery(params, { skip: !open || mode !== 'purchase' })
  const saleNav = useGetInvoiceNavigationQuery(params, { skip: !open || mode !== 'sale' })
  const nav = mode === 'purchase' ? purchaseNav : saleNav
  const result = nav.data
  const total = result?.total ?? 0
  const position = result?.index ?? null

  // Once the "around" lookup answered, keep stepping from that position by index.
  useEffect(() => {
    if (around && result && result.index !== null && nav.originalArgs?.around === around) {
      setIndex(result.index)
      setAround(undefined)
    }
  }, [around, result, nav.originalArgs])

  // Warm the next older record so stepping back feels instant.
  const prefetchPurchase = purchaseApi.usePrefetch('getPurchaseNavigation')
  const prefetchInvoice = invoiceApi.usePrefetch('getInvoiceNavigation')
  useEffect(() => {
    if (!open || around || position === null || position + 1 >= total) return
    const next = { ...params, index: position + 1 }
    delete next.around
    if (mode === 'purchase') prefetchPurchase(next)
    else prefetchInvoice(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, position, total, order, partyId, mode, around])

  const canOlder = position !== null && position + 1 < total
  const canNewer = position !== null && position > 0
  const busy = nav.isFetching
  const older = useCallback(() => canOlder && setIndex((position ?? 0) + 1), [canOlder, position])
  const newer = useCallback(() => canNewer && setIndex((position ?? 0) - 1), [canNewer, position])
  const newest = useCallback(() => setIndex(0), [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      if (event.key === 'PageUp' || (event.key === 'ArrowLeft' && !isTypingTarget(event.target))) {
        event.preventDefault()
        older()
      } else if (event.key === 'PageDown' || (event.key === 'ArrowRight' && !isTypingTarget(event.target))) {
        event.preventDefault()
        newer()
      } else if (event.key === 'Home' && !isTypingTarget(event.target)) {
        event.preventDefault()
        newest()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, older, newer, newest])

  const partyLabel = mode === 'purchase' ? t('This supplier only') : t('This customer only')
  const bar = (
    <div className='flex shrink-0 flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2 pr-12 text-sm'>
      <div className='flex items-center gap-1'>
        <Button type='button' variant='outline' size='icon' className='h-8 w-8' onClick={newest} disabled={!canNewer} aria-label={t('Newest')} title={`${t('Newest')} (Home)`}>
          <ChevronFirst className='h-4 w-4' />
        </Button>
        <Button type='button' variant='outline' size='sm' className='h-8 gap-1' onClick={older} disabled={!canOlder} title={`${t('Older')} (PageUp / ←)`}>
          <ChevronLeft className='h-4 w-4' />
          {t('Older')}
        </Button>
        <Button type='button' variant='outline' size='sm' className='h-8 gap-1' onClick={newer} disabled={!canNewer} title={`${t('Newer')} (PageDown / →)`}>
          {t('Newer')}
          <ChevronRight className='h-4 w-4' />
        </Button>
      </div>
      <span className='min-w-0 tabular-nums text-muted-foreground' aria-live='polite'>
        {busy && <Loader2 className='mr-1 inline h-3.5 w-3.5 animate-spin' />}
        {total === 0 && !busy
          ? t('Nothing saved yet')
          : position !== null
            ? `${(position + 1).toLocaleString()} / ${total.toLocaleString()}${result?.number ? ` · ${result.number}` : ''}`
            : ''}
      </span>
      <div className='ml-auto flex flex-wrap items-center gap-3'>
        {currentParty?.id && (
          <label className='flex cursor-pointer items-center gap-1.5 text-xs'>
            <Checkbox
              checked={partyOnly}
              onCheckedChange={(checked) => {
                setPartyOnly(!!checked)
                setIndex(0)
              }}
            />
            <span className='max-w-[12rem] truncate' title={currentParty.name}>
              {partyLabel}: {currentParty.name}
            </span>
          </label>
        )}
        <Select value={order} onValueChange={(v) => setOrder(v as Order)}>
          <SelectTrigger className='h-8 w-[150px] text-xs'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='entered'>{t('Order: as entered')}</SelectItem>
            <SelectItem value='date'>{t('Order: by date')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  const id = result?.id ?? null
  return mode === 'purchase' ? (
    <PurchaseViewDrawer purchaseId={id} open={open} onOpenChange={onOpenChange} navigation={bar} />
  ) : (
    <InvoiceDetailDialog invoiceId={id ?? undefined} open={open} onOpenChange={onOpenChange} navigation={bar} />
  )
}

/** Toolbar button (Alt+B) that opens the viewer on the newest saved document. */
export function RecordNavigatorButton({
  mode,
  currentParty,
  className,
  buttonHidden = false,
}: {
  mode: RecordNavigatorMode
  currentParty?: { id: string; name: string } | null
  className?: string
  /** Hide just the button (screen customised); the keyboard shortcut and panel still work. */
  buttonHidden?: boolean
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Physical key, so it works on the Urdu keyboard layout too.
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.code !== 'KeyB') return
      event.preventDefault()
      setOpen((value) => !value)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      {!buttonHidden && (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className={cn('gap-2 shadow-sm', className)}
            onClick={() => setOpen(true)}
            aria-keyshortcuts='Alt+B'
          >
            <ScanSearch className='h-4 w-4 shrink-0' aria-hidden />
            {mode === 'purchase' ? t('Browse purchases') : t('Browse invoices')}
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {t('Step through saved records one by one to check for duplicates')}
          <kbd className='ml-2 rounded border px-1 font-mono text-[10px]'>Alt+B</kbd>
        </TooltipContent>
      </Tooltip>
      )}
      {open && <RecordNavigator mode={mode} open={open} onOpenChange={setOpen} currentParty={currentParty} />}
    </>
  )
}
