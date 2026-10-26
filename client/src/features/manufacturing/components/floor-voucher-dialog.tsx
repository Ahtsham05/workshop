import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  ClipboardCheck,
  Loader2,
  PackagePlus,
  Plus,
  Sparkles,
  Undo2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useGetFloorOverviewQuery,
  useGetFloorPickListQuery,
  usePostFloorVoucherMutation,
  type FloorPickItem,
  type FloorVoucherKind,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { getUnitLabel } from '@/lib/units'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { fmtQty } from '../lib/constants'
import { EmptyState } from './page'

/*
 * One dialog for the three production-stock vouchers:
 *   issue   store → production stock (in bulk, for no order in particular)
 *   return  production stock → store
 *   count   a count sheet of every material on the floor; only the lines counted are
 *           posted, each as its difference to the book (− wastage, + found)
 */

const todayKey = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi' }).format(
    new Date()
  )

const META: Record<
  FloorVoucherKind,
  {
    title: string
    description: string
    icon: React.ElementType
    action: string
  }
> = {
  issue: {
    title: 'Issue to production stock',
    description:
      'Hand material to the production floor in bulk — finished goods use it from there automatically.',
    icon: PackagePlus,
    action: 'Post issue',
  },
  return: {
    title: 'Return to store',
    description:
      'Unused material sent back from the production floor to the store.',
    icon: Undo2,
    action: 'Post return',
  },
  count: {
    title: 'Count production stock',
    description:
      'Count what is physically on the floor. Only the lines you count are posted — the difference to the book is wastage (−) or found (+).',
    icon: ClipboardCheck,
    action: 'Post count',
  },
}

const COUNT_REASONS = [
  'Wastage',
  'Damaged',
  'Spillage',
  'Found extra',
  'Recount',
]

interface Row {
  key: number
  productId: string
  value: string
}

let nextKey = 1
const blankRow = (productId = '', value = ''): Row => ({
  key: nextKey++,
  productId,
  value,
})

const num = (v: string) => (v.trim() === '' ? NaN : Number(v))

