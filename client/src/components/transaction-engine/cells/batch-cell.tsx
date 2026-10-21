import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Layers,
  Loader2,
  PackagePlus,
  Sparkles,
  X,
} from 'lucide-react'
import { formatAppDate } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  allocationFields,
  allocationTotal,
  daysToExpiry,
  fefoOrder,
  isExpiredBatch,
  planFefo,
  planFrom,
} from '../batch-allocation'
import { useEngine } from '../engine-context'
import type { EntryBatch, EntryBatchAllocation } from '../types'
import type { CellProps } from './cell-props'
import { useBatches } from './use-batches'
import { useCell } from './use-cell'

const EPS = 1e-9
const SOON_DAYS = 30
const fmt = (n: number) => String(Math.round(n * 1000) / 1000)

const expiryTone = (days: number | null) =>
  days === null
    ? 'text-muted-foreground'
    : days < 0
      ? 'text-rose-600 dark:text-rose-400'
      : days <= SOON_DAYS
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-muted-foreground'

const pillBase =
  'inline-flex max-w-full min-w-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] font-medium'
const pillBlue =
  'border-blue-600 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200'
const pillRed = 'border-destructive bg-destructive/10 text-destructive'

/**
 * Which batch(es) a row draws from, in the invoice's look.
 *
 * - Automatic (default): "Auto · B1" — earliest expiry first; when one batch can't cover
 *   the row the next ones are added ("Auto · B1 +1"); red "short" when all of them can't.
 * - Picked: that batch is drawn first and, if it holds less than the row, the rest comes
 *   from the next batches by expiry — shown as a split ("2 batches"). Each part's
 *   quantity can be changed in the list; the row's quantity follows their total.
 * - Stock the product holds outside any batch is called out, with a one-click "Put them
 *   into a batch" when the screen allows it (stock.assignUnbatched).
 *
 * Keys: Enter on the cell moves on; Space / ↓ opens the list. There: type to filter,
 * ↑ / ↓ to move, Enter picks (and moves on), Escape closes.
 */
