import { useMemo, useRef, useState } from 'react'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  Eye,
  History,
  Loader2,
  Minus,
  Package,
  Phone,
  X,
} from 'lucide-react'
import { type CustomerProductRateLine } from '@/stores/invoice.api'
import { formatAppDate } from '@/lib/date-format'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { getTextClasses } from '@/utils/urdu-text-utils'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { ContactPhotoCell } from '@/components/contact-photo-cell'
import { InvoiceDetailDialog } from '@/components/invoice-detail-dialog'
import { PurchaseViewDrawer } from '@/features/purchase-invoice/components/purchase-view-drawer'
import {
  useRateHistory,
  type RateHistoryKind,
  type RateHistoryRef,
} from './customer-rate-history-cache'
import {
  RATE_HISTORY_ANCHOR_ATTR,
  RATE_HISTORY_PANEL_WIDTH,
} from './customer-rate-history-prefs'

/** The live invoice line the panel is about (re-read every render, so qty/price stay current). */
export interface RateHistoryLine {
  productId: string
  variantId?: string
  name: string
  nameUrdu?: string
  quantity: number
  unit?: string
  conversionFactor?: number
  unitPrice: number
  cost: number
}

export interface RateHistoryCustomer {
  id: string
  name: string
  nameUrdu?: string
  phone?: string
  picture?: unknown
}

interface CustomerRateHistoryPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The rate field the box hangs from — it moves with it from row to row. */
  anchor: HTMLElement | null
  /** Where the box opens: under the field (rows), or beside it (a dialog's field). */
  side?: 'bottom' | 'right'
  /** Gap from the field — a dialog's field passes its padding so the box clears the dialog. */
  sideOffset?: number
  customer: RateHistoryCustomer
  /** Positive = they owe us (Dr), negative = we owe them (Cr). Omitted → not shown. */
  customerBalance?: number
  loadingBalance?: boolean
  line: RateHistoryLine
  /** Catalog sale price for this product/variant, when known. */
  listPrice?: number
  /** Show cost and margin (follows the invoice screen's profit toggle). */
  showCost: boolean
  /** The invoice being edited — kept out of its own history. */
  excludeInvoiceId?: string
  /** 'sale' = what this customer paid (default); 'purchase' = what we paid this supplier
   *  (`customer` is then the supplier, `customerBalance` the supplier balance: + = payable). */
  kind?: RateHistoryKind
  onApplyRate: (rate: number) => void
  autoOpen: boolean
  onAutoOpenChange: (value: boolean) => void
  /** Put the caret back in the rate field (after "Use" or closing the invoice view). */
  onReturnFocus: () => void
}

const sameUnit = (a?: string, b?: string) =>
  (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase()

const daysAgoLabel = (date: string) => {
  const then = new Date(date)
  if (Number.isNaN(then.getTime())) return ''
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOf(new Date()) - startOf(then)) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 60) return `${days}d ago`
  const months = Math.round(days / 30.4)
  if (months < 24) return `${months}mo ago`
  return `${Math.round(days / 365)}y ago`
}

const TYPE_TONE: Record<string, string> = {
  cash: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300',
  credit:
    'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-950/40 dark:text-blue-300',
  pending:
    'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300',
}

/**
 * "What did this customer pay for this before?" — a box that hangs under (or over, when
 * there is no room) the Unit Sale Price being edited on New Invoice, and moves up and down
 * with it as you go to the next or previous product. Non-modal: the caret stays in the rate
 * field and you keep typing.
 *
 * Requests: none on open in the normal case — the invoice prefetches every line's history
 * in one batch (customer-rate-history-cache.ts). Only a product that is not cached yet (and
 * not already being fetched) is asked for, once. Qty/price edits never refetch — the line is
 * read live from props and every comparison is worked out here.
 */
