import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Cog,
  Flame,
  Package,
  Paintbrush,
  Plus,
  Scissors,
  Settings,
  Trash2,
} from 'lucide-react'
import { flushSync } from 'react-dom'
import { afterPaint } from '@/lib/invoice-form-keyboard'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  STEP_FIELDS,
  newRoutingRow,
  stepFieldSelector,
  type RoutingDraft,
  type StepField,
} from '../lib/routing-draft'

const COMMON_STEPS: { name: string; icon: ReactNode }[] = [
  { name: 'Cutting', icon: <Scissors className='h-3.5 w-3.5' /> },
  { name: 'Welding', icon: <Flame className='h-3.5 w-3.5' /> },
  { name: 'Painting', icon: <Paintbrush className='h-3.5 w-3.5' /> },
  { name: 'Assembly', icon: <Cog className='h-3.5 w-3.5' /> },
  { name: 'Packing', icon: <Package className='h-3.5 w-3.5' /> },
]

/**
 * The BOM's routing — the steps the product goes through on the floor. Orders copy it
 * with planned time = setup + run × quantity and track each step.
 *
 * Keyboard: Enter moves field to field and on to the next step (adding one after the
 * last). Enter on the name of an empty last step removes it and calls `onFinish`.
 */
export function RoutingEditor({
  rows,
  onChange,
  onFinish,
}: {
  rows: RoutingDraft[]
  onChange: (rows: RoutingDraft[]) => void
  onFinish?: () => void
}) {
  const { t } = useLanguage()
  const rootRef = useRef<HTMLElement>(null)

  // Focus at once (fast typing must not spill into the previous field); wait a paint
  // only if the field isn't on screen yet.
  const focusLater = (selector: string) => {
    const go = () => {
      const el = rootRef.current?.querySelector<HTMLInputElement>(selector)
      el?.focus()
      el?.select?.()
      return !!el
    }
    if (!go()) afterPaint(go)
  }

  const patch = (key: string, p: Partial<RoutingDraft>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...p } : r)))
  const move = (index: number, by: number) => {
    const next = [...rows]
    const [row] = next.splice(index, 1)
    next.splice(index + by, 0, row)
    onChange(next)
  }
  const add = (name = '') => {
    const row = newRoutingRow(name)
    flushSync(() => onChange([...rows, row]))
    focusLater(stepFieldSelector(row.key, name ? 'workCenter' : 'name'))
  }

  const isBlank = (r: RoutingDraft) =>
    !r.name.trim() &&
    !r.workCenter.trim() &&
    !r.instructions.trim() &&
    !(
      Number(r.setupMinutes) ||
      Number(r.runMinutesPerUnit) ||
      Number(r.costPerHour)
    )

  const onFieldKeyDown =
    (index: number, field: StepField) =>
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey) return
      e.preventDefault()
      const row = rows[index]
      // Empty last step: the routing is done.
      if (field === 'name' && index === rows.length - 1 && isBlank(row)) {
        onChange(rows.filter((r) => r.key !== row.key))
        onFinish?.()
        return
      }
      const nextField = STEP_FIELDS[STEP_FIELDS.indexOf(field) + 1]
      if (nextField) return focusLater(stepFieldSelector(row.key, nextField))
      const nextRow = rows[index + 1]
      if (nextRow) return focusLater(stepFieldSelector(nextRow.key, 'name'))
      add()
    }

  const named = rows.filter((r) => r.name.trim()).length

  return (
    <section ref={rootRef} className='bg-card rounded-xl border'>
      <div className='flex flex-wrap items-start justify-between gap-3 px-4 py-3'>
        <div className='flex min-w-0 items-start gap-3'>
          <span className='bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg'>
            <Settings className='h-4.5 w-4.5' />
          </span>
          <div className='min-w-0'>
            <h3 className='text-sm font-semibold'>
              {t('Routing')}{' '}
              <span className='text-muted-foreground font-normal'>
                ({named})
              </span>
            </h3>
            <p className='text-muted-foreground text-xs'>
              {t(
                'The steps on the floor. Orders plan setup + run time × quantity for each and track them; QC and finished goods follow automatically.'
              )}
            </p>
          </div>
        </div>
        <Button
          type='button'
          size='sm'
          variant='outline'
          data-field='routing:add'
          onClick={() => add()}
        >
          <Plus className='mr-1.5 h-3.5 w-3.5' />
          {t('Add step')}
        </Button>
      </div>

      <div className='px-4 pb-4'>
        {rows.length === 0 ? (
          <div className='text-muted-foreground flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 text-xs'>
            <span className='mr-1'>{t('No routing yet. Quick add:')}</span>
            {COMMON_STEPS.map((step) => (
              <Button
                key={step.name}
                type='button'
                size='sm'
                variant='secondary'
                className='h-8 gap-1.5'
                onClick={() => add(t(step.name))}
              >
                {step.icon}
                {t(step.name)}
              </Button>
            ))}
          </div>
        ) : (
          <div className='overflow-hidden rounded-lg border'>
            <div className='bg-muted/40 text-muted-foreground hidden grid-cols-[2.5rem_minmax(0,2fr)_minmax(0,1.5fr)_6rem_6rem_6.5rem_6.5rem] gap-2 border-b px-3 py-2 text-xs font-medium md:grid'>
              <span>#</span>
              <span>{t('Step')}</span>
              <span>{t('Work center')}</span>
              <span>{t('Setup min')}</span>
              <span>{t('Run min / unit')}</span>
              <span>{t('Cost / hour')}</span>
              <span className='text-right'>{t('Actions')}</span>
            </div>
            {rows.map((r, i) => (
              <div
                key={r.key}
                className='space-y-2 border-b px-3 py-2.5 last:border-b-0'
              >
                <div className='grid grid-cols-2 gap-2 md:grid-cols-[2.5rem_minmax(0,2fr)_minmax(0,1.5fr)_6rem_6rem_6.5rem_6.5rem] md:items-center'>
                  <span className='text-muted-foreground hidden text-xs font-medium tabular-nums md:block'>
                    {(i + 1) * 10}
                  </span>
                  <Input
                    className='col-span-2 h-9 md:col-span-1'
                    value={r.name}
                    placeholder={t('e.g. Welding')}
                    aria-label={t('Step')}
                    showVoiceInput={false}
                    data-field={`step:${r.key}:name`}
                    onKeyDown={onFieldKeyDown(i, 'name')}
                    onChange={(e) => patch(r.key, { name: e.target.value })}
                  />
                  <Input
                    className='col-span-2 h-9 md:col-span-1'
                    value={r.workCenter}
                    placeholder={t('Work center')}
                    aria-label={t('Work center')}
                    showVoiceInput={false}
                    data-field={`step:${r.key}:workCenter`}
                    onKeyDown={onFieldKeyDown(i, 'workCenter')}
                    onChange={(e) =>
                      patch(r.key, { workCenter: e.target.value })
                    }
                  />
                  <NumberCell
                    label={t('Setup min')}
                    value={r.setupMinutes}
                    field={`step:${r.key}:setupMinutes`}
                    onKeyDown={onFieldKeyDown(i, 'setupMinutes')}
                    onChange={(v) => patch(r.key, { setupMinutes: v })}
                  />
                  <NumberCell
                    label={t('Run min / unit')}
                    value={r.runMinutesPerUnit}
                    field={`step:${r.key}:runMinutesPerUnit`}
                    onKeyDown={onFieldKeyDown(i, 'runMinutesPerUnit')}
                    onChange={(v) => patch(r.key, { runMinutesPerUnit: v })}
                  />
                  <NumberCell
                    label={t('Cost / hour')}
                    value={r.costPerHour}
                    field={`step:${r.key}:costPerHour`}
                    onKeyDown={onFieldKeyDown(i, 'costPerHour')}
                    onChange={(v) => patch(r.key, { costPerHour: v })}
                  />
                  <div className='flex items-center justify-end gap-0.5'>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='h-8 w-8'
                      tabIndex={-1}
                      disabled={i === 0}
                      aria-label={t('Move up')}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp className='h-3.5 w-3.5' />
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='h-8 w-8'
                      tabIndex={-1}
                      disabled={i === rows.length - 1}
                      aria-label={t('Move down')}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown className='h-3.5 w-3.5' />
                    </Button>
                    <Button
                      type='button'
                      variant='ghost'
                      size='icon'
                      className='h-8 w-8 text-red-600 hover:bg-red-500/10 hover:text-red-600'
                      tabIndex={-1}
                      aria-label={t('Remove step')}
                      onClick={() =>
                        onChange(rows.filter((x) => x.key !== r.key))
                      }
                    >
                      <Trash2 className='h-4 w-4' />
                    </Button>
                  </div>
                </div>
                <Input
                  className='h-8 text-xs md:ml-12 md:w-[calc(100%-3rem)]'
                  value={r.instructions}
                  placeholder={t('Work instructions (optional)')}
                  aria-label={t('Work instructions')}
                  showVoiceInput={false}
                  data-field={`step:${r.key}:instructions`}
                  onKeyDown={onFieldKeyDown(i, 'instructions')}
                  onChange={(e) =>
                    patch(r.key, { instructions: e.target.value })
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function NumberCell({
  label,
  value,
  field,
  onChange,
  onKeyDown,
}: {
  label: string
  value: string
  field: string
  onChange: (v: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
}) {
  return (
    <label className='grid gap-1'>
      <span className='text-muted-foreground text-[11px] md:sr-only'>
        {label}
      </span>
      <Input
        type='number'
        min={0}
        step='any'
        inputMode='decimal'
        className='h-9'
        value={value}
        data-field={field}
        onKeyDown={onKeyDown}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  )
}
