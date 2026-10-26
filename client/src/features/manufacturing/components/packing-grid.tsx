import { AlertTriangle, Minus, Package, Plus } from 'lucide-react'
import type { PackSizeDto } from '@/stores/manufacturing.api'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { fmtQty } from '../lib/constants'
import {
  maxPacks,
  packInner,
  packingSummary,
  type PackCounts,
} from '../lib/packing-math'

/**
 * How many of each pack size: one row per size with what one pack holds, the count, and
 * the bulk it takes; underneath, packed vs. left loose and the packing material needed.
 * Shared by the receive dialog ("pack now") and the Packing page.
 */
export function PackingGrid({
  sizes,
  counts,
  onChange,
  available,
  unit,
  availableLabel,
  autoFocusFirst,
  maxBase,
}: {
  sizes: PackSizeDto[]
  counts: PackCounts
  onChange: (counts: PackCounts) => void
  /** Bulk there is to pack (received good, or in stock / in the chosen batch). */
  available: number
  unit: string
  availableLabel: string
  /** Put the cursor in the first pack count (packing comes first in the receipt). */
  autoFocusFirst?: boolean
  /** What the "Max" of each size is measured against (default: `available`). */
  maxBase?: number
}) {
  const { t } = useLanguage()
  const u = getUnitLabel(unit)
  const summary = packingSummary(sizes, counts, available)
  const set = (id: string, n: number | null) =>
    onChange({ ...counts, [id]: n === null ? null : Math.max(0, n) })

  return (
    <div className='space-y-3'>
      <div className='divide-y rounded-lg border'>
        {sizes.map((s, i) => {
          const qty = Number(counts[s.id]) || 0
          const inner = packInner(s)
          const max = maxPacks(sizes, counts, maxBase ?? available, s)
          return (
            <div
              key={s.id}
              className='flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5'
            >
              <span className='bg-muted text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md'>
                <Package className='h-4 w-4' />
              </span>
              <div className='min-w-0 flex-1 basis-40'>
                <div className='truncate text-sm font-medium'>{s.name}</div>
                <div className='text-muted-foreground truncate text-xs'>
                  {fmtQty(s.contentQuantity)} {u} {t('each')}
                  {inner ? ` · ${inner}` : ''} · {s.packProduct.name}
                </div>
              </div>
              <div className='flex items-center gap-2'>
                <div className='flex h-9 items-center overflow-hidden rounded-md border'>
                  <button
                    type='button'
                    className='hover:bg-muted text-muted-foreground flex h-full w-8 items-center justify-center'
                    aria-label={`${t('Fewer')} ${s.name}`}
                    onClick={() => set(s.id, qty - 1)}
                    tabIndex={-1}
                  >
                    <Minus className='h-3.5 w-3.5' />
                  </button>
                  <Input
                    inputMode='numeric'
                    showVoiceInput={false}
                    aria-label={`${s.name} — ${t('packs')}`}
                    data-pack-input={i}
                    autoFocus={autoFocusFirst && i === 0}
                    className='h-full w-16 rounded-none border-0 text-center tabular-nums shadow-none focus-visible:ring-0'
                    value={counts[s.id] == null ? '' : String(counts[s.id])}
                    placeholder='0'
                    onChange={(e) => {
                      const raw = e.target.value.replace(/[^\d]/g, '')
                      set(s.id, raw === '' ? null : Number(raw))
                    }}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return
                      const next = document.querySelector<HTMLInputElement>(
                        `[data-pack-input="${i + 1}"]`
                      )
                      if (next) {
                        e.preventDefault()
                        next.focus()
                      }
                    }}
                  />
                  <button
                    type='button'
                    className='hover:bg-muted text-muted-foreground flex h-full w-8 items-center justify-center'
                    aria-label={`${t('More')} ${s.name}`}
                    onClick={() => set(s.id, qty + 1)}
                    tabIndex={-1}
                  >
                    <Plus className='h-3.5 w-3.5' />
                  </button>
                </div>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='text-muted-foreground h-8 px-2 text-xs'
                  disabled={max <= 0 && qty === 0}
                  onClick={() => set(s.id, max)}
                  title={t('Fill what is left into this pack size')}
                  tabIndex={-1}
                >
                  {t('Max')} {fmtQty(max)}
                </Button>
              </div>
              <div className='w-24 text-right text-sm tabular-nums'>
                {qty > 0 ? (
                  <>
                    <span className='font-semibold'>
                      {fmtQty(qty * s.contentQuantity)}
                    </span>{' '}
                    <span className='text-muted-foreground text-xs'>{u}</span>
                  </>
                ) : (
                  <span className='text-muted-foreground'>—</span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className='grid grid-cols-1 gap-2 sm:grid-cols-3'>
        <Figure label={availableLabel} value={`${fmtQty(available)} ${u}`} />
        <Figure
          label={`${t('Packed')} · ${fmtQty(summary.packs)} ${t('packs')}`}
          value={`${fmtQty(summary.packed)} ${u}`}
          strong
        />
        <Figure
          label={t('Extra / loose (stays as bulk)')}
          value={`${fmtQty(summary.loose)} ${u}`}
          tone={summary.over ? 'danger' : undefined}
        />
      </div>

      {summary.materials.length > 0 && (
        <div className='rounded-lg border px-3 py-2'>
          <div className='text-muted-foreground mb-1 text-xs font-medium'>
            {t('Packing material used')}
          </div>
          <ul className='grid grid-cols-1 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-2'>
            {summary.materials.map((m) => (
              <li
                key={m.id}
                className='flex items-center justify-between gap-2'
              >
                <span className='min-w-0 truncate'>{m.name}</span>
                <span
                  className={cn(
                    'shrink-0 tabular-nums',
                    m.short > 0 && 'text-rose-600 dark:text-rose-400'
                  )}
                >
                  {fmtQty(m.need)} {getUnitLabel(m.unit)}
                  <span className='text-muted-foreground text-xs'>
                    {' '}
                    /{' '}
                    {m.inProduction != null
                      ? `${fmtQty(m.inProduction)} ${t('in production stock')}`
                      : `${fmtQty(m.available)} ${t('in stock')}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {summary.over && (
        <p className='flex items-center gap-1.5 text-xs text-rose-700 dark:text-rose-400'>
          <AlertTriangle className='h-3.5 w-3.5 shrink-0' />
          {t('The packs hold more than there is to pack')} (
          {fmtQty(summary.packed)} / {fmtQty(available)} {u})
        </p>
      )}
    </div>
  )
}

function Figure({
  label,
  value,
  strong,
  tone,
}: {
  label: string
  value: string
  strong?: boolean
  tone?: 'danger'
}) {
  return (
    <div
      className={cn(
        'rounded-lg border px-3 py-2',
        tone === 'danger' && 'border-rose-500/50 bg-rose-500/5'
      )}
    >
      <div className='text-muted-foreground truncate text-xs'>{label}</div>
      <div
        className={cn(
          'text-base tabular-nums',
          strong && 'font-semibold',
          tone === 'danger' && 'font-semibold text-rose-700 dark:text-rose-400'
        )}
      >
        {value}
      </div>
    </div>
  )
}