export function BatchCell({ row, column, error, label, disabled }: CellProps) {
  const { store, stock, t } = useEngine()
  const cell = useCell(row.id, column.key, { vertical: false })
  const loaded = useBatches(row.product)
  // Batches created here (un-batched stock put into a batch) until the catalog reloads.
  const [extra, setExtra] = useState<EntryBatch[]>([])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)
  const moveOnClose = useRef(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => setExtra([]), [row.product])
  const batches = useMemo(
    () =>
      loaded === null
        ? null
        : [
            ...loaded,
            ...extra.filter((e) => !loaded.some((b) => b.id === e.id)),
          ],
    [loaded, extra]
  )
  // Drag & drop works too — PNG, JPG, WebP, GIF up to 5MB.Drag & drop works too — PNG, JPG, WebP, GIF up to 5MB.





  const qty = Number(row.quantity) || 0
  const unit = row.unit || row.product?.unit || ''
  const manual = useMemo<EntryBatchAllocation[] | null>(
    () =>
      row.batches?.length
        ? row.batches
        : row.batchId
          ? [
              {
                batchId: row.batchId,
                batchNumber: row.batchNumber || '',
                quantity: qty,
              },
            ]
          : null,
    [row.batches, row.batchId, row.batchNumber, qty]
  )
  const capOf = (id: string) => batches?.find((b) => b.id === id)?.quantity ?? 0
  const auto = useMemo(() => planFefo(batches || [], qty), [batches, qty])
  const manualShort = manual ? Math.max(0, qty - allocationTotal(manual)) : 0
  const overCap = !!manual?.some((a) => a.quantity > capOf(a.batchId) + EPS)
  const allInBatches = (batches || []).reduce((s, b) => s + b.quantity, 0)
  const unbatched = Math.max(
    0,
    (Number(row.product?.stock) || 0) - allInBatches
  )
  // Auto is short on unexpired batches but expired ones would cover it → the server asks
  // to confirm instead of refusing.
  const expiredCovers = !manual && auto.short > EPS && allInBatches >= qty - EPS

  // Listed in the order Auto draws them: earliest expiry first, no expiry last.
  const options = useMemo(() => {
    const q = query.trim().toLowerCase()
    return fefoOrder(batches || []).filter(
      (b) =>
        (b.quantity > 0 || manual?.some((a) => a.batchId === b.id)) &&
        (!q || b.batchNumber.toLowerCase().includes(q))
    )
  }, [batches, query, manual])
  const count = options.length + 1

  useEffect(() => {
    if (!open) return
    setAssignError(null)
    const first = manual?.[0]?.batchId
    const at = first ? options.findIndex((b) => b.id === first) + 1 : 0
    setActive(Math.max(0, at))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const commit = (list: EntryBatchAllocation[] | null, quantity?: number) =>
    store.updateRow(row.id, {
      ...allocationFields(list),
      ...(quantity !== undefined ? { quantity } : {}),
    })
  const close = (moveOn: boolean) => {
    moveOnClose.current = moveOn
    setOpen(false)
  }

  /** Draw from `b` first; when it is short, the next batches by expiry make up the rest. */
  const pickFrom = (b: EntryBatch) => {
    if (qty <= 0) {
      commit([{ batchId: b.id, batchNumber: b.batchNumber, quantity: 0 }])
      return
    }
    commit(planFrom(batches || [], qty, b).allocations)
  }
  /** A batch clicked while a split is short: it covers what's missing. */
  const addToSplit = (b: EntryBatch) => {
    const take = Math.round(Math.min(manualShort, b.quantity) * 1e6) / 1e6
    commit([
      ...(manual || []),
      { batchId: b.id, batchNumber: b.batchNumber, quantity: take },
    ])
  }
  /** Editing one part of the split: the row's quantity becomes the new total. */
  const setPart = (batchId: string, value: number) => {
    const next = (manual || []).map((a) =>
      a.batchId === batchId ? { ...a, quantity: Math.max(0, value) } : a
    )
    commit(next, allocationTotal(next))
  }
  const removePart = (batchId: string) => {
    const next = (manual || []).filter((a) => a.batchId !== batchId)
    if (next.length) commit(next, allocationTotal(next))
    else commit(null)
  }
  const assign = async () => {
    if (!row.product || !stock.assignUnbatched) return
    setAssigning(true)
    setAssignError(null)
    try {
      const made = await stock.assignUnbatched(row.product)
      if (made) setExtra((x) => [...x, made])
    } catch (err) {
      setAssignError(
        (err as { data?: { message?: string } })?.data?.message ||
          t('Could not create the batch')
      )
    } finally {
      setAssigning(false)
    }
  }

  if (!row.product || !row.product.trackBatch) {
    return (
      <div className='text-muted-foreground flex h-8 items-center px-2 text-sm'>
        —
      </div>
    )
  }

  // ── The pill ──
  let pill: React.ReactNode
  if (manual && manual.length > 1) {
    pill = (
      <span
        className={cn(
          pillBase,
          overCap || manualShort > EPS ? pillRed : pillBlue
        )}
      >
        <Layers className='h-2.5 w-2.5 shrink-0' />
        <span className='truncate'>
          {manual[0].batchNumber} +{manual.length - 1}
        </span>
        <ChevronDown className='h-2.5 w-2.5 shrink-0' />
      </span>
    )
  } else if (manual) {
    const b = batches?.find((x) => x.id === manual[0].batchId)
    const left = b ? b.quantity - qty : 0
    const bad = left < -EPS || (!!b && isExpiredBatch(b))
    pill = (
      <span className={cn(pillBase, bad ? pillRed : pillBlue)}>
        <Layers className='h-2.5 w-2.5 shrink-0' />
        <span className='truncate'>{manual[0].batchNumber}</span>
        <span className='shrink-0 tabular-nums'>
          ·{' '}
          {left < -EPS
            ? `${fmt(-left)} ${t('short')}`
            : `${fmt(left)} ${t('left')}`}
        </span>
        <ChevronDown className='h-2.5 w-2.5 shrink-0' />
      </span>
    )
  } else if (
    batches !== null &&
    !batches.some((b) => b.quantity > 0) &&
    !unbatched
  ) {
    pill = (
      <span className='text-muted-foreground truncate px-1 text-xs'>
        {t('No batch stock')}
      </span>
    )
  } else if (auto.short > EPS && qty > 0) {
    pill = (
      <span
        className={cn(
          pillBase,
          'border-dashed',
          expiredCovers
            ? 'border-amber-500 text-amber-700 dark:text-amber-300'
            : pillRed
        )}
      >
        <AlertTriangle className='h-2.5 w-2.5 shrink-0' />
        <span className='truncate'>
          {t('Auto')} · {fmt(auto.short)} {t('short')}
        </span>
        <ChevronDown className='h-2.5 w-2.5 shrink-0' />
      </span>
    )
  } else {
    pill = (
      <span
        className={cn(
          pillBase,
          'border-dashed border-blue-400 text-blue-700 dark:border-blue-700 dark:text-blue-300'
        )}
      >
        <Sparkles className='h-2.5 w-2.5 shrink-0' />
        <span className='truncate'>
          {auto.allocations.length
            ? `${t('Auto')} · ${auto.allocations[0].batchNumber}${auto.allocations.length > 1 ? ` +${auto.allocations.length - 1}` : ''}`
            : column.placeholder || t('Auto (FEFO)')}
        </span>
        <ChevronDown className='h-2.5 w-2.5 shrink-0' />
      </span>
    )
  }

  const planText = (list: EntryBatchAllocation[]) =>
    list.map((a) => `${a.batchNumber} × ${fmt(a.quantity)}`).join(', ')
  const covered = manual ? allocationTotal(manual) : qty - auto.short
  const short = manual ? manualShort : auto.short

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={cell.ref as React.Ref<HTMLButtonElement>}
          type='button'
          disabled={disabled}
          aria-label={label}
          aria-invalid={!!error || undefined}
          aria-haspopup='listbox'
          title={
            error ||
            (manual
              ? planText(manual)
              : auto.allocations.length
                ? `${t('Auto')}: ${planText(auto.allocations)}`
                : undefined)
          }
          onFocus={cell.onFocus}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'ArrowDown') {
              e.preventDefault()
              setOpen(true)
            } else cell.onKeyDown(e)
          }}
          onClick={(e) => {
            // Opening is the trigger's own job; keep Enter for "move on".
            if (e.detail === 0) e.preventDefault()
          }}
          className={cn(
            'focus-visible:ring-input-ring/50 flex h-8 w-full min-w-0 items-center rounded-md px-1 text-left text-sm outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
            error && 'ring-destructive/60 ring-1'
          )}
        >
          {pill}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-[min(23rem,calc(100vw-2rem))] p-1.5'
        onCloseAutoFocus={(e) => {
          if (moveOnClose.current) {
            e.preventDefault()
            moveOnClose.current = false
            cell.next()
          }
        }}
      >
        {/* What the row needs and how much the batches cover */}
        <div className='mb-1.5 space-y-1 px-1 pt-0.5'>
          <div className='flex items-center justify-between gap-2 text-xs'>
            <span className='text-muted-foreground'>
              {t('Issue')}{' '}
              <b className='text-foreground tabular-nums'>
                {fmt(qty)} {unit}
              </b>
            </span>
            {qty > 0 &&
              (short > EPS ? (
                <span className='font-medium text-rose-600 tabular-nums dark:text-rose-400'>
                  {fmt(short)} {unit} {t('not covered')}
                </span>
              ) : (
                <span className='flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400'>
                  <Check className='h-3 w-3' />
                  {manual && manual.length > 1
                    ? `${t('Split over')} ${manual.length} ${t('batches')}`
                    : t('Covered')}
                </span>
              ))}
          </div>
          {qty > 0 && (
            <div className='bg-muted h-1 overflow-hidden rounded-full'>
              <div
                className={cn(
                  'h-full rounded-full',
                  short > EPS ? 'bg-rose-500' : 'bg-emerald-500'
                )}
                style={{ width: `${Math.min(100, (covered / qty) * 100)}%` }}
              />
            </div>
          )}
        </div>
        <Input
          autoFocus
          value={query}
          showVoiceInput={false}
          autoComplete='off'
          spellCheck={false}
          aria-label={t('Find a batch')}
          placeholder={t('Find a batch…')}
          className='mb-1 h-7 text-xs'
          onChange={(e) => {
            setQuery(e.target.value)
            setActive(e.target.value ? 1 : 0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              setActive(
                (i) => (i + (e.key === 'ArrowDown' ? 1 : -1) + count) % count
              )
            } else if (e.key === 'Enter') {
              e.preventDefault()
              e.stopPropagation()
              const b = active === 0 ? null : options[active - 1]
              if (b) pickFrom(b)
              else commit(null)
              close(true)
            }
          }}
        />
        <div
          ref={listRef}
          role='listbox'
          aria-label={t('Batches')}
          className='flex max-h-72 flex-col gap-0.5 overflow-y-auto'
        >
          <button
            type='button'
            role='option'
            aria-selected={!manual}
            data-index={0}
            tabIndex={-1}
            onMouseEnter={() => setActive(0)}
            onClick={() => {
              commit(null)
              close(true)
            }}
            className={cn(
              'flex items-start justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs',
              active === 0 ? 'bg-muted' : '',
              !manual && 'text-blue-800 dark:text-blue-200'
            )}
          >
            <span className='min-w-0'>
              <span className='flex items-center gap-1 font-medium'>
                <Sparkles className='h-3 w-3' />
                {t('Auto (FEFO)')}
              </span>
              <span className='text-muted-foreground block'>
                {auto.allocations.length
                  ? planText(auto.allocations)
                  : t('Earliest expiry first, expired skipped')}
                {auto.short > EPS && qty > 0 && (
                  <span className='text-rose-600 dark:text-rose-400'>
                    {' '}
                    · {fmt(auto.short)} {t('short')}
                  </span>
                )}
              </span>
            </span>
            {!manual && <Check className='mt-0.5 h-3 w-3 shrink-0' />}
          </button>
          {batches === null && (
            <p className='text-muted-foreground p-2 text-center text-xs'>
              {t('Loading…')}
            </p>
          )}
          {options.map((b, i) => {
            const days = daysToExpiry(b)
            const part = manual?.find((a) => a.batchId === b.id)
            const inAuto = manual
              ? null
              : auto.allocations.find((a) => a.batchId === b.id)
            return (
              <div
                key={b.id}
                role='option'
                aria-selected={!!part}
                data-index={i + 1}
                onMouseEnter={() => setActive(i + 1)}
                onClick={() => {
                  if (part) return
                  if (manual && manualShort > EPS) addToSplit(b)
                  else {
                    pickFrom(b)
                    close(true)
                  }
                }}
                className={cn(
                  'flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs',
                  active === i + 1 ? 'bg-muted' : '',
                  part &&
                    'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100'
                )}
              >
                <span className='min-w-0'>
                  <span className='flex items-center gap-1 truncate font-medium'>
                    {b.batchNumber}
                    {inAuto && (
                      <span className='text-muted-foreground font-normal'>
                        · {t('auto')} × {fmt(inAuto.quantity)}
                      </span>
                    )}
                  </span>
                  <span className={cn('block', expiryTone(days))}>
                    {days === null
                      ? t('No expiry')
                      : days < 0
                        ? `${t('Expired')} ${formatAppDate(new Date(b.expiryDate!))}`
                        : `${t('exp')} ${formatAppDate(new Date(b.expiryDate!))}${days <= SOON_DAYS ? ` · ${days}d` : ''}`}
                    <span className='text-muted-foreground'>
                      {' '}
                      · {fmt(b.quantity)} {t('in batch')}
                    </span>
                  </span>
                </span>
                {part ? (
                  <span
                    className='flex shrink-0 items-center gap-1'
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Input
                      type='number'
                      min={0}
                      step='any'
                      showVoiceInput={false}
                      aria-label={`${t('Quantity from')} ${b.batchNumber}`}
                      value={part.quantity}
                      onChange={(e) =>
                        setPart(b.id, Number(e.target.value) || 0)
                      }
                      onFocus={(e) => e.target.select()}
                      className={cn(
                        'h-6 w-20 px-1.5 text-right text-xs tabular-nums',
                        part.quantity > b.quantity + EPS &&
                          'border-destructive text-destructive'
                      )}
                    />
                    <button
                      type='button'
                      tabIndex={-1}
                      aria-label={`${t('Remove')} ${b.batchNumber}`}
                      onClick={() => removePart(b.id)}
                      className='hover:bg-foreground/10 rounded p-0.5'
                    >
                      <X className='h-3 w-3' />
                    </button>
                  </span>
                ) : (
                  <span className='text-muted-foreground shrink-0 text-[11px]'>
                    {manual && manualShort > EPS
                      ? `+ ${t('add')}`
                      : t('use first')}
                  </span>
                )}
              </div>
            )
          })}
          {batches !== null && !options.length && (
            <p className='text-muted-foreground p-2 text-center text-xs'>
              {query ? t('No matching batch') : t('No batch has stock')}
            </p>
          )}
        </div>

        {unbatched > EPS && (
          <div className='mt-1.5 space-y-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs'>
            <p className='flex gap-1.5 text-amber-800 dark:text-amber-300'>
              <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
              <span>
                <b className='tabular-nums'>
                  {fmt(unbatched)} {unit}
                </b>{' '}
                {t('in stock have no batch, so they can’t be issued by batch.')}
              </span>
            </p>
            {stock.assignUnbatched && (
              <Button
                type='button'
                size='sm'
                variant='outline'
                className='h-7 w-full gap-1.5 text-xs'
                disabled={assigning}
                onClick={assign}
              >
                {assigning ? (
                  <Loader2 className='h-3.5 w-3.5 animate-spin' />
                ) : (
                  <PackagePlus className='h-3.5 w-3.5' />
                )}
                {t('Put them into a batch')}
              </Button>
            )}
            {assignError && (
              <p className='text-rose-600 dark:text-rose-400'>{assignError}</p>
            )}
          </div>
        )}
        {manual && (
          <div className='mt-1.5 flex justify-end'>
            <Button
              type='button'
              size='sm'
              className='h-7 text-xs'
              onClick={() => close(true)}
            >
              {t('Done')}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
