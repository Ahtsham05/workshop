import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Boxes, Factory, Loader2, Plus, Target, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useCreateProductionTargetMutation,
  useGetProductionTargetsQuery,
  useUpdateProductionTargetMutation,
  type ProductionTarget,
  type TargetInput,
  type TargetMeasure,
  type TargetPeriodType,
} from '@/stores/manufacturing.api'
import { useStateDraft } from '@/hooks/use-form-draft'
import { getBusinessToday } from '@/lib/business-timezone'
import { getErrorMessage } from '@/lib/get-error-message'
import { afterPaint } from '@/lib/invoice-form-keyboard'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { FormDraftNotice } from '@/components/form-draft-notice'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  TARGET_MEASURE_LABELS,
  TARGET_PERIOD_LABELS,
  fmtDay,
  fmtQty,
} from '../lib/constants'
import {
  daysInclusive,
  nextPeriod,
  periodRange,
  periodTitle,
} from '../lib/targets'
import { useCatalogProducts } from '../lib/product-catalog'
import { ProductPicker, type PickedProduct } from './product-picker'
import { ModeCard } from './receipt-parts'

/** What a target can be set on: anything the factory makes (packs are finished goods too). */
const TARGET_PRODUCT_TYPES = 'finished_good,sub_assembly,by_product'
const PERIOD_TYPES = Object.keys(TARGET_PERIOD_LABELS) as TargetPeriodType[]
const MEASURES: TargetMeasure[] = ['production', 'stock']
// The server takes at most this many lines, and quantities from this small up to this big.
const MAX_LINES = 200
const MIN_QTY = 0.000001
const MAX_QTY = 1e9

const PERIOD_SHORTCUTS: Partial<Record<TargetPeriodType, [string, string]>> = {
  day: ['Today', 'Tomorrow'],
  week: ['This week', 'Next week'],
  month: ['This month', 'Next month'],
  quarter: ['This quarter', 'Next quarter'],
  year: ['This year', 'Next year'],
}

const LINE_GRID =
  'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2 lg:grid-cols-[1.25rem_minmax(0,1fr)_5.5rem_8.5rem_5.5rem_minmax(0,10rem)_2rem]'

const isPlainEnter = (e: React.KeyboardEvent) =>
  e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey

const field = (id: string) => `[data-field="${id}"]`
const lineField = (key: string, name: 'product' | 'qty' | 'note') => field(`target-line:${key}:${name}`)

/** Digits and one decimal point: pasted "1,000" stays 1000, "e" and "-" never get in. */
const cleanQty = (raw: string) => {
  const digits = raw.replace(/[^\d.]/g, '')
  const dot = digits.indexOf('.')
  return dot < 0 ? digits : digits.slice(0, dot + 1) + digits.slice(dot + 1).replace(/\./g, '')
}
const roundFigure = (value: number) => Math.round(value * 100) / 100

interface LineDraft {
  key: string
  id?: string
  product: { id: string; name: string; unit: string; stock?: number } | null
  quantity: string
  notes: string
}

let lineSeq = 0
const blankLine = (): LineDraft => ({
  key: `l${++lineSeq}`,
  product: null,
  quantity: '',
  notes: '',
})
const hasContent = (l: LineDraft) => !!l.product || !!l.quantity.trim() || !!l.notes.trim()

/**
 * Create or edit a production target. `copyFrom` opens a new target for the period after
 * that one with the same products and quantities ("Copy to next period").
 *
 * Keyboard (like the invoice screen): the product list opens by itself; Enter picks and
 * jumps to Target qty; Enter there goes to the next row (a new one with its list open);
 * ↑/↓ move between rows. Enter on an empty search finishes the list and lands on Create,
 * so one more Enter saves. Target for → date → Name → first row also walk with Enter, and
 * Ctrl+Enter saves from anywhere.
 */
