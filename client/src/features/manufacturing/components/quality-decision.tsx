import { Check, Minus, Plus, Recycle, Trash2, X } from 'lucide-react'
import type { RejectDisposition } from '@/stores/manufacturing.api'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { fmtQty } from '../lib/constants'

const EPS = 1e-6
const COMMON_DEFECTS = [
  'Surface defect',
  'Dimension out of spec',
  'Electrical fault',
  'Missing part',
  'Damaged in handling',
]

export type QualityValue = {
  good: number
  disposition: RejectDisposition
  reason: string
}

/**
 * The inspection decision for a quantity of output: how many passed, and what happens to
 * the rest (scrap / rework) and why. Used when receiving finished goods directly and when
 * inspecting units held in QC.
 */
export function QualityDecision({
  total,
  unit,
  value,
  onChange,
}: {
  total: number
  unit: string
  value: QualityValue
  onChange: (value: QualityValue) => void
}) {
  const { t } = useLanguage()
  const good = Math.min(Math.max(0, value.good), total)
  const rejected = Math.max(0, total - good)
  const set = (patch: Partial<QualityValue>) => onChange({ ...value, ...patch })
  const pct = total > 0 ? Math.round((good / total) * 100) : 0
  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <div className='rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3'>
          <Label className='flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400'>
            <Check className='h-4 w-4' />
            {t('Passed — to finished stock')}
          </Label>
          <div className='bg-background mt-2 flex h-10 items-center overflow-hidden rounded-md border'>
            <button
              type='button'
              aria-label={t('Fewer passed')}
              onClick={() => set({ good: Math.max(0, good - 1) })}
              className='hover:bg-muted flex h-full w-9 items-center justify-center border-r'
            >
              <Minus className='h-4 w-4' />
            </button>
            <Input
              aria-label={t('Passed quantity')}
              inputMode='decimal'
              showVoiceInput={false}
              value={String(+good.toFixed(6))}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/[^\d.]/g, ''))
                if (Number.isFinite(n)) set({ good: Math.min(n, total) })
              }}
              className='h-full flex-1 rounded-none border-0 text-center text-lg font-semibold tabular-nums shadow-none focus-visible:ring-0'
            />
            <button
              type='button'
              aria-label={t('More passed')}
              onClick={() => set({ good: Math.min(total, good + 1) })}
              className='hover:bg-muted flex h-full w-9 items-center justify-center border-l'
            >
              <Plus className='h-4 w-4' />
            </button>
            <span className='text-muted-foreground bg-muted/50 flex h-full items-center border-l px-2.5 text-xs'>
              {getUnitLabel(unit)}
            </span>
          </div>
        </div>
        <div
          className={cn(
            'rounded-xl border p-3',
            rejected > EPS ? 'border-rose-500/30 bg-rose-500/5' : 'bg-muted/30'
          )}
        >
          <Label
            className={cn(
              'flex items-center gap-1.5',
              rejected > EPS
                ? 'text-rose-700 dark:text-rose-400'
                : 'text-muted-foreground'
            )}
          >
            <X className='h-4 w-4' />
            {t('Rejected')}
          </Label>
          <div className='mt-2 flex h-10 items-center text-lg font-semibold tabular-nums'>
            {fmtQty(rejected)}{' '}
            <span className='text-muted-foreground ml-1.5 text-xs font-normal'>
              {getUnitLabel(unit)}
            </span>
          </div>
        </div>
      </div>

      <div className='space-y-1.5'>
        <div className='text-muted-foreground flex justify-between text-xs'>
          <span>{t('Pass rate')}</span>
          <span className='tabular-nums'>{pct}%</span>
        </div>
        <div className='bg-muted flex h-2 gap-[2px] overflow-hidden rounded-full'>
          <div className='h-full bg-emerald-600' style={{ width: `${pct}%` }} />
          {rejected > EPS && <div className='h-full flex-1 bg-rose-600' />}
        </div>
        <div className='flex flex-wrap gap-1.5 pt-1'>
          <button
            type='button'
            onClick={() => set({ good: total })}
            className='hover:bg-muted rounded-full border px-2.5 py-1 text-xs'
          >
            {t('All passed')}
          </button>
          <button
            type='button'
            onClick={() => set({ good: 0 })}
            className='hover:bg-muted rounded-full border px-2.5 py-1 text-xs'
          >
            {t('All rejected')}
          </button>
        </div>
      </div>

      {rejected > EPS && (
        <div className='space-y-3 rounded-xl border p-3'>
          <div className='grid gap-1.5'>
            <Label>
              {t('Rejected units go to')} ({fmtQty(rejected)})
            </Label>
            <div
              role='radiogroup'
              aria-label={t('Rejected units go to')}
              className='grid grid-cols-2 gap-2'
            >
              {(
                [
                  ['scrap', Trash2, 'Scrap', 'Written off'],
                  ['rework', Recycle, 'Rework', 'Fixed, then inspected again'],
                ] as const
              ).map(([d, Icon, label, hint]) => (
                <button
                  key={d}
                  type='button'
                  role='radio'
                  aria-checked={value.disposition === d}
                  onClick={() => set({ disposition: d })}
                  className={cn(
                    'flex items-start gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors',
                    value.disposition === d
                      ? 'border-primary bg-primary/5 ring-primary/30 ring-1'
                      : 'hover:bg-muted/50'
                  )}
                >
                  <Icon className='mt-0.5 h-4 w-4 shrink-0' />
                  <span>
                    <span className='block font-medium'>{t(label)}</span>
                    <span className='text-muted-foreground text-xs'>
                      {t(hint)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>
          <div className='grid gap-1.5'>
            <Label htmlFor='reject-reason'>{t('Reason')}</Label>
            <div className='flex flex-wrap gap-1.5'>
              {COMMON_DEFECTS.map((d) => (
                <button
                  key={d}
                  type='button'
                  aria-pressed={value.reason === t(d)}
                  onClick={() => set({ reason: t(d) })}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors',
                    value.reason === t(d)
                      ? 'border-foreground bg-foreground text-background'
                      : 'hover:bg-muted'
                  )}
                >
                  {t(d)}
                </button>
              ))}
            </div>
            <Input
              id='reject-reason'
              value={value.reason}
              onChange={(e) => set({ reason: e.target.value })}
              placeholder={t('Or describe the defect')}
            />
          </div>
        </div>
      )}
    </div>
  )
}