export function CustomerRateHistoryPanel({
  open,
  onOpenChange,
  anchor,
  side = 'bottom',
  sideOffset = 6,
  customer,
  customerBalance,
  loadingBalance,
  line,
  listPrice,
  showCost,
  excludeInvoiceId,
  kind = 'sale',
  onApplyRate,
  autoOpen,
  onAutoOpenChange,
  onReturnFocus,
}: CustomerRateHistoryPanelProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null)

  const anchorRef = useRef<HTMLElement | null>(anchor)
  anchorRef.current = anchor

  const ref: RateHistoryRef = useMemo(
    () => ({
      kind,
      partyId: customer.id,
      productId: line.productId,
      variantId: line.variantId,
      excludeId: excludeInvoiceId,
    }),
    [kind, customer.id, line.productId, line.variantId, excludeInvoiceId]
  )
  const isSale = kind === 'sale'
  const copy = isSale
    ? {
        thisDoc: t('This sale'),
        previous: t('Previous sales'),
        lastRate: t('Last rate'),
        vsLast: t('vs last rate'),
        times: (n: number) => t('Bought {{n}} times', { n }),
        firstTime: t('First time selling this to {{name}}', {
          name: customer.name,
        }),
        noEarlier: t('No earlier invoice has this product.'),
        changeTitle: t('Change from the sale before'),
        openDoc: t('View invoice'),
        autoOpen: t('Open when I click the rate'),
        newTabHref: (id: string) =>
          `/invoice-history?viewId=${encodeURIComponent(id)}`,
      }
    : {
        thisDoc: t('This purchase'),
        previous: t('Previous purchases'),
        lastRate: t('Last cost'),
        vsLast: t('vs last cost'),
        times: (n: number) => t('Purchased {{n}} times', { n }),
        firstTime: t('First time buying this from {{name}}', {
          name: customer.name,
        }),
        noEarlier: t('No earlier purchase has this product.'),
        changeTitle: t('Change from the purchase before'),
        openDoc: t('View purchase'),
        autoOpen: t('Open when I click the cost'),
        newTabHref: (id: string) =>
          `/purchase-history?viewId=${encodeURIComponent(id)}`,
      }
  // A higher price is good news on a sale and bad news on a purchase.
  const isGoodChange = (change: number) => (isSale ? change > 0 : change < 0)
  // Cached (prefetched) history shows at once; otherwise asked for once via the batch URL.
  const {
    data: history,
    loading: isFetching,
    error: isError,
    retry: refetch,
  } = useRateHistory(ref, open)

  const currentUnit = line.unit || 'pcs'
  const currentFactor =
    Number(line.conversionFactor) > 0 ? Number(line.conversionFactor) : 1

  /** A past line's rate expressed in the current line's unit. */
  const inCurrentUnit = (
    rate: CustomerProductRateLine,
    which: 'gross' | 'net'
  ) => {
    if (
      sameUnit(rate.unit || 'pcs', currentUnit) ||
      rate.conversionFactor === currentFactor
    ) {
      return which === 'gross' ? rate.unitPrice : rate.netUnitPrice
    }
    const perStock =
      which === 'gross'
        ? rate.unitPrice / (rate.conversionFactor || 1)
        : rate.netRatePerStockUnit
    return Math.round(perStock * currentFactor * 100) / 100
  }
  const perStockToCurrent = (value: number | null | undefined) =>
    value === null || value === undefined
      ? null
      : Math.round(value * currentFactor * 100) / 100

  const lines = history?.lines ?? []
  const stats = history?.stats ?? null
  const lastCharged = lines.find((l) => l.subtotal > 0) ?? null
  const lastRate = lastCharged ? inCurrentUnit(lastCharged, 'gross') : null

  const diffVsLast =
    lastRate !== null && lastRate > 0 && line.unitPrice > 0
      ? ((line.unitPrice - lastRate) / lastRate) * 100
      : null

  const margin =
    showCost && line.unitPrice > 0
      ? line.unitPrice - line.cost * currentFactor
      : null
  const belowCost =
    showCost &&
    line.cost > 0 &&
    line.unitPrice > 0 &&
    line.unitPrice < line.cost * currentFactor

  const applyRate = (rate: number) => {
    onApplyRate(rate)
    onReturnFocus()
  }

  const balance = customerBalance ?? 0
  const balanceTone =
    balance > 0
      ? 'text-red-600 dark:text-red-400'
      : balance < 0
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-muted-foreground'

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={onOpenChange}
      modal={false}
    >
      <PopoverPrimitive.Anchor
        virtualRef={anchorRef as React.RefObject<HTMLElement>}
      />
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align='start'
          sideOffset={sideOffset}
          collisionPadding={12}
          avoidCollisions
          hideWhenDetached
          data-testid='rate-history-panel'
          role='dialog'
          aria-label={t('Rate history')}
          // Non-modal: never pull the caret out of the rate field.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            const target = e.target as Element | null
            // Clicking/focusing a rate field only moves the box to that row.
            if (target?.closest?.(`[${RATE_HISTORY_ANCHOR_ATTR}]`))
              e.preventDefault()
          }}
          style={{
            width: `min(${RATE_HISTORY_PANEL_WIDTH}px, calc(100vw - 24px))`,
          }}
          className='bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1 data-[side=right]:slide-in-from-left-1 data-[side=left]:slide-in-from-right-1 z-50 flex max-h-[min(520px,var(--radix-popover-content-available-height))] origin-(--radix-popover-content-transform-origin) flex-col overflow-hidden rounded-xl border shadow-2xl ring-1 ring-black/5 outline-none dark:ring-white/10'
        >
          {/* Header: product + customer (name, phone, balance) */}
          <div className='flex items-start gap-3 border-b px-3.5 py-2.5'>
            <ContactPhotoCell
              picture={customer.picture as never}
              name={customer.name}
              className='mt-0.5 h-8 w-8 shrink-0 rounded-full'
            />
            <div className='min-w-0 flex-1'>
              <div className='flex min-w-0 items-center gap-1.5 text-sm leading-tight font-semibold'>
                <History className='text-primary h-3.5 w-3.5 shrink-0' />
                <span
                  className={getTextClasses(line.name, 'truncate')}
                  title={line.name}
                >
                  {line.name}
                </span>
                <span className='text-muted-foreground shrink-0 font-normal'>
                  · {currentUnit}
                </span>
              </div>
              <div className='text-muted-foreground mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs'>
                <span
                  className={getTextClasses(
                    customer.name,
                    'text-foreground max-w-[150px] truncate font-medium'
                  )}
                  title={customer.name}
                >
                  {customer.name}
                </span>
                {customer.phone ? (
                  <span className='inline-flex items-center gap-1'>
                    <Phone className='h-3 w-3' />
                    {customer.phone}
                  </span>
                ) : null}
                {customerBalance !== undefined || loadingBalance ? (
                  <span>
                    {t('Balance')}{' '}
                    {loadingBalance ? (
                      <Loader2 className='inline h-3 w-3 animate-spin' />
                    ) : (
                      <span
                        className={cn(
                          'font-semibold tabular-nums',
                          balanceTone
                        )}
                      >
                        {formatMoney(Math.abs(balance))}
                        {balance > 0
                          ? isSale
                            ? ' Dr'
                            : ' Cr'
                          : balance < 0
                            ? isSale
                              ? ' Cr'
                              : ' Dr'
                            : ''}
                      </span>
                    )}
                  </span>
                ) : null}
              </div>
            </div>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='-mt-0.5 -mr-1 h-7 w-7 shrink-0'
              onClick={() => {
                onOpenChange(false)
                onReturnFocus()
              }}
              aria-label={t('Close')}
            >
              <X className='h-4 w-4' />
            </Button>
          </div>

          <div className='min-h-0 flex-1 overflow-y-auto overscroll-contain'>
            {/* This line now */}
            <div className='space-y-1.5 border-b px-3.5 py-2'>
              <div className='flex items-baseline justify-between gap-3'>
                <span className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
                  {copy.thisDoc}
                </span>
                <span className='text-sm tabular-nums'>
                  {line.quantity} {currentUnit} ×{' '}
                  <span className='font-semibold'>
                    {formatMoney(line.unitPrice)}
                  </span>
                </span>
              </div>
              <div className='flex flex-wrap items-center gap-1.5 text-xs'>
                {diffVsLast !== null ? (
                  <span
                    data-testid='rate-vs-last'
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium ring-1 ring-inset',
                      Math.abs(diffVsLast) < 0.005
                        ? 'bg-muted text-muted-foreground ring-border'
                        : isGoodChange(diffVsLast)
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300'
                    )}
                  >
                    {Math.abs(diffVsLast) < 0.005 ? (
                      <Minus className='h-3 w-3' />
                    ) : diffVsLast > 0 ? (
                      <ArrowUpRight className='h-3 w-3' />
                    ) : (
                      <ArrowDownRight className='h-3 w-3' />
                    )}
                    {Math.abs(diffVsLast) < 0.005
                      ? t('Same as last time')
                      : `${diffVsLast > 0 ? '+' : '−'}${Math.abs(diffVsLast).toFixed(1)}% ${copy.vsLast}`}
                  </span>
                ) : null}
                {listPrice !== undefined && listPrice > 0 ? (
                  <span className='bg-muted text-muted-foreground rounded-full px-2 py-0.5'>
                    {t('List')}{' '}
                    <span className='text-foreground font-medium tabular-nums'>
                      {formatMoney(listPrice * currentFactor)}
                    </span>
                  </span>
                ) : null}
                {showCost && line.cost > 0 ? (
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5',
                      belowCost
                        ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                        : 'bg-muted text-muted-foreground'
                    )}
                  >
                    {t('Cost')}{' '}
                    <span className='font-medium tabular-nums'>
                      {formatMoney(line.cost * currentFactor)}
                    </span>
                    {margin !== null ? (
                      <span className='tabular-nums'>
                        {' '}
                        ·{' '}
                        {belowCost
                          ? t('below cost')
                          : `+${formatMoney(margin)}`}
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </div>
            </div>

            {/* Stats */}
            {stats ? (
              <div className='grid grid-cols-4 divide-x border-b'>
                <Stat
                  label={copy.lastRate}
                  value={lastRate !== null ? formatMoney(lastRate) : '—'}
                  hint={
                    lastCharged ? daysAgoLabel(lastCharged.date) : undefined
                  }
                  emphasis
                />
                <Stat
                  label={t('Average')}
                  value={fmtOrDash(
                    formatMoney,
                    perStockToCurrent(stats.avgRatePerStockUnit)
                  )}
                />
                <Stat
                  label={t('Lowest')}
                  value={fmtOrDash(
                    formatMoney,
                    perStockToCurrent(stats.minRatePerStockUnit)
                  )}
                />
                <Stat
                  label={t('Highest')}
                  value={fmtOrDash(
                    formatMoney,
                    perStockToCurrent(stats.maxRatePerStockUnit)
                  )}
                />
              </div>
            ) : null}
            {stats ? (
              <p className='text-muted-foreground border-b px-4 py-2 text-xs'>
                {copy.times(stats.invoiceCount)} ·{' '}
                {formatQty(stats.totalStockQuantity / currentFactor)}{' '}
                {currentUnit} ·{' '}
                <span className='tabular-nums'>
                  {formatMoney(stats.totalAmount)}
                </span>
                {stats.firstDate ? (
                  <>
                    {' '}
                    · {t('since')} {formatAppDate(new Date(stats.firstDate))}
                  </>
                ) : null}
              </p>
            ) : null}

            {/* Previous sales */}
            <div className='px-2 py-2'>
              <div className='flex items-center justify-between px-2 pb-1.5'>
                <span className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
                  {copy.previous}
                </span>
                {isFetching && history ? (
                  <Loader2 className='text-muted-foreground h-3 w-3 animate-spin' />
                ) : null}
              </div>

              {!history ? (
                isError ? (
                  <div className='px-2 py-8 text-center text-sm'>
                    <p className='text-destructive'>
                      {t('Could not load the rate history.')}
                    </p>
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      className='mt-3'
                      onClick={() => refetch()}
                    >
                      {t('Try again')}
                    </Button>
                  </div>
                ) : (
                  <div className='space-y-2 px-2' aria-busy='true'>
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className='bg-muted/60 h-14 animate-pulse rounded-lg'
                      />
                    ))}
                  </div>
                )
              ) : lines.length === 0 ? (
                <div className='px-2 py-6 text-center'>
                  <Package className='text-muted-foreground/50 mx-auto h-8 w-8' />
                  <p className='mt-2 text-sm font-medium'>{copy.firstTime}</p>
                  <p className='text-muted-foreground mt-1 text-xs'>
                    {copy.noEarlier}
                  </p>
                </div>
              ) : (
                <ul className='space-y-1' data-testid='rate-history-rows'>
                  {lines.map((rate, index) => {
                    const next = lines
                      .slice(index + 1)
                      .find((l) => l.subtotal > 0)
                    const delta =
                      next && rate.subtotal > 0
                        ? rate.netRatePerStockUnit - next.netRatePerStockUnit
                        : 0
                    const rateHere = inCurrentUnit(rate, 'gross')
                    const netHere = inCurrentUnit(rate, 'net')
                    const unitDiffers =
                      !sameUnit(rate.unit || 'pcs', currentUnit) &&
                      rate.conversionFactor !== currentFactor
                    const isCurrentRate =
                      Math.abs(rateHere - line.unitPrice) < 0.005
                    return (
                      <li
                        key={`${rate.invoiceId}-${index}`}
                        className='group hover:border-border hover:bg-muted/40 rounded-lg border border-transparent px-2 py-2 transition-colors'
                      >
                        <div className='flex items-center gap-2'>
                          <button
                            type='button'
                            onClick={() => setViewInvoiceId(rate.invoiceId)}
                            className='text-primary min-w-0 truncate text-left text-sm font-semibold underline-offset-2 hover:underline'
                            title={copy.openDoc}
                          >
                            {rate.invoiceNumber || '—'}
                          </button>
                          <span
                            className={cn(
                              'shrink-0 rounded px-1.5 py-px text-[10px] font-medium capitalize ring-1 ring-inset',
                              TYPE_TONE[rate.type] ??
                                'bg-muted text-muted-foreground ring-border'
                            )}
                          >
                            {t(rate.type)}
                          </span>
                          <button
                            type='button'
                            onClick={() => setViewInvoiceId(rate.invoiceId)}
                            className='text-muted-foreground hover:bg-muted hover:text-foreground shrink-0 rounded p-0.5'
                            title={copy.openDoc}
                            aria-label={copy.openDoc}
                          >
                            <Eye className='h-3.5 w-3.5' />
                          </button>
                          <a
                            href={copy.newTabHref(rate.invoiceId)}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-muted-foreground hover:bg-muted hover:text-foreground -ml-1 shrink-0 rounded p-0.5'
                            title={t('Open in a new tab')}
                            aria-label={t('Open in a new tab')}
                          >
                            <ExternalLink className='h-3.5 w-3.5' />
                          </a>
                          <span
                            className='text-muted-foreground ml-auto shrink-0 text-xs tabular-nums'
                            title={daysAgoLabel(rate.date)}
                          >
                            {formatAppDate(new Date(rate.date))}
                          </span>
                        </div>

                        <div className='mt-1 flex items-center gap-2'>
                          <div className='text-muted-foreground min-w-0 flex-1 text-xs'>
                            <span className='tabular-nums'>
                              {formatQty(rate.quantity)} {rate.unit || 'pcs'} ×{' '}
                              <span className='text-foreground text-sm font-semibold'>
                                {formatMoney(rate.unitPrice)}
                              </span>
                            </span>
                            {rate.discountAmount <= 0 && rate.subtotal > 0 ? (
                              <span className='tabular-nums'>
                                {' '}
                                = {formatMoney(rate.subtotal)}
                              </span>
                            ) : null}
                            {rate.discountAmount > 0 ? (
                              <span className='tabular-nums'>
                                {' '}
                                −{' '}
                                {rate.discountType === 'percentage'
                                  ? `${rate.discountValue}%`
                                  : formatMoney(rate.discountAmount)}{' '}
                                = {t('net')} {formatMoney(rate.netUnitPrice)}
                              </span>
                            ) : null}
                            {rate.subtotal <= 0 ? (
                              <span className='ml-1 font-medium text-emerald-600'>
                                {t('free')}
                              </span>
                            ) : null}
                            {unitDiffers ? (
                              <span className='block tabular-nums'>
                                ≈ {formatMoney(rateHere)} / {currentUnit}
                                {rate.discountAmount > 0
                                  ? ` (${t('net')} ${formatMoney(netHere)})`
                                  : ''}
                              </span>
                            ) : null}
                          </div>
                          {delta !== 0 && Math.abs(delta) >= 0.005 ? (
                            <span
                              className={cn(
                                'inline-flex shrink-0 items-center text-[11px] font-medium tabular-nums',
                                isGoodChange(delta)
                                  ? 'text-emerald-600'
                                  : 'text-amber-600'
                              )}
                              title={copy.changeTitle}
                            >
                              {delta > 0 ? (
                                <ArrowUpRight className='h-3 w-3' />
                              ) : (
                                <ArrowDownRight className='h-3 w-3' />
                              )}
                              {formatMoney(Math.abs(delta * currentFactor))}
                            </span>
                          ) : null}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                type='button'
                                size='sm'
                                variant={
                                  isCurrentRate ? 'secondary' : 'outline'
                                }
                                disabled={rate.subtotal <= 0 || isCurrentRate}
                                onClick={() => applyRate(rateHere)}
                                className='h-7 shrink-0 px-2.5 text-xs'
                                data-testid='use-rate'
                              >
                                {isCurrentRate ? t('In use') : t('Use')}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side='top'>
                              {t('Set this line to {{rate}} / {{unit}}', {
                                rate: formatMoney(rateHere),
                                unit: currentUnit,
                              })}
                              {rate.discountAmount > 0
                                ? ` — ${t('the discount stays as it is on this line')}`
                                : ''}
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
              {history?.truncated ? (
                <p className='text-muted-foreground px-2 pt-2 text-center text-xs'>
                  {t(
                    'Showing the latest {{n}} invoices — totals above cover all of them.',
                    { n: new Set(lines.map((l) => l.invoiceId)).size }
                  )}
                </p>
              ) : null}
            </div>
          </div>

          {/* Footer */}
          <div className='bg-muted/30 flex items-center justify-between gap-3 border-t px-4 py-2.5'>
            <label className='text-muted-foreground flex cursor-pointer items-center gap-2 text-xs'>
              <Switch
                checked={autoOpen}
                onCheckedChange={onAutoOpenChange}
                className='scale-90'
              />
              {copy.autoOpen}
            </label>
            <kbd className='bg-background text-muted-foreground rounded border px-1.5 py-0.5 text-[10px]'>
              Esc
            </kbd>
          </div>

          {/* Rendered inside the panel so Radix treats it as a child layer (clicks in it are not
            "outside" the panel). */}
          {isSale ? (
            <InvoiceDetailDialog
              invoiceId={viewInvoiceId ?? undefined}
              open={Boolean(viewInvoiceId)}
              onOpenChange={(next) => !next && setViewInvoiceId(null)}
              onCloseAutoFocus={(e) => {
                e.preventDefault()
                onReturnFocus()
              }}
            />
          ) : (
            <PurchaseViewDrawer
              purchaseId={viewInvoiceId}
              open={Boolean(viewInvoiceId)}
              onOpenChange={(next) => !next && setViewInvoiceId(null)}
              onCloseAutoFocus={(e: Event) => {
                e.preventDefault()
                onReturnFocus()
              }}
            />
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

function Stat({
  label,
  value,
  hint,
  emphasis,
}: {
  label: string
  value: string
  hint?: string
  emphasis?: boolean
}) {
  return (
    <div className='min-w-0 px-2 py-2.5 text-center'>
      <p className='text-muted-foreground truncate text-[10px] font-medium tracking-wide uppercase'>
        {label}
      </p>
      <p
        className={cn(
          'truncate text-sm tabular-nums',
          emphasis ? 'text-foreground font-bold' : 'font-semibold'
        )}
        title={value}
      >
        {value}
      </p>
      {hint ? (
        <p className='text-muted-foreground truncate text-[10px]'>{hint}</p>
      ) : null}
    </div>
  )
}

const fmtOrDash = (formatMoney: (n: number) => string, value: number | null) =>
  value === null ? '—' : formatMoney(value)

const formatQty = (n: number) =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000)