export function FloorVoucherDialog({
  mode,
  productId,
  prefill,
  onClose,
}: {
  mode: FloorVoucherKind
  /** Open on one material (from its detail sheet). */
  productId?: string
  /** Lines to start with (e.g. what open orders still need). */
  prefill?: { productId: string; quantity: number }[]
  onClose: () => void
}) {
  const { t } = useLanguage()
  const meta = META[mode]
  const Icon = meta.icon
  const { data: items, isLoading } = useGetFloorPickListQuery()
  const { data: overview } = useGetFloorOverviewQuery(
    {},
    { skip: mode !== 'issue' }
  )
  const [post, { isLoading: posting }] = usePostFloorVoucherMutation()
  const [date, setDate] = useState(todayKey())
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [rows, setRows] = useState<Row[]>(() =>
    prefill?.length
      ? prefill.map((p) => blankRow(p.productId, String(p.quantity)))
      : [blankRow(productId || '')]
  )
  // The count sheet lists every material; `counted` holds what was typed.
  const [counted, setCounted] = useState<Record<string, string>>({})

  const byId = useMemo(
    () => new Map((items || []).map((i) => [i.id, i])),
    [items]
  )
  const choices = useMemo(
    () =>
      (items || []).filter((i) =>
        mode === 'issue' ? i.isFloor : i.inProduction > 0 || i.isFloor
      ),
    [items, mode]
  )
  const countItems = useMemo(
    () =>
      mode === 'count'
        ? choices.filter((i) => !productId || i.id === productId)
        : [],
    [choices, mode, productId]
  )

  // What open orders still need beyond what is on the floor — one click to issue it.
  const shortLines = useMemo(
    () =>
      (overview?.rows || [])
        .filter((r) => r.isFloor && r.openOrderNeed > r.inProduction + 1e-6)
        .map((r) => ({
          productId: r.productId,
          quantity: Math.ceil(r.openOrderNeed - r.inProduction),
        })),
    [overview]
  )

  const lines =
    mode === 'count'
      ? countItems
          .filter((i) => !Number.isNaN(num(counted[i.id] ?? '')))
          .map((i) => ({
            item: i,
            value: num(counted[i.id]),
          }))
      : rows
          .filter((r) => r.productId)
          .map((r) => ({ item: byId.get(r.productId), value: num(r.value) }))
          .filter((l): l is { item: FloorPickItem; value: number } => !!l.item)

  const rowProblem = (item: FloorPickItem, value: number) => {
    if (Number.isNaN(value)) return t('Enter a quantity')
    if (value < 0) return t('Cannot be negative')
    if (mode === 'issue' && value > item.storeQuantity + 1e-9)
      return `${t('Store has only')} ${fmtQty(item.storeQuantity)}`
    if (mode === 'return' && value > item.inProduction + 1e-9)
      return `${t('Production stock has only')} ${fmtQty(item.inProduction)}`
    return null
  }

  const posted = lines.filter((l) => mode === 'count' || l.value > 0)
  const ids = rows.filter((r) => r.productId).map((r) => r.productId)
  const problems = [
    posted.length === 0 &&
      (mode === 'count'
        ? t('Enter the counted quantity of at least one material')
        : t('Add at least one material with a quantity')),
    new Set(ids).size !== ids.length && t('A material is on two lines'),
    ...posted
      .map((l) => {
        const p = rowProblem(l.item, l.value)
        return p ? `${l.item.name}: ${p}` : null
      })
      .filter(Boolean),
  ].filter(Boolean) as string[]

  const submit = async () => {
    if (problems.length || posting) return
    try {
      const v = await post({
        kind: mode,
        voucherDate: date,
        notes,
        ...(mode === 'count' ? { reason } : {}),
        lines: posted.map((l) =>
          mode === 'count'
            ? { productId: l.item.id, countedQuantity: l.value }
            : { productId: l.item.id, quantity: l.value }
        ),
      }).unwrap()
      const losses = v.lines.filter((l) => l.quantity < 0).length
      toast.success(
        mode === 'count'
          ? `${v.voucherNumber} · ${v.lines.length} ${t('counted')}${losses ? ` · ${losses} ${t('with wastage')}` : ''}`
          : `${v.voucherNumber} · ${v.lines.length} ${t(mode === 'issue' ? 'material(s) issued to production stock' : 'material(s) returned to store')}`
      )
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not post')))
    }
  }

  const setRow = (key: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)))

  /* Keyboard flow, like an invoice: the material list opens by itself; Enter picks a
     material and jumps to its quantity; Enter on the quantity goes to the next row (a new
     one with its list open); Ctrl+Enter posts. */
  const [openKey, setOpenKey] = useState<number | null>(null)
  const qtyRefs = useRef(new Map<number, HTMLInputElement>())
  const focusQty = (key: number) =>
    requestAnimationFrame(() => {
      const el = qtyRefs.current.get(key)
      el?.focus()
      el?.select()
    })
  const addRowAndOpen = () => {
    const row = blankRow()
    setRows((rs) => [...rs, row])
    setOpenKey(row.key)
  }
  const advanceFrom = (index: number) => {
    const next = rows[index + 1]
    if (!next) addRowAndOpen()
    else if (!next.productId) setOpenKey(next.key)
    else focusQty(next.key)
  }
  const autoStarted = useRef(false)
  useEffect(() => {
    if (autoStarted.current || isLoading || mode === 'count' || !choices.length)
      return
    autoStarted.current = true
    const empty = rows.find((r) => !r.productId)
    if (empty) setOpenKey(empty.key)
    else focusQty(rows[0].key)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, choices.length, mode])
  // Issuing: a picked material starts with what open orders still need of it.
  const suggestedQty = (productId: string) => {
    if (mode !== 'issue') return ''
    const s = shortLines.find((l) => l.productId === productId)
    return s ? String(s.quantity) : ''
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className='flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-3xl'
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader className='border-b px-5 py-4 text-left'>
          <div className='flex items-center gap-3 pr-6'>
            <span className='bg-primary/10 text-primary flex h-10 w-10 shrink-0 items-center justify-center rounded-lg'>
              <Icon className='h-5 w-5' />
            </span>
            <div className='min-w-0'>
              <DialogTitle>{t(meta.title)}</DialogTitle>
              <DialogDescription>{t(meta.description)}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className='flex-1 space-y-4 overflow-y-auto px-5 py-4'>
          {isLoading ? (
            <Skeleton className='h-48 w-full' />
          ) : choices.length === 0 ? (
            <EmptyState
              icon={Icon}
              title={
                mode === 'issue'
                  ? t('No production-stock materials yet')
                  : t('Nothing in production stock')
              }
              description={
                mode === 'issue'
                  ? t(
                      'Choose the materials kept in production stock first (Materials button on this page).'
                    )
                  : t('Issue material to production stock first.')
              }
            />
          ) : (
            <>
              <div className='grid grid-cols-1 gap-3 sm:grid-cols-[10rem_1fr]'>
                <div className='space-y-1'>
                  <Label className='text-muted-foreground text-xs'>
                    {t('Date')}
                  </Label>
                  <Input
                    type='date'
                    value={date}
                    max={todayKey()}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                    className='h-9'
                  />
                </div>
                {mode === 'count' ? (
                  <div className='min-w-0 space-y-1'>
                    <Label className='text-muted-foreground text-xs'>
                      {t('Reason for differences')}
                    </Label>
                    <div className='flex flex-wrap gap-1.5'>
                      {COUNT_REASONS.map((r) => (
                        <button
                          key={r}
                          type='button'
                          onClick={() => setReason(reason === r ? '' : r)}
                          className={cn(
                            'h-9 rounded-md border px-3 text-sm transition-colors',
                            reason === r
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'hover:bg-muted'
                          )}
                        >
                          {t(r)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  mode === 'issue' &&
                  shortLines.length > 0 && (
                    <div className='flex items-end'>
                      <Button
                        type='button'
                        variant='outline'
                        size='sm'
                        className='h-9'
                        onClick={() =>
                          setRows(
                            shortLines.map((s) =>
                              blankRow(s.productId, String(s.quantity))
                            )
                          )
                        }
                      >
                        <Sparkles className='h-4 w-4' />
                        {t('Fill what open orders need')} ({shortLines.length})
                      </Button>
                    </div>
                  )
                )}
              </div>

              {mode === 'count' ? (
                <CountSheet
                  items={countItems}
                  counted={counted}
                  onChange={(id, value) =>
                    setCounted((c) => ({ ...c, [id]: value }))
                  }
                />
              ) : (
                <div className='divide-y rounded-lg border'>
                  <div className='text-muted-foreground hidden grid-cols-[1fr_7rem_7rem_8rem_2rem] gap-3 px-3 py-2 text-xs font-medium sm:grid'>
                    <span>{t('Material')}</span>
                    <span className='text-right'>{t('In store')}</span>
                    <span className='text-right'>{t('In production')}</span>
                    <span className='text-right'>
                      {mode === 'issue' ? t('Issue qty') : t('Return qty')}
                    </span>
                    <span />
                  </div>
                  {rows.map((r, index) => {
                    const item = byId.get(r.productId)
                    const value = num(r.value)
                    const problem =
                      item && r.value !== '' ? rowProblem(item, value) : null
                    return (
                      <div
                        key={r.key}
                        className='grid grid-cols-2 items-center gap-x-3 gap-y-2 px-3 py-2 sm:grid-cols-[1fr_7rem_7rem_8rem_2rem]'
                      >
                        <div className='col-span-2 min-w-0 sm:col-span-1'>
                          <SearchableSelect
                            id={`floor-material-${r.key}`}
                            open={openKey === r.key}
                            onOpenChange={(o) => setOpenKey(o ? r.key : null)}
                            deselectable={false}
                            returnFocus={false}
                            onSelected={() => focusQty(r.key)}
                            // A material already on another line is not offered again.
                            options={choices
                              .filter(
                                (c) =>
                                  c.id === r.productId ||
                                  !rows.some(
                                    (x) =>
                                      x.key !== r.key && x.productId === c.id
                                  )
                              )
                              .map((c) => ({
                                value: c.id,
                                label: c.name,
                                sublabel: `${fmtQty(mode === 'issue' ? c.storeQuantity : c.inProduction)} ${getUnitLabel(c.unit)} ${mode === 'issue' ? t('in store') : t('on floor')}`,
                              }))}
                            value={r.productId}
                            onValueChange={(v) =>
                              setRow(r.key, {
                                productId: v,
                                value: r.value || suggestedQty(v),
                              })
                            }
                            placeholder={t('Choose material')}
                            searchPlaceholder={t('Search material')}
                            popoverClassName='w-[min(30rem,calc(100vw-2rem))]'
                          />
                        </div>
                        <Figure
                          label={t('In store')}
                          value={item ? item.storeQuantity : null}
                          unit={item?.unit}
                        />
                        <Figure
                          label={t('In production')}
                          value={item ? item.inProduction : null}
                          unit={item?.unit}
                        />
                        <div className='min-w-0'>
                          <Input
                            ref={(el) => {
                              if (el) qtyRefs.current.set(r.key, el)
                              else qtyRefs.current.delete(r.key)
                            }}
                            inputMode='decimal'
                            aria-label={`${mode === 'issue' ? t('Issue qty') : t('Return qty')}, ${t('Row')} ${index + 1}`}
                            showVoiceInput={false}
                            value={r.value}
                            onChange={(e) =>
                              setRow(r.key, {
                                value: e.target.value.replace(/[^\d.]/g, ''),
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter' || e.ctrlKey || e.metaKey)
                                return
                              e.preventDefault()
                              // No material yet: open this row's list; else on to the next row.
                              if (!r.productId) setOpenKey(r.key)
                              else advanceFrom(index)
                            }}
                            className={cn(
                              'h-9 text-right tabular-nums',
                              problem && 'border-rose-500'
                            )}
                            placeholder='0'
                          />
                          {problem && (
                            <p className='mt-0.5 text-right text-[11px] text-rose-600'>
                              {problem}
                            </p>
                          )}
                        </div>
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          className='h-8 w-8 justify-self-end'
                          aria-label={t('Remove line')}
                          disabled={rows.length === 1 && !r.productId}
                          onClick={() =>
                            setRows((rs) =>
                              rs.length === 1
                                ? [blankRow()]
                                : rs.filter((x) => x.key !== r.key)
                            )
                          }
                        >
                          <X className='h-4 w-4' />
                        </Button>
                      </div>
                    )
                  })}
                  <div className='px-3 py-2'>
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      onClick={addRowAndOpen}
                    >
                      <Plus className='h-4 w-4' />
                      {t('Add material')}
                    </Button>
                  </div>
                </div>
              )}

              <div className='space-y-1'>
                <Label
                  htmlFor='floor-notes'
                  className='text-muted-foreground text-xs'
                >
                  {t('Notes')}
                </Label>
                <Textarea
                  id='floor-notes'
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    mode === 'issue'
                      ? t('Line, shift, who received it…')
                      : undefined
                  }
                />
              </div>
            </>
          )}
        </div>

        {lines.length > 0 && problems.length > 0 && (
          <ul className='space-y-1 border-t bg-rose-500/5 px-5 py-2 text-xs text-rose-700 dark:text-rose-400'>
            {problems.slice(0, 4).map((p) => (
              <li key={p} className='flex gap-1.5'>
                <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
                {p}
              </li>
            ))}
          </ul>
        )}
        <DialogFooter className='bg-muted/30 flex-row items-center gap-2 border-t px-5 py-3 sm:justify-between'>
          <div className='text-muted-foreground text-xs tabular-nums'>
            {posted.length > 0 && `${posted.length} ${t('line(s)')}`}
          </div>
          <div className='ml-auto flex gap-2'>
            <Button variant='outline' onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button
              onClick={submit}
              disabled={problems.length > 0 || posting}
              title='Ctrl+Enter'
            >
              {posting ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <Icon className='h-4 w-4' />
              )}
              {t(meta.action)}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Figure({
  label,
  value,
  unit,
}: {
  label: string
  value: number | null
  unit?: string
}) {
  return (
    <div className='text-right text-sm tabular-nums max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:text-xs'>
      <span className='text-muted-foreground sm:hidden'>{label}</span>
      <span>
        {value == null ? '—' : fmtQty(value)}
        {value != null && unit && (
          <span className='text-muted-foreground ml-1 text-xs'>
            {getUnitLabel(unit)}
          </span>
        )}
      </span>
    </div>
  )
}

/** Every material on the floor with its book quantity; type what was counted. */
function CountSheet({
  items,
  counted,
  onChange,
}: {
  items: FloorPickItem[]
  counted: Record<string, string>
  onChange: (id: string, value: string) => void
}) {
  const { t } = useLanguage()
  return (
    <div className='divide-y rounded-lg border'>
      <div className='text-muted-foreground hidden grid-cols-[1fr_7rem_8rem_7rem] gap-3 px-3 py-2 text-xs font-medium sm:grid'>
        <span>{t('Material')}</span>
        <span className='text-right'>{t('Book')}</span>
        <span className='text-right'>{t('Counted')}</span>
        <span className='text-right'>{t('Difference')}</span>
      </div>
      {items.map((item, index) => {
        const raw = counted[item.id] ?? ''
        const value = num(raw)
        const diff = Number.isNaN(value) ? null : value - item.inProduction
        return (
          <div
            key={item.id}
            className='grid grid-cols-3 items-center gap-x-3 gap-y-1.5 px-3 py-2 sm:grid-cols-[1fr_7rem_8rem_7rem]'
          >
            <div className='col-span-3 min-w-0 sm:col-span-1'>
              <div className='truncate text-sm font-medium'>{item.name}</div>
              {item.sku && (
                <div className='text-muted-foreground truncate text-xs'>
                  {item.sku}
                </div>
              )}
            </div>
            <Figure
              label={t('Book')}
              value={item.inProduction}
              unit={item.unit}
            />
            <Input
              inputMode='decimal'
              aria-label={`${t('Counted')}, ${item.name}`}
              showVoiceInput={false}
              value={raw}
              autoFocus={index === 0}
              onChange={(e) =>
                onChange(item.id, e.target.value.replace(/[^\d.]/g, ''))
              }
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.ctrlKey || e.metaKey) return
                e.preventDefault()
                const inputs = Array.from(
                  e.currentTarget
                    .closest('[role="dialog"]')
                    ?.querySelectorAll<HTMLInputElement>(
                      'input[aria-label^="' + t('Counted') + '"]'
                    ) || []
                )
                inputs[inputs.indexOf(e.currentTarget) + 1]?.focus()
              }}
              className='h-9 text-right tabular-nums'
              placeholder={t('Not counted')}
            />
            <div
              className={cn(
                'text-right text-sm font-medium tabular-nums',
                diff != null &&
                  diff < -1e-9 &&
                  'text-rose-600 dark:text-rose-400',
                diff != null &&
                  diff > 1e-9 &&
                  'text-emerald-600 dark:text-emerald-400'
              )}
            >
              {diff == null
                ? '—'
                : Math.abs(diff) < 1e-9
                  ? t('Matches')
                  : `${diff > 0 ? '+' : '−'}${fmtQty(Math.abs(diff))}`}
            </div>
          </div>
        )
      })}
    </div>
  )
}