export function TargetDialog({
  target,
  copyFrom,
  onClose,
  onSaved,
}: {
  target?: ProductionTarget
  copyFrom?: ProductionTarget
  onClose: () => void
  onSaved?: (target: ProductionTarget) => void
}) {
  const { t } = useLanguage()
  const source = target || copyFrom
  const initial = useMemo(() => {
    if (!source) {
      const range = periodRange('month', getBusinessToday())
      return { periodType: 'month' as TargetPeriodType, ...range }
    }
    if (target) {
      return {
        periodType: target.periodType,
        startDay: target.startDay,
        endDay: target.endDay,
      }
    }
    return {
      periodType: source.periodType,
      ...nextPeriod(source.periodType, source.startDay, source.endDay),
    }
  }, [source, target])

  const [periodType, setPeriodType] = useState<TargetPeriodType>(initial.periodType)
  const [startDay, setStartDay] = useState(initial.startDay)
  const [endDay, setEndDay] = useState(initial.endDay)
  // What the date field shows. The period snaps to its first day, the field must not: typing
  // the 15th of a monthly target would jump back to the 1st under the person's fingers.
  const [anchor, setAnchor] = useState(() => (source ? initial.startDay : getBusinessToday()))
  // The name follows the period until someone types their own.
  const [title, setTitle] = useState(target?.title || '')
  const [titleEdited, setTitleEdited] = useState(
    () => !!target && target.title !== periodTitle(target.periodType, target.startDay, target.endDay, t)
  )
  const [measure, setMeasure] = useState<TargetMeasure>(source?.measure || 'production')
  const [alertAt, setAlertAt] = useState(String(source?.alertAtPercent ?? 90))
  const [notes, setNotes] = useState(target?.notes || copyFrom?.notes || '')
  const [lines, setLines] = useState<LineDraft[]>(() =>
    source?.lines.length
      ? source.lines.map((l) => ({
          key: `l${++lineSeq}`,
          id: target ? l.id : undefined,
          product: { id: l.productId, name: l.productName, unit: l.unit, stock: l.stock },
          quantity: String(l.target),
          notes: l.notes,
        }))
      : [blankLine()]
  )
  const [showErrors, setShowErrors] = useState(false)
  // Rows that were refused (Enter on an empty qty, or a failed save) show why. A row still
  // being typed stays quiet.
  const [flagged, setFlagged] = useState<ReadonlySet<string>>(new Set())
  const [openPicker, setOpenPicker] = useState<string | null>(null)

  // An accidental close keeps a new target's rows; an edit always shows what is stored.
  const draft = useStateDraft(
    {
      periodType,
      anchor,
      startDay,
      endDay,
      title,
      titleEdited,
      measure,
      alertAt,
      notes,
      lines: lines.map(({ key: _key, ...line }) => line),
    },
    (v) => {
      setPeriodType(v.periodType)
      setAnchor(v.anchor)
      setStartDay(v.startDay)
      setEndDay(v.endDay)
      setTitle(v.title)
      setTitleEdited(v.titleEdited)
      setMeasure(v.measure)
      setAlertAt(v.alertAt)
      setNotes(v.notes)
      setOpenPicker(null)
      setLines(
        v.lines?.length ? v.lines.map((l) => ({ ...l, key: `l${++lineSeq}` })) : [blankLine()]
      )
    },
    { key: 'production-target', enabled: !source, label: 'production target' }
  )

  const catalog = useCatalogProducts({ productType: TARGET_PRODUCT_TYPES })
  const liveStock = useMemo(
    () => new Map(catalog.products.map((p) => [p.id, p.stockQuantity])),
    [catalog.products]
  )
  const { data: existing } = useGetProductionTargetsQuery({ phase: 'all', limit: 100 })

  const [create, { isLoading: creating }] = useCreateProductionTargetMutation()
  const [update, { isLoading: updating }] = useUpdateProductionTargetMutation()
  const saving = creating || updating

  const autoTitle = periodTitle(periodType, startDay, endDay, t)
  const shownTitle = titleEdited ? title : autoTitle
  const days = startDay && endDay && startDay <= endDay ? daysInclusive(startDay, endDay) : 0
  const today = getBusinessToday()

  // Same product already targeted over these dates: allowed, but rarely what was meant.
  const overlapping = useMemo(() => {
    const byProduct = new Map<string, { number: string; title: string; quantity: number; unit: string }>()
    if (!days) return byProduct
    existing?.results.forEach((other) => {
      if (other.id === target?.id || other.startDay > endDay || other.endDay < startDay) return
      other.lines.forEach((l) => {
        if (byProduct.has(l.productId)) return
        byProduct.set(l.productId, {
          number: other.targetNumber,
          title: other.title,
          quantity: l.target,
          unit: l.unit,
        })
      })
    })
    return byProduct
  }, [existing, target?.id, startDay, endDay, days])

  const changePeriodType = (type: TargetPeriodType) => {
    setPeriodType(type)
    if (type !== 'custom') {
      const range = periodRange(type, anchor || getBusinessToday())
      setStartDay(range.startDay)
      setEndDay(range.endDay)
    }
  }
  const changeAnchor = (day: string) => {
    if (!day) return
    setAnchor(day)
    const range = periodRange(periodType, day)
    setStartDay(range.startDay)
    setEndDay(range.endDay)
  }
  const shortcuts = PERIOD_SHORTCUTS[periodType]
  const nextStart = useMemo(() => {
    if (periodType === 'custom') return ''
    const current = periodRange(periodType, today)
    return nextPeriod(periodType, current.startDay, current.endDay).startDay
  }, [periodType, today])
  const patchLine = (key: string, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  const filled = lines.filter(hasContent)
  const qtyIsValid = (l: LineDraft) => Number(l.quantity) >= MIN_QTY && Number(l.quantity) <= MAX_QTY
  const lineError = (l: LineDraft) =>
    !l.product
      ? t('Choose a product')
      : Number(l.quantity) > MAX_QTY
        ? t('That quantity is too large')
        : !qtyIsValid(l)
          ? t('Enter the target quantity')
          : null
  const periodError =
    !startDay || !endDay
      ? t('Choose the period')
      : startDay > endDay
        ? t('The start date is after the end date')
        : days > 400
          ? t('A target can cover at most 400 days')
          : null
  const alertValue = Math.round(Number(alertAt))
  // Only a quantity-produced target has a pace; a stock target never reads this.
  const usesPace = measure === 'production'
  const alertError =
    usesPace && !(alertValue >= 1 && alertValue <= 100) ? t('Between 1 and 100') : null
  const hasErrors =
    !!periodError || !!alertError || !filled.length || filled.some((l) => lineError(l))

  // ---- keyboard chain ---------------------------------------------------------------
  // Focus at once (fast typing must not spill into the previous field); wait a paint only
  // if the field isn't on screen yet.
  const focusField = (selector: string) => {
    const go = () => {
      const el = document.querySelector<HTMLElement>(selector)
      el?.focus()
      if (el instanceof HTMLInputElement) el.select()
      return !!el
    }
    if (!go()) afterPaint(go)
  }
  // A row's trigger may be below the fold, and the list hangs off it.
  const openLine = (key: string) => {
    setOpenPicker(key)
    afterPaint(() =>
      document.querySelector(lineField(key, 'product'))?.scrollIntoView({ block: 'nearest' })
    )
  }
  const addLine = () => {
    const blank = lines.find((l) => !hasContent(l))
    if (blank) return openLine(blank.key)
    if (lines.length >= MAX_LINES) {
      toast.error(t('A target can have at most {{n}} products').replace('{{n}}', String(MAX_LINES)))
      return
    }
    const fresh = blankLine()
    setLines((prev) => [...prev, fresh])
    openLine(fresh.key)
  }
  /** Arrive on a row: its search when it has no product yet, else its Target qty. */
  const goToLine = (index: number) => {
    const line = lines[index]
    if (!line) return addLine()
    if (line.product) focusField(lineField(line.key, 'qty'))
    else openLine(line.key)
  }
  /** The first row that still needs something; a complete list starts at its first qty. */
  const goToEntry = () => {
    const index = lines.findIndex((l) => !l.product || !qtyIsValid(l))
    goToLine(Math.max(index, 0))
  }
  // Nothing more to add: drop the empty rows and stand on Create, one Enter from saving.
  const finishLines = () => {
    setLines(filled)
    focusField(field('target:save'))
  }
  const flag = (key: string) => setFlagged((prev) => new Set(prev).add(key))

  /** Enter on a row's qty or note: on to the next row only if this one is complete. */
  const onLineEnter = (e: React.KeyboardEvent, line: LineDraft, index: number) => {
    e.preventDefault()
    // A held key must not race through the rows and onto the Create button.
    if (e.repeat) return
    if (!line.product) return openLine(line.key)
    if (!qtyIsValid(line)) {
      flag(line.key)
      focusField(lineField(line.key, 'qty'))
      return
    }
    goToLine(index + 1)
  }
  const onLineKeyDown =
    (line: LineDraft, index: number, column: 'qty' | 'note') => (e: React.KeyboardEvent) => {
      if (isPlainEnter(e)) return onLineEnter(e, line, index)
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
      const other = lines[index + (e.key === 'ArrowDown' ? 1 : -1)]
      if (!other) return
      e.preventDefault()
      focusField(lineField(other.key, other.product ? column : 'product'))
    }

  const pickProduct = (line: LineDraft, p: PickedProduct) => {
    // The same product twice would be refused on save: go to the row it is already on.
    const other = lines.find((l) => l.key !== line.key && l.product?.id === p.id)
    if (other) {
      toast.info(`${p.name}: ${t('already on this target, update its quantity here')}`)
      if (!hasContent(line)) setLines((prev) => prev.filter((l) => l.key !== line.key))
      focusField(lineField(other.key, 'qty'))
      return
    }
    patchLine(line.key, {
      product: { id: p.id, name: p.name, unit: p.unit, stock: p.stockQuantity },
    })
    focusField(lineField(line.key, 'qty'))
  }

  const removeLine = (key: string, index: number) => {
    const rest = lines.filter((l) => l.key !== key)
    const next = rest.length ? rest : [blankLine()]
    setLines(next)
    // The delete button is about to vanish: keep the place in the list.
    const neighbour = next[index] ?? next[index - 1]
    afterPaint(() => focusField(lineField(neighbour.key, neighbour.product ? 'qty' : 'product')))
  }

  // Start where the work is: on the product search, once the dialog has settled (and any
  // draft has been put back).
  const goToEntryRef = useRef(goToEntry)
  goToEntryRef.current = goToEntry
  useEffect(() => {
    afterPaint(() => goToEntryRef.current())
  }, [])

  const save = async () => {
    if (saving) return
    if (hasErrors) {
      setShowErrors(true)
      const bad = filled.filter((l) => lineError(l))
      setFlagged(new Set(bad.map((l) => l.key)))
      // Take the person straight to the first thing to fix.
      if (periodError) focusField(field(periodType === 'custom' ? 'target:from' : 'target:anchor'))
      else if (!filled.length) {
        toast.error(t('Add at least one product with its target quantity'))
        openLine(lines[0].key)
      } else if (bad.length) {
        if (bad[0].product) focusField(lineField(bad[0].key, 'qty'))
        else openLine(bad[0].key)
      } else focusField(field('target:alert'))
      return
    }
    const body: TargetInput = {
      title: shownTitle.trim() || autoTitle,
      periodType,
      startDay,
      endDay,
      measure,
      alertAtPercent: usesPace ? alertValue : source?.alertAtPercent || 90,
      notes: notes.trim(),
      lines: filled.map((l) => ({
        ...(l.id ? { id: l.id } : {}),
        productId: l.product!.id,
        targetQuantity: Number(l.quantity),
        notes: l.notes.trim(),
      })),
    }
    try {
      const saved = target
        ? await update({ id: target.id, ...body }).unwrap()
        : await create(body).unwrap()
      draft.clear()
      toast.success(
        target
          ? t('Target {{n}} updated').replace('{{n}}', saved.targetNumber)
          : t('Target {{n}} created').replace('{{n}}', saved.targetNumber)
      )
      onSaved?.(saved)
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not save the target')))
    }
  }

  // Ctrl/Cmd+Enter saves from any field (captured first, so an open list can't eat it) —
  // except from another dialog on top, e.g. the Add product form opened from the search.
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || !(e.ctrlKey || e.metaKey) || e.altKey) return
      const from = (e.target as Element | null)?.closest?.('[role="dialog"]')
      if (
        from &&
        !from.hasAttribute('data-target-dialog') &&
        !from.closest('[data-radix-popper-content-wrapper]')
      )
        return
      e.preventDefault()
      e.stopPropagation()
      void saveRef.current()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [])

  const totalUnits = new Set(filled.map((l) => l.product?.unit))
  const totalQty = filled.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0)

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent
        data-target-dialog
        // A fixed height: a centred dialog that grows would shift every field on each new row.
        className='flex h-[min(92vh,50rem)] flex-col gap-0 p-0 sm:max-w-3xl lg:max-w-5xl'
        // A stray click beside a long list must not throw it away; ✕, Cancel and Esc still close.
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader className='border-b px-5 py-4 text-left'>
          <div className='flex items-center gap-3 pr-6'>
            <span className='flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400'>
              <Target className='h-5 w-5' />
            </span>
            <div className='min-w-0'>
              <DialogTitle>
                {target
                  ? `${t('Edit target')} ${target.targetNumber}`
                  : t('New production target')}
              </DialogTitle>
              <DialogDescription>
                {t(
                  'What to make, how much, and by when. Progress is measured from finished goods received — no need to enter it.'
                )}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4'>
          <FormDraftNotice draft={draft} />
          <section className='space-y-2'>
            <h3 className='text-sm font-semibold'>{t('Period')}</h3>
            <div
              className={cn(
                'grid grid-cols-1 gap-3 sm:grid-cols-3',
                periodType === 'custom' && 'lg:grid-cols-4'
              )}
            >
              <div
                className='min-w-0 space-y-1.5'
                // Closed list: Enter keeps what is picked and moves on, ↓ opens it.
                onKeyDownCapture={(e) => {
                  const el = e.target as HTMLElement
                  if (el.getAttribute('role') !== 'combobox' || el.getAttribute('aria-expanded') === 'true')
                    return
                  if (isPlainEnter(e)) {
                    e.preventDefault()
                    e.stopPropagation()
                    focusField(field(periodType === 'custom' ? 'target:from' : 'target:anchor'))
                  } else if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    el.click()
                  }
                }}
              >
                <Label htmlFor='target-period-type'>{t('Target for')}</Label>
                <Select value={periodType} onValueChange={(v) => changePeriodType(v as TargetPeriodType)}>
                  <SelectTrigger id='target-period-type' className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PERIOD_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {t(TARGET_PERIOD_LABELS[type])}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {periodType === 'custom' ? (
                <>
                  <div className='min-w-0 space-y-1.5'>
                    <Label htmlFor='target-from'>{t('From')}</Label>
                    <Input
                      id='target-from'
                      type='date'
                      data-field='target:from'
                      value={startDay}
                      onChange={(e) => {
                        if (!e.target.value) return
                        setStartDay(e.target.value)
                        setAnchor(e.target.value)
                      }}
                      onKeyDown={(e) => {
                        if (!isPlainEnter(e)) return
                        e.preventDefault()
                        focusField(field('target:to'))
                      }}
                    />
                  </div>
                  <div className='min-w-0 space-y-1.5'>
                    <Label htmlFor='target-to'>{t('To')}</Label>
                    <Input
                      id='target-to'
                      type='date'
                      data-field='target:to'
                      value={endDay}
                      onChange={(e) => e.target.value && setEndDay(e.target.value)}
                      onKeyDown={(e) => {
                        if (!isPlainEnter(e)) return
                        e.preventDefault()
                        focusField(field('target:title'))
                      }}
                    />
                  </div>
                </>
              ) : (
                <div className='min-w-0 space-y-1.5'>
                  <Label htmlFor='target-anchor'>
                    {periodType === 'day' ? t('Date') : t('Any date in the period')}
                  </Label>
                  <Input
                    id='target-anchor'
                    type='date'
                    data-field='target:anchor'
                    value={anchor}
                    onChange={(e) => changeAnchor(e.target.value)}
                    onKeyDown={(e) => {
                      if (!isPlainEnter(e)) return
                      e.preventDefault()
                      focusField(field('target:title'))
                    }}
                  />
                </div>
              )}
              <div className={cn('min-w-0 space-y-1.5', periodType === 'custom' && 'sm:col-span-3 lg:col-span-1')}>
                <Label htmlFor='target-title'>{t('Name')}</Label>
                <Input
                  id='target-title'
                  data-field='target:title'
                  value={shownTitle}
                  maxLength={120}
                  onChange={(e) => {
                    setTitle(e.target.value)
                    setTitleEdited(true)
                  }}
                  onKeyDown={(e) => {
                    if (!isPlainEnter(e)) return
                    e.preventDefault()
                    goToEntry()
                  }}
                  placeholder={autoTitle}
                />
              </div>
            </div>
            <div className='flex min-h-6 flex-wrap items-center gap-x-3 gap-y-1 text-xs'>
              <p className='text-muted-foreground'>
                {periodError ? (
                  <span className='text-destructive'>{periodError}</span>
                ) : days ? (
                  <>
                    {fmtDay(startDay)} – {fmtDay(endDay)} ·{' '}
                    {days} {t(days === 1 ? 'day' : 'days')}
                  </>
                ) : null}
              </p>
              {shortcuts && (
                <div className='flex gap-1.5'>
                  {shortcuts.map((label, i) => {
                    const day = i === 0 ? today : nextStart
                    return (
                      <button
                        key={label}
                        type='button'
                        aria-pressed={startDay === periodRange(periodType, day).startDay}
                        onClick={() => changeAnchor(day)}
                        className='hover:bg-muted aria-pressed:bg-primary/10 aria-pressed:border-primary/40 aria-pressed:text-foreground text-muted-foreground rounded-full border px-2.5 py-0.5 transition-colors'
                      >
                        {t(label)}
                      </button>
                    )
                  })}
                </div>
              )}
              {days > 0 && endDay < today && (
                <p className='text-amber-700 dark:text-amber-400'>
                  {t('This period has already ended, so the target will open as achieved or missed.')}
                </p>
              )}
            </div>
          </section>

          <section className='space-y-3'>
            <h3 className='text-sm font-semibold'>{t('Measure progress by')}</h3>
            <div
              role='radiogroup'
              aria-label={t('Measure progress by')}
              className='grid grid-cols-1 gap-2 sm:grid-cols-2'
              onKeyDown={(e) => {
                const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')]
                const at = radios.indexOf(e.target as HTMLElement)
                if (at < 0) return
                if (isPlainEnter(e)) {
                  e.preventDefault()
                  setMeasure(MEASURES[at])
                  goToEntry()
                } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
                  e.preventDefault()
                  const next = (at + 1) % MEASURES.length
                  setMeasure(MEASURES[next])
                  radios[next].focus()
                }
              }}
            >
              <ModeCard
                on={measure === 'production'}
                onClick={() => setMeasure('production')}
                icon={Factory}
                title={t(TARGET_MEASURE_LABELS.production.label)}
                text={t(TARGET_MEASURE_LABELS.production.hint)}
              />
              <ModeCard
                on={measure === 'stock'}
                onClick={() => setMeasure('stock')}
                icon={Boxes}
                title={t(TARGET_MEASURE_LABELS.stock.label)}
                text={t(TARGET_MEASURE_LABELS.stock.hint)}
              />
            </div>
          </section>

          <section className='space-y-2'>
            <div className='flex items-baseline justify-between gap-3'>
              <h3 className='text-sm font-semibold'>
                {t('Products')}{' '}
                <span className='text-muted-foreground font-normal'>({filled.length})</span>
              </h3>
              <p className='text-muted-foreground text-xs max-lg:hidden'>
                <Kbd>Enter</Kbd> {t('on Target qty adds the next row')} · {t('on an empty search finishes the list')}
              </p>
            </div>
            <div className='rounded-lg border'>
              <div
                className={cn(
                  LINE_GRID,
                  'text-muted-foreground bg-muted/30 rounded-t-lg border-b px-3 py-1.5 text-xs font-medium max-lg:hidden'
                )}
              >
                <span>#</span>
                <span>{t('Product')}</span>
                <span className='text-right'>{t('In stock')}</span>
                <span className='text-right'>{t('Target qty')}</span>
                <span className='text-right'>{usesPace ? t('Per day') : t('Still needed')}</span>
                <span>{t('Note')}</span>
                <span />
              </div>
              <ul className='divide-y'>
                {lines.map((line, index) => {
                  const error =
                    flagged.has(line.key) && hasContent(line) ? lineError(line) : null
                  const qty = Number(line.quantity)
                  const unit = line.product?.unit
                  const stock = line.product
                    ? (liveStock.get(line.product.id) ?? line.product.stock)
                    : undefined
                  const needed = stock === undefined ? null : Math.max(0, qty - stock)
                  const overlap = line.product ? overlapping.get(line.product.id) : undefined
                  return (
                    <li
                      key={line.key}
                      className='focus-within:bg-muted/30 p-3 transition-colors lg:py-2'
                    >
                      <div className={LINE_GRID}>
                        <span className='text-muted-foreground text-xs tabular-nums max-lg:hidden'>
                          {index + 1}
                        </span>
                        <div className='col-span-2 min-w-0 lg:col-span-1'>
                          <ProductPicker
                            value={line.product}
                            productType={TARGET_PRODUCT_TYPES}
                            createAs='finished_good'
                            placeholder={t('Search finished goods…')}
                            className={cn(error && !line.product && 'border-destructive')}
                            data-field={`target-line:${line.key}:product`}
                            open={openPicker === line.key}
                            onOpenChange={(o) => setOpenPicker(o ? line.key : null)}
                            onChange={(p) => pickProduct(line, p)}
                            onEmptyEnter={
                              line.product
                                ? () => focusField(lineField(line.key, 'qty'))
                                : filled.length
                                  ? finishLines
                                  : undefined
                            }
                          />
                        </div>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          className='h-8 w-8 lg:order-last'
                          aria-label={`${t('Remove line')} ${index + 1}`}
                          disabled={lines.length === 1 && !hasContent(line)}
                          onClick={() => removeLine(line.key, index)}
                        >
                          <Trash2 className='h-4 w-4' />
                        </Button>
                        <Figure
                          label={t('In stock')}
                          value={stock === undefined ? null : `${fmtQty(stock)} ${unit}`}
                          className='max-lg:order-last'
                        />
                        <div className='relative min-w-0'>
                          <Input
                            inputMode='decimal'
                            enterKeyHint='next'
                            autoComplete='off'
                            showVoiceInput={false}
                            data-field={`target-line:${line.key}:qty`}
                            value={line.quantity}
                            onChange={(e) => patchLine(line.key, { quantity: cleanQty(e.target.value) })}
                            onKeyDown={onLineKeyDown(line, index, 'qty')}
                            placeholder={t('Target qty')}
                            aria-label={`${t('Target quantity')} ${index + 1}`}
                            aria-invalid={!!error && !!line.product}
                            className='pr-12 text-right tabular-nums'
                          />
                          {unit && (
                            <span className='text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs'>
                              {unit}
                            </span>
                          )}
                        </div>
                        <Figure
                          label={usesPace ? t('Per day') : t('Still needed')}
                          value={
                            !line.product || !(qty > 0) || !days
                              ? null
                              : usesPace
                                ? `${fmtQty(roundFigure(qty / days))} ${unit}`
                                : needed === null
                                  ? null
                                  : `${fmtQty(needed)} ${unit}`
                          }
                          className='max-lg:order-last max-lg:col-span-2'
                        />
                        <div className='col-span-2 min-w-0 max-lg:col-span-2 lg:col-span-1'>
                          <Input
                            value={line.notes}
                            maxLength={300}
                            enterKeyHint='next'
                            data-field={`target-line:${line.key}:note`}
                            onChange={(e) => patchLine(line.key, { notes: e.target.value })}
                            onKeyDown={onLineKeyDown(line, index, 'note')}
                            placeholder={t('Optional')}
                            aria-label={`${t('Note for this product (optional)')} ${index + 1}`}
                          />
                        </div>
                      </div>
                      {error && <p className='text-destructive mt-1.5 text-xs lg:pl-7'>{error}</p>}
                      {!usesPace && line.product && qty > 0 && needed === 0 && (
                        <p className='mt-1.5 text-xs text-amber-700 lg:pl-7 dark:text-amber-400'>
                          {t('Stock is already at this level, so this line opens as achieved.')}
                        </p>
                      )}
                      {overlap && (
                        <p className='mt-1.5 text-xs text-amber-700 lg:pl-7 dark:text-amber-400'>
                          {t('Also on')} {overlap.number} ({overlap.title}): {fmtQty(overlap.quantity)}{' '}
                          {overlap.unit}. {t('Those dates overlap and both targets count the same output.')}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
              <div className='border-t p-1.5'>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  className='text-muted-foreground w-full justify-start'
                  onClick={addLine}
                >
                  <Plus className='h-4 w-4' />
                  {t('Add product')}
                </Button>
              </div>
            </div>
          </section>

          <section
            className={cn('grid grid-cols-1 gap-3', usesPace && 'sm:grid-cols-[12rem_minmax(0,1fr)]')}
          >
            {usesPace && (
            <div className='space-y-1.5'>
              <Label htmlFor='target-alert'>{t('Alert below pace')}</Label>
              <div className='relative'>
                <Input
                  id='target-alert'
                  data-field='target:alert'
                  type='number'
                  min={1}
                  max={100}
                  value={alertAt}
                  onChange={(e) => setAlertAt(e.target.value)}
                  onKeyDown={(e) => {
                    if (!isPlainEnter(e)) return
                    e.preventDefault()
                    focusField(field('target:notes'))
                  }}
                  className='[appearance:textfield] pr-8 tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'
                />
                <span className='text-muted-foreground pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs'>
                  %
                </span>
              </div>
              <p className={alertError && showErrors ? 'text-destructive text-xs' : 'text-muted-foreground text-xs'}>
                {alertError && showErrors
                  ? alertError
                  : t('Flag "at risk" when made is under this share of the pace to date.')}
              </p>
            </div>
            )}
            <div className='space-y-1.5'>
              <Label htmlFor='target-notes'>{t('Notes')}</Label>
              <Textarea
                id='target-notes'
                data-field='target:notes'
                rows={3}
                maxLength={1000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t('Shift plan, customer order, reason for the target …')}
              />
            </div>
          </section>
        </div>

        <DialogFooter className='bg-muted/30 flex-row flex-wrap items-center gap-3 border-t px-5 py-3 sm:justify-between'>
          <div className='text-muted-foreground min-w-0 text-xs'>
            <span className='text-foreground font-semibold tabular-nums'>{filled.length}</span>{' '}
            {t(filled.length === 1 ? 'product' : 'products')}
            {totalQty > 0 && totalUnits.size === 1 && (
              <>
                {' · '}
                <span className='text-foreground font-semibold tabular-nums'>{fmtQty(totalQty)}</span>{' '}
                {[...totalUnits][0]}
              </>
            )}
            {days > 0 && (
              <>
                {' · '}
                {fmtDay(startDay)} – {fmtDay(endDay)}
              </>
            )}
            <span className='ml-3 max-lg:hidden'>
              <Kbd>Enter</Kbd> {t('next')} · <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> {t('save')}
            </span>
          </div>
          <div className='flex gap-2 max-sm:w-full max-sm:[&>*]:flex-1'>
            <Button variant='outline' onClick={onClose} disabled={saving}>
              {t('Cancel')}
            </Button>
            <Button
              data-field='target:save'
              title='Ctrl+Enter'
              // Enter that arrived here from the list and is still held down is not a click.
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.repeat) e.preventDefault()
              }}
              onClick={() => void save()}
              disabled={saving}
            >
              {saving && <Loader2 className='h-4 w-4 animate-spin' />}
              {target ? t('Save changes') : t('Create target')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** A read-only figure in a row: the column header says what it is on wide screens. */
function Figure({
  label,
  value,
  className,
}: {
  label: string
  value: string | null
  className?: string
}) {
  return (
    <div className={cn('text-muted-foreground min-w-0 text-xs lg:text-right', className)}>
      <span className='lg:hidden'>{label}: </span>
      <span className={cn('tabular-nums', value && 'text-foreground font-medium')}>{value ?? '—'}</span>
    </div>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className='bg-muted rounded border px-1 py-px font-mono text-[10px]'>{children}</kbd>
}
