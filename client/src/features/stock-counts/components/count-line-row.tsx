import { memo, useEffect, useRef, useState } from 'react'
import { AlertCircle, Check, Minus, Plus, RotateCcw, ScanLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import type { VarianceReason } from '@/stores/stockCount.api'
import type { PendingChange, QueuedLine } from '../lib/use-count-queue'
import { fmtQty, REASON_LABELS, REASON_ORDER, signed } from '../lib/labels'
import { ClassBadge } from './count-badges'

export interface LineRowProps {
  line: QueuedLine
  /** Counts can be entered / changed. */
  editable: boolean
  expectedHidden: boolean
  /** Manager reviewing: reason picker + recount selection. */
  reviewing: boolean
  /** Initial count: cost can be entered for items without one. */
  costEditable: boolean
  selected: boolean
  onToggleSelect: (lineId: string) => void
  /** Instant: the change shows at once and is sent in the background (use-count-queue.ts). */
  onChange: (lineId: string, change: PendingChange) => void
  onScanUnits: (line: QueuedLine) => void
  registerInput: (lineId: string, el: HTMLInputElement | null) => void
  onEnterNext: (lineId: string) => void
  formatMoney: (value: number) => string
  flash?: boolean
}

/**
 * One item on the count. Type a number and press Enter: it is recorded instantly and the
 * cursor jumps to the next item — saving happens in the background, in batches. − / + count
 * by hand. Phones get the same row as a card with big buttons.
 */
export const CountLineRow = memo(function CountLineRow({
  line,
  editable,
  expectedHidden,
  reviewing,
  costEditable,
  selected,
  onToggleSelect,
  onChange,
  onScanUnits,
  registerInput,
  onEnterNext,
  formatMoney,
  flash,
}: LineRowProps) {
  const { t } = useLanguage()
  const counted = line.countedQty !== null && line.countedQty !== undefined
  const [value, setValue] = useState(counted ? String(line.countedQty) : '')
  const [cost, setCost] = useState(line.newCost !== undefined && line.newCost !== null ? String(line.newCost) : '')
  const [invalid, setInvalid] = useState(false)
  const focused = useRef(false)

  // Someone else (or a +1 scan) changed the count: show it unless this field is being edited.
  useEffect(() => {
    if (!focused.current) setValue(counted ? String(line.countedQty) : '')
  }, [line.countedQty, counted])

  const commit = () => {
    const trimmed = value.trim()
    if (trimmed === '') {
      if (counted) onChange(line.id, { qty: null })
      setInvalid(false)
      return true
    }
    const qty = Number(trimmed)
    if (!Number.isFinite(qty) || qty < 0) {
      setInvalid(true)
      return false
    }
    setInvalid(false)
    if (!(counted && qty === line.countedQty)) onChange(line.id, { qty })
    return true
  }
  const step = (delta: number) => {
    const qty = Math.max(0, Math.round(((line.countedQty ?? 0) + delta) * 1000) / 1000)
    setValue(String(qty))
    onChange(line.id, { qty })
  }

  const serialized = line.kind === 'serialized'
  const variance = line.variance ?? null
  const showVariance = !expectedHidden && counted && variance !== null
  const varianceValue = showVariance && line.unitCost !== undefined ? (variance as number) * line.unitCost : undefined
  const showCost = costEditable && (line.unitCost === 0 || line.newCost !== undefined)

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-2 py-2.5 lg:flex-nowrap transition-colors last:border-b-0',
        line.recount && 'bg-amber-500/5',
        flash && 'bg-primary/10',
        selected && 'bg-primary/5'
      )}
    >
      {reviewing && (
        <Checkbox checked={selected} onCheckedChange={() => onToggleSelect(line.id)} aria-label={t('Select for recount')} />
      )}

      <div className='min-w-0 flex-1 basis-56'>
        <div className='flex items-center gap-1.5'>
          <ClassBadge cls={line.abcClass} className='shrink-0' />
          <span className='truncate font-medium' title={line.name}>
            {line.name}
          </span>
          {line.recount && (
            <span className='inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-500/15 px-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300'>
              <RotateCcw className='size-3' />
              {t('Recount')}
            </span>
          )}
        </div>
        <div className='truncate text-xs text-muted-foreground'>
          {[line.variantLabel, line.barcode, line.unit].filter(Boolean).join(' · ') || line.category || ' '}
        </div>
        {line.postNote && <div className='mt-0.5 text-xs text-amber-700 dark:text-amber-300'>{line.postNote}</div>}
        {serialized && !line.postNote && line.unexpectedImeis?.length > 0 && (
          <div className='mt-0.5 text-xs text-amber-700 dark:text-amber-300'>
            {t('{{n}} scanned unit(s) are not in stock here').replace('{{n}}', String(line.unexpectedImeis.length))}
          </div>
        )}
      </div>

      <div className='flex w-full flex-wrap items-center justify-end gap-3 sm:w-auto lg:flex-nowrap'>
        {!expectedHidden && (
          <div className='w-16 text-right'>
            <div className='text-[11px] text-muted-foreground'>{t('Expected')}</div>
            <div className='tabular-nums'>{fmtQty(counted ? line.systemQtyAtCount : line.systemQtyAtStart)}</div>
          </div>
        )}

        {serialized ? (
          <Button
            variant={counted ? 'outline' : 'default'}
            size='sm'
            className='h-10 min-w-[8.5rem]'
            disabled={!editable && !counted}
            onClick={() => onScanUnits(line)}
          >
            <ScanLine className='mr-1 size-4' />
            {counted ? t('{{n}} scanned').replace('{{n}}', fmtQty(line.countedQty)) : t('Scan units')}
          </Button>
        ) : (
          <div className='flex items-center gap-1'>
            {editable && (
              <Button
                variant='outline'
                size='icon'
                className='size-10 shrink-0'
                aria-label={t('One less')}
                disabled={!counted || (line.countedQty ?? 0) < 1}
                onClick={() => step(-1)}
              >
                <Minus className='size-4' />
              </Button>
            )}
            <Input
              ref={(el) => registerInput(line.id, el)}
              value={value}
              onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
              onFocus={(e) => {
                focused.current = true
                e.currentTarget.select()
              }}
              onBlur={() => {
                focused.current = false
                commit()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (commit()) onEnterNext(line.id)
                } else if (e.key === 'Escape') {
                  setValue(counted ? String(line.countedQty) : '')
                }
              }}
              inputMode='decimal'
              showVoiceInput={false}
              placeholder={t('Count')}
              disabled={!editable}
              aria-label={t('Counted quantity for {{name}}').replace('{{name}}', line.name)}
              className={cn('h-10 w-20 text-center text-base tabular-nums', invalid && 'border-destructive')}
            />
            {editable && (
              <Button
                variant='outline'
                size='icon'
                className='size-10 shrink-0'
                aria-label={t('One more')}
                onClick={() => step(1)}
              >
                <Plus className='size-4' />
              </Button>
            )}
          </div>
        )}

        <div className='w-5 shrink-0'>
          {invalid ? (
            <AlertCircle className='size-4 text-destructive' aria-label={t('Not a valid number')} />
          ) : line.pending ? (
            <span className='mx-auto block size-2 rounded-full bg-amber-500' title={t('Not saved yet')} aria-label={t('Not saved yet')} />
          ) : (
            counted && <Check className='size-4 text-emerald-600/70' aria-label={t('Saved')} />
          )}
        </div>

        {!expectedHidden && (
          <div className='w-20 text-right'>
            <div className='text-[11px] text-muted-foreground'>{t('Difference')}</div>
            <div
              className={cn(
                'font-medium tabular-nums',
                !showVariance && 'text-muted-foreground',
                showVariance && variance! < 0 && 'text-rose-600 dark:text-rose-400',
                showVariance && variance! > 0 && 'text-emerald-600 dark:text-emerald-400'
              )}
            >
              {showVariance ? signed(variance!) : '—'}
            </div>
            {varianceValue !== undefined && varianceValue !== 0 && (
              <div className='text-[11px] text-muted-foreground tabular-nums'>{formatMoney(varianceValue)}</div>
            )}
          </div>
        )}

        {reviewing && (
          <div className='w-full sm:w-48'>
            {showVariance && variance !== 0 ? (
              <Select value={line.reason ?? 'none'} onValueChange={(v) => onChange(line.id, { reason: v === 'none' ? null : (v as VarianceReason) })}>
                <SelectTrigger className={cn('h-9 w-full', !line.reason && 'text-muted-foreground')} aria-label={t('Reason')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='none'>{t('No reason given')}</SelectItem>
                  {REASON_ORDER.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {t(REASON_LABELS[reason])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className='hidden h-9 sm:block' />
            )}
          </div>
        )}
      </div>

      {showCost && (
        <div className='flex w-full items-center justify-end gap-2 text-xs text-muted-foreground'>
          {t('Cost per unit (none set yet)')}
          <Input
            value={cost}
            onChange={(e) => setCost(e.target.value.replace(/[^\d.]/g, ''))}
            onBlur={() => {
              const next = cost.trim() === '' ? null : Number(cost)
              if ((next ?? undefined) !== line.newCost) onChange(line.id, { newCost: next })
            }}
            inputMode='decimal'
            showVoiceInput={false}
            disabled={!editable}
            className='h-8 w-24 text-right'
            placeholder='0'
          />
        </div>
      )}
    </div>
  )
})
