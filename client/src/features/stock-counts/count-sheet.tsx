import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  CloudOff,
  EyeOff,
  Loader2,
  PlusCircle,
  Printer,
  Save,
  RotateCcw,
  ScanBarcode,
  Send,
  TriangleAlert,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import {
  useCancelStockCountMutation,
  useGetStockCountQuery,
  useRequestRecountMutation,
  useSubmitStockCountMutation,
  type StockCountLine,
  type StockCountTotals,
  type VarianceReason,
} from '@/stores/stockCount.api'
import { CountLineRow } from './components/count-line-row'
import { CountStatusBadge } from './components/count-badges'
import { AddItemDialog } from './components/add-item-dialog'
import { PostCountDialog } from './components/post-count-dialog'
import { SerialScanDialog } from './components/serial-scan-dialog'
import { apiError, COUNT_TYPE_META, fmtQty, REASON_LABELS, REASON_ORDER } from './lib/labels'
import { printCountSheet } from './lib/print-count-sheet'
import { useLineSaver } from './lib/use-line-saver'
import { useCountQueue } from './lib/use-count-queue'
import { useStockCountAccess } from './lib/use-stock-count-access'
import { matchesBilingualSearch } from '@/utils/urdu-text-utils'

type Filter = 'all' | 'todo' | 'counted' | 'diff' | 'recount'
const PAGE = 150
const SCAN_ADDS_ONE_KEY = 'stockCount.scanAddsOne'

const isCounted = (line: StockCountLine) => line.countedQty !== null && line.countedQty !== undefined
const keyOf = (line: StockCountLine) => (line.variantId ? `v:${line.variantId}` : `p:${line.productId}`)

const totalsOf = (lines: StockCountLine[]): StockCountTotals => {
  const totals: StockCountTotals = { itemCount: lines.length, countedCount: 0, matchedCount: 0, varianceCount: 0, gainQty: 0, lossQty: 0, gainValue: 0, lossValue: 0 }
  let costKnown = true
  lines.forEach((line) => {
    if (!isCounted(line)) return
    totals.countedCount += 1
    const v = line.variance ?? 0
    if (line.unitCost === undefined) costKnown = false
    const cost = line.unitCost ?? 0
    if (v === 0) totals.matchedCount += 1
    else {
      totals.varianceCount += 1
      if (v > 0) {
        totals.gainQty += v
        totals.gainValue! += v * cost
      } else {
        totals.lossQty -= v
        totals.lossValue! -= v * cost
      }
    }
  })
  if (!costKnown) {
    delete totals.gainValue
    delete totals.lossValue
  }
  return totals
}

/**
 * Counting screen. Built for the shop floor: scan a barcode (or type a name) to jump to an
 * item, type the number and press Enter for the next one — or switch on "Scan adds 1" and
 * scan every unit. Works the same on a phone.
 */
export default function CountSheetPage({ countId }: { countId: string }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { canCount, canApprove, canViewCost } = useStockCountAccess()

  const { data, isLoading, isError, error, refetch, isFetching } = useGetStockCountQuery(countId, {
    // Several people can count one sheet: pick up their entries now and then.
    pollingInterval: 30000,
    skipPollingIfUnfocused: true,
  })
  // Serial (IMEI) lines save directly — the scan dialog needs the server's verdict on each unit.
  const save = useLineSaver(countId)
  const queue = useCountQueue(countId, { onRejected: (message) => toast.error(message) })
  const [submit, { isLoading: submitting }] = useSubmitStockCountMutation()
  const [recount, { isLoading: recounting }] = useRequestRecountMutation()
  const [cancel, { isLoading: cancelling }] = useCancelStockCountMutation()

  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [scanInput, setScanInput] = useState('')
  const [scanAddsOne, setScanAddsOne] = useState(() => {
    try {
      return localStorage.getItem(SCAN_ADDS_ONE_KEY) === '1'
    } catch {
      return false
    }
  })
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [serialLine, setSerialLine] = useState<StockCountLine | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [addSearch, setAddSearch] = useState('')
  const [postOpen, setPostOpen] = useState(false)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [flashId, setFlashId] = useState<string | null>(null)

  const inputs = useRef(new Map<string, HTMLInputElement>())
  const scanRef = useRef<HTMLInputElement>(null)

  const count = data?.count
  // Server lines with not-yet-saved entries laid on top, so the screen never waits for the network.
  const { overlay } = queue
  const lines = useMemo(() => overlay(data?.lines ?? []), [data?.lines, overlay])
  const expectedHidden = data?.expectedHidden ?? true
  const status = count?.status
  const editable = canCount && (status === 'counting' || (status === 'review' && canApprove))
  const reviewing = status === 'review' && canApprove

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return lines.filter((line) => {
      if (filter === 'todo' && isCounted(line) && !line.recount) return false
      if (filter === 'counted' && !isCounted(line)) return false
      if (filter === 'diff' && !(isCounted(line) && line.variance)) return false
      if (filter === 'recount' && !line.recount) return false
      if (!q) return true
      return matchesBilingualSearch(q, line.name, line.variantLabel, line.barcode, line.sku, line.category)
    })
  }, [lines, filter, search])
  const shown = visible.slice(0, limit)
  const totals = useMemo(() => totalsOf(lines), [lines])
  const existingKeys = useMemo(() => new Set(lines.map(keyOf)), [lines])
  const recountCount = lines.filter((l) => l.recount).length
  const unexplained = lines.filter((l) => isCounted(l) && l.variance && !l.reason).length
  // Lines a reason can apply to: counted and off by something.
  const selectable = useMemo(() => visible.filter((l) => isCounted(l) && l.variance), [visible])
  const allSelected = selectable.length > 0 && selectable.every((l) => selected.has(l.id))
  const applyReasonToSelected = (value: string) => {
    const reason = value === 'none' ? null : (value as VarianceReason)
    const targets = lines.filter((l) => selected.has(l.id) && isCounted(l) && l.variance)
    targets.forEach((l) => queue.enqueue(l.id, { reason }))
    toast.success(t('Reason set on {{n}} item(s) — save to keep it').replace('{{n}}', String(targets.length)), { id: 'bulk-reason' })
  }

  const registerInput = useCallback((lineId: string, el: HTMLInputElement | null) => {
    if (el) inputs.current.set(lineId, el)
    else inputs.current.delete(lineId)
  }, [])

  // Read through a ref so the callback stays stable and an entry doesn't re-render every row.
  const shownIdsRef = useRef<string[]>([])
  shownIdsRef.current = shown.map((l) => l.id)
  const onEnterNext = useCallback(
    (lineId: string) => {
      const shownIds = shownIdsRef.current
      const index = shownIds.indexOf(lineId)
      for (let i = index + 1; i < shownIds.length; i += 1) {
        const el = inputs.current.get(shownIds[i])
        if (el && !el.disabled) {
          el.focus()
          el.scrollIntoView({ block: 'center', behavior: 'smooth' })
          return
        }
      }
      scanRef.current?.focus()
    },
    []
  )
  const onToggleSelect = useCallback((lineId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(lineId)) next.delete(lineId)
      else next.add(lineId)
      return next
    })
  }, [])

  const flash = (lineId: string) => {
    setFlashId(lineId)
    window.setTimeout(() => setFlashId((id) => (id === lineId ? null : id)), 900)
  }

  /** Enter in the scan box: a barcode jumps to (or counts) its item; anything else filters the list. */
  const handleScan = async () => {
    const term = scanInput.trim()
    if (!term) return
    const lower = term.toLowerCase()
    const byCode = lines.filter((l) => (l.barcode && l.barcode.toLowerCase() === lower) || (l.sku && l.sku.toLowerCase() === lower))
    setScanInput('')
    if (byCode.length === 1) {
      const line = byCode[0]
      if (line.kind === 'serialized') {
        setSerialLine(line)
        return
      }
      if (scanAddsOne && editable) {
        // Read the queue, not the last render: a scanner can fire the next Enter before React re-renders.
        const change = queue.changeFor(line.id)
        const base = change && 'qty' in change ? (change.qty ?? 0) : (data?.lines.find((l) => l.id === line.id)?.countedQty ?? 0)
        const qty = Math.round((base + 1) * 1000) / 1000
        queue.enqueue(line.id, { qty })
        flash(line.id)
        toast.success(`${line.name}${line.variantLabel ? ` — ${line.variantLabel}` : ''}: ${fmtQty(qty)}`, { id: 'scan', duration: 1200 })
        scanRef.current?.focus()
        return
      }
      setSearch('')
      setFilter('all')
      const index = visible.findIndex((l) => l.id === line.id)
      if (index >= limit) setLimit(index + PAGE)
      window.setTimeout(() => {
        const el = inputs.current.get(line.id)
        el?.focus()
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        flash(line.id)
      }, 50)
      return
    }
    // An IMEI / serial of a serialized item on the sheet.
    const serialHit = lines.find((l) => l.kind === 'serialized' && (l.expectedImeis?.includes(term) || l.scannedImeis?.includes(term)))
    if (serialHit) {
      setSerialLine(serialHit)
      return
    }
    const nameHits = lines.filter((l) => matchesBilingualSearch(lower, l.name, l.variantLabel, l.barcode))
    if (nameHits.length > 0) {
      setSearch(term)
      return
    }
    if (status === 'counting' && canCount) {
      setAddSearch(term)
      setAddOpen(true)
    } else {
      toast.info(t('Not on this count'))
    }
  }

  /** Workflow steps act on the server's copy — make sure every entry has reached it first. */
  const ensureSaved = async () => {
    if (await queue.flushAll()) return true
    toast.error(t('Some counts are not saved yet — check the connection and try again'))
    return false
  }

  const saveAll = async () => {
    if (queue.unsaved === 0) return
    const n = queue.unsaved
    if (await queue.flushAll()) toast.success(t('{{n}} count(s) saved').replace('{{n}}', String(n)), { id: 'save-all' })
    else toast.error(t('Could not save — check the connection and try again'), { id: 'save-all' })
  }

  // Ctrl/Cmd+S saves the whole sheet (instead of the browser's "save page").
  const saveAllRef = useRef(saveAll)
  saveAllRef.current = saveAll
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveAllRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const doSubmit = async () => {
    if (!(await ensureSaved())) return
    try {
      await submit(countId).unwrap()
      toast.success(canApprove ? t('Submitted — review the differences, then post') : t('Submitted for review'))
      setConfirmSubmit(false)
      setFilter('diff')
    } catch (err) {
      toast.error(apiError(err, t('Could not submit')))
    }
  }

  const sendToRecount = async (lineIds?: string[]) => {
    if (!(await ensureSaved())) return
    try {
      await recount({ id: countId, lineIds }).unwrap()
      setSelected(new Set())
      toast.success(lineIds?.length ? t('{{n}} item(s) sent back for recount').replace('{{n}}', String(lineIds.length)) : t('Back to counting'))
      setFilter(lineIds?.length ? 'recount' : 'all')
    } catch (err) {
      toast.error(apiError(err, t('Could not send for recount')))
    }
  }

  const doCancel = async () => {
    if (!(await ensureSaved())) return
    try {
      await cancel({ id: countId }).unwrap()
      toast.success(t('Count cancelled — nothing was changed'))
      setConfirmCancel(false)
    } catch (err) {
      toast.error(apiError(err, t('Could not cancel')))
    }
  }

  if (isLoading) {
    return (
      <div className='space-y-3 p-4 md:p-6 max-sm:p-0'>
        <Skeleton className='h-24 w-full' />
        <Skeleton className='h-96 w-full' />
      </div>
    )
  }
  if (isError || !count) {
    return (
      <div className='p-4 md:p-6 max-sm:p-0'>
        <Card>
          <CardContent className='py-10 text-center text-sm text-muted-foreground'>
            {apiError(error, t('This count could not be loaded'))}
            <div className='mt-3 flex justify-center gap-2'>
              <Button variant='outline' asChild>
                <Link to='/stock-counts'>{t('All counts')}</Link>
              </Button>
              <Button onClick={() => refetch()}>{t('Try again')}</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const meta = COUNT_TYPE_META[count.type]
  const progressPct = totals.itemCount ? Math.round((totals.countedCount / totals.itemCount) * 100) : 0
  const showValue = totals.gainValue !== undefined
  const filters: { id: Filter; label: string; n: number; hidden?: boolean }[] = [
    { id: 'all', label: t('All'), n: lines.length },
    { id: 'todo', label: t('To count'), n: lines.filter((l) => !isCounted(l) || l.recount).length },
    { id: 'counted', label: t('Counted'), n: totals.countedCount },
    { id: 'diff', label: t('Differences'), n: totals.varianceCount, hidden: expectedHidden },
    { id: 'recount', label: t('Recount'), n: recountCount, hidden: recountCount === 0 },
  ]

  return (
    <div className='space-y-4 p-4 md:p-6 max-sm:space-y-3 max-sm:p-0'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0'>
          <Link to='/stock-counts' className='mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground'>
            <ArrowLeft className='size-3.5' />
            {t('Stock Counts')}
          </Link>
          <div className='flex flex-wrap items-center gap-2'>
            <ClipboardCheck className='size-5 text-primary' />
            <h1 className='text-xl font-bold tracking-tight'>{count.number}</h1>
            <CountStatusBadge status={count.status} />
            <Badge variant='outline'>{t(meta.label)}</Badge>
            {count.blind && (
              <Badge variant='outline' className='gap-1'>
                <EyeOff className='size-3' />
                {t('Blind')}
              </Badge>
            )}
            {isFetching && <Loader2 className='size-3.5 animate-spin text-muted-foreground' />}
          </div>
          <p className='mt-0.5 truncate text-sm text-muted-foreground'>{count.title}</p>
          {count.notes && <p className='mt-0.5 text-xs text-muted-foreground'>{count.notes}</p>}
        </div>

        <div className='flex flex-wrap gap-2 max-sm:w-full max-sm:[&>*]:flex-1'>
          <Button variant='outline' onClick={() => printCountSheet(count, lines, !expectedHidden) || toast.error(t('Allow pop-ups to print'))}>
            <Printer className='mr-1 size-4' />
            {t('Print sheet')}
          </Button>
          {editable && (
            <Button variant={queue.unsaved > 0 ? 'default' : 'outline'} onClick={saveAll} disabled={queue.unsaved === 0 || queue.status === 'saving'}>
              {queue.status === 'saving' ? <Loader2 className='mr-1 size-4 animate-spin' /> : <Save className='mr-1 size-4' />}
              {queue.unsaved > 0 ? t('Save count ({{n}})').replace('{{n}}', String(queue.unsaved)) : t('Saved')}
            </Button>
          )}
          {status === 'counting' && canCount && (
            <Button variant={queue.unsaved > 0 ? 'outline' : 'default'} onClick={() => (totals.countedCount < totals.itemCount ? setConfirmSubmit(true) : void doSubmit())} disabled={submitting || totals.countedCount === 0}>
              {submitting ? <Loader2 className='mr-1 size-4 animate-spin' /> : <Send className='mr-1 size-4' />}
              {t('Submit for review')}
            </Button>
          )}
          {reviewing && (
            <>
              <Button variant='outline' onClick={() => sendToRecount(selected.size ? [...selected] : undefined)} disabled={recounting}>
                <RotateCcw className='mr-1 size-4' />
                {selected.size ? t('Recount {{n}} selected').replace('{{n}}', String(selected.size)) : t('Back to counting')}
              </Button>
              <Button onClick={async () => (await ensureSaved()) && setPostOpen(true)}>
                <CheckCircle2 className='mr-1 size-4' />
                {t('Post adjustments')}
              </Button>
            </>
          )}
          {status === 'posting' && canApprove && (
            <Button onClick={() => setPostOpen(true)}>
              <RotateCcw className='mr-1 size-4' />
              {t('Finish posting')}
            </Button>
          )}
          {canApprove && (status === 'counting' || status === 'review') && (
            <Button variant='ghost' className='text-destructive hover:text-destructive' onClick={() => setConfirmCancel(true)} disabled={cancelling}>
              <XCircle className='mr-1 size-4' />
              {t('Cancel count')}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className='space-y-3 pt-4 max-sm:px-3'>
          <div className='flex flex-wrap items-center justify-between gap-2 text-sm'>
            <span>
              <b className='tabular-nums'>{totals.countedCount}</b> / {totals.itemCount} {t('counted')}
              {recountCount > 0 && <span className='ml-2 text-amber-700 dark:text-amber-300'>· {t('{{n}} to recount').replace('{{n}}', String(recountCount))}</span>}
            </span>
            <SaveStatus status={queue.status} unsaved={queue.unsaved} savedOnce={queue.savedOnce} onSave={saveAll} />
            {!expectedHidden && totals.countedCount > 0 && (
              <span className='flex flex-wrap gap-x-3 text-xs text-muted-foreground'>
                <span>
                  {t('Exactly right')}: <b className='text-foreground'>{totals.matchedCount}</b>
                </span>
                <span className='text-emerald-700 dark:text-emerald-400'>
                  +{fmtQty(totals.gainQty)}
                  {showValue && ` (${formatMoney(totals.gainValue!)})`}
                </span>
                <span className='text-rose-700 dark:text-rose-400'>
                  −{fmtQty(totals.lossQty)}
                  {showValue && ` (${formatMoney(totals.lossValue!)})`}
                </span>
              </span>
            )}
          </div>
          <Progress value={progressPct} className='h-2' />
          {expectedHidden && status === 'counting' && (
            <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
              <EyeOff className='size-3.5' />
              {t('Blind count: count what is really on the shelf — expected quantities show after submitting.')}
            </p>
          )}
          {status === 'posted' && (
            <p className='flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400'>
              <CheckCircle2 className='size-3.5' />
              {t('Posted {{date}} — differences were applied as Stock Count adjustments.').replace(
                '{{date}}',
                count.postedAt ? new Date(count.postedAt).toLocaleString() : ''
              )}{' '}
              <Link to='/stock-adjustments' className='underline'>
                {t('View adjustments')}
              </Link>
            </p>
          )}
          {status === 'cancelled' && <p className='text-xs text-muted-foreground'>{t('Cancelled — no stock was changed.')}</p>}
          {count.postWarnings && count.postWarnings.length > 0 && (
            <div className='rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-200'>
              <div className='mb-1 flex items-center gap-1 font-medium'>
                <TriangleAlert className='size-3.5' />
                {t('Needs attention')}
              </div>
              <ul className='list-disc space-y-0.5 pl-4'>
                {count.postWarnings.slice(0, 20).map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className='space-y-3 pt-4 max-sm:px-2'>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='relative min-w-0 flex-1 basis-64'>
              <ScanBarcode className='absolute top-3 left-2.5 size-4 text-muted-foreground' />
              <Input
                ref={scanRef}
                value={scanInput}
                onChange={(e) => setScanInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    void handleScan()
                  }
                }}
                placeholder={t('Scan a barcode or type a name, then Enter')}
                className='h-10 pl-8'
              />
            </div>
            {editable && (
              <label className='flex items-center gap-2 text-sm whitespace-nowrap' title={t('Each scan counts one unit')}>
                <Switch
                  checked={scanAddsOne}
                  onCheckedChange={(v) => {
                    setScanAddsOne(v)
                    try {
                      localStorage.setItem(SCAN_ADDS_ONE_KEY, v ? '1' : '0')
                    } catch {
                      // per-device preference only
                    }
                  }}
                />
                {t('Scan adds 1')}
              </label>
            )}
            {status === 'counting' && canCount && (
              <Button
                variant='outline'
                size='sm'
                className='h-10'
                onClick={() => {
                  setAddSearch('')
                  setAddOpen(true)
                }}
              >
                <PlusCircle className='mr-1 size-4' />
                {t('Add item')}
              </Button>
            )}
          </div>

          <div className='flex flex-wrap items-center gap-1.5'>
            {filters
              .filter((f) => !f.hidden)
              .map((f) => (
                <button
                  key={f.id}
                  type='button'
                  onClick={() => {
                    setFilter(f.id)
                    setLimit(PAGE)
                  }}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs transition-colors',
                    filter === f.id ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent'
                  )}
                >
                  {f.label} <span className='tabular-nums opacity-70'>{f.n}</span>
                </button>
              ))}
            {search && (
              <button type='button' onClick={() => setSearch('')} className='rounded-full border border-dashed px-3 py-1 text-xs hover:bg-accent'>
                “{search}” ✕
              </button>
            )}
          </div>

          {reviewing && visible.length > 0 && (
            <div className='flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md border bg-muted/30 px-3 py-2'>
              <label className='flex cursor-pointer items-center gap-2 text-sm'>
                <Checkbox
                  checked={allSelected ? true : selected.size > 0 ? 'indeterminate' : false}
                  onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(selectable.map((l) => l.id)))}
                  disabled={selectable.length === 0}
                />
                {selected.size > 0
                  ? t('{{n}} selected').replace('{{n}}', String(selected.size))
                  : t('Select all differences ({{n}})').replace('{{n}}', String(selectable.length))}
              </label>
              {selected.size > 0 && (
                <>
                  <div className='flex items-center gap-2'>
                    <span className='text-xs text-muted-foreground'>{t('Set reason for all selected')}</span>
                    <Select value='' onValueChange={applyReasonToSelected}>
                      <SelectTrigger className='h-8 w-52'>
                        <SelectValue placeholder={t('Choose a reason…')} />
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
                  </div>
                  <button type='button' className='ml-auto text-xs text-primary hover:underline' onClick={() => setSelected(new Set())}>
                    {t('Clear selection')}
                  </button>
                </>
              )}
              {selected.size === 0 && unexplained > 0 && (
                <span className='ml-auto text-xs text-muted-foreground'>{t('{{n}} without a reason').replace('{{n}}', String(unexplained))}</span>
              )}
            </div>
          )}

          <div className='rounded-md border'>
            {shown.map((line) => (
              <CountLineRow
                key={line.id}
                line={line}
                editable={editable}
                expectedHidden={expectedHidden}
                reviewing={reviewing}
                costEditable={count.type === 'initial' && canViewCost && editable}
                selected={selected.has(line.id)}
                onToggleSelect={onToggleSelect}
                onChange={queue.enqueue}
                onScanUnits={setSerialLine}
                registerInput={registerInput}
                onEnterNext={onEnterNext}
                formatMoney={formatMoney}
                flash={flashId === line.id}
              />
            ))}
            {shown.length === 0 && (
              <p className='py-10 text-center text-sm text-muted-foreground'>
                {filter === 'todo' ? t('Everything is counted') : filter === 'diff' ? t('No differences') : t('Nothing here')}
              </p>
            )}
          </div>
          {visible.length > shown.length && (
            <Button variant='outline' className='w-full' onClick={() => setLimit((n) => n + PAGE)}>
              {t('Show more ({{n}} left)').replace('{{n}}', String(visible.length - shown.length))}
            </Button>
          )}
        </CardContent>
      </Card>

      <SerialScanDialog
        line={serialLine ? (lines.find((l) => l.id === serialLine.id) ?? serialLine) : null}
        editable={editable}
        expectedHidden={expectedHidden}
        onClose={() => setSerialLine(null)}
        onSave={(entry) => save([entry])}
      />
      <AddItemDialog countId={countId} open={addOpen} initialSearch={addSearch} existingKeys={existingKeys} onOpenChange={setAddOpen} />
      {(reviewing || (status === 'posting' && canApprove)) && (
        <PostCountDialog count={count} totals={totals} unexplained={unexplained} open={postOpen} onOpenChange={setPostOpen} formatMoney={formatMoney} />
      )}
      <ConfirmDialog
        open={confirmSubmit}
        onOpenChange={setConfirmSubmit}
        title={t('Submit with items not counted?')}
        desc={t('{{n}} item(s) have no count yet. They will be left unchanged when the count is posted.').replace(
          '{{n}}',
          String(totals.itemCount - totals.countedCount)
        )}
        confirmText={t('Submit anyway')}
        cancelBtnText={t('Keep counting')}
        handleConfirm={doSubmit}
        isLoading={submitting}
      />
      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title={t('Cancel this count?')}
        desc={t('The counts entered are kept for the record, but no stock is changed and the items become due again.')}
        confirmText={t('Cancel count')}
        cancelBtnText={t('Keep it')}
        destructive
        handleConfirm={doCancel}
        isLoading={cancelling}
      />
    </div>
  )
}

function SaveStatus({
  status,
  unsaved,
  savedOnce,
  onSave,
}: {
  status: string
  unsaved: number
  savedOnce: boolean
  onSave: () => void
}) {
  const { t } = useLanguage()
  if (status === 'saving') {
    return (
      <span className='flex items-center gap-1.5 text-xs text-muted-foreground'>
        <Loader2 className='size-3.5 animate-spin' />
        {t('Saving…')}
      </span>
    )
  }
  if (unsaved > 0) {
    return (
      <span className='flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300'>
        {status === 'error' ? <CloudOff className='size-3.5' /> : <span className='size-2 rounded-full bg-amber-500' />}
        {status === 'error'
          ? t('Could not save {{n}} — check the connection').replace('{{n}}', String(unsaved))
          : t('{{n}} unsaved').replace('{{n}}', String(unsaved))}
        <button type='button' className='font-medium underline' onClick={onSave}>
          {t('Save now')}
        </button>
      </span>
    )
  }
  if (!savedOnce) return null
  return (
    <span className='flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400'>
      <CheckCircle2 className='size-3.5' />
      {t('All changes saved')}
    </span>
  )
}
