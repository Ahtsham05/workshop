import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Save, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLanguage } from '@/context/language-context'
import {
  useGetCyclePlanQuery,
  useGetPlanItemsQuery,
  useSetClassOverrideMutation,
  useUpdateStockCountPolicyMutation,
  type AbcClass,
  type PlanItem,
  type StockCountPolicy,
} from '@/stores/stockCount.api'
import { apiError, fmtQty, INTERVAL_PRESETS } from '../lib/labels'
import { useStockCountAccess } from '../lib/use-stock-count-access'
import { ClassBadge } from './count-badges'

const PAGE_SIZE = 50
type PolicyDraft = Omit<StockCountPolicy, 'id' | 'overrides'>

const BASIS_OPTIONS: { value: StockCountPolicy['basis']; label: string; hint: string }[] = [
  { value: 'consumption', label: 'Cost of goods sold', hint: 'Classic inventory ABC: how much money flows through the item.' },
  { value: 'revenue', label: 'Sales revenue', hint: 'Same ranking as Products → Performance.' },
  { value: 'stockValue', label: 'Stock value on hand', hint: 'What is sitting on the shelf right now.' },
]

export function PlanTab() {
  const { t } = useLanguage()
  const { canApprove } = useStockCountAccess()
  const { data: plan, isLoading } = useGetCyclePlanQuery()

  if (isLoading || !plan) {
    return (
      <div className='space-y-3'>
        <Skeleton className='h-48 w-full' />
        <Skeleton className='h-80 w-full' />
      </div>
    )
  }

  return (
    <div className='space-y-4'>
      <PolicyCard policy={plan.policy} editable={canApprove} />
      <ItemsCard editable={canApprove} />
      <p className='text-xs text-muted-foreground'>
        {t(
          'How the schedule works: a class with K items counted every N days gets ⌈K ÷ N⌉ items a day — never-counted items first (most valuable first), then the ones counted longest ago. An item counted within its interval, or already on an open count, is not due.'
        )}
      </p>
      {plan.excludedItems > 0 && (
        <p className='text-xs text-muted-foreground'>
          {t('{{n}} item(s) are excluded from cycle counts.').replace('{{n}}', String(plan.excludedItems))}
        </p>
      )}
    </div>
  )
}

function PolicyCard({ policy, editable }: { policy: StockCountPolicy; editable: boolean }) {
  const { t } = useLanguage()
  const [draft, setDraft] = useState<PolicyDraft>(policy)
  const [update, { isLoading }] = useUpdateStockCountPolicyMutation()
  // Keyed on the settings only: changing an item's class refetches the policy (new overrides)
  // and must not throw away settings being edited.
  const settingsKey = JSON.stringify({ ...policy, overrides: undefined, id: undefined })
  useEffect(() => setDraft(JSON.parse(settingsKey)), [settingsKey])

  const dirty = settingsKey !== JSON.stringify({ ...JSON.parse(settingsKey), ...draft })
  const set = <K extends keyof PolicyDraft>(key: K, value: PolicyDraft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const setInterval = (cls: AbcClass, days: number) => setDraft((d) => ({ ...d, intervals: { ...d.intervals, [cls]: days } }))

  const save = async () => {
    try {
      await update({
        basis: draft.basis,
        lookbackDays: draft.lookbackDays,
        aShare: draft.aShare,
        bShare: draft.bShare,
        intervals: draft.intervals,
        maxItemsPerDay: draft.maxItemsPerDay,
        includeZeroStock: draft.includeZeroStock,
        blindByDefault: draft.blindByDefault,
        surpriseSampleSize: draft.surpriseSampleSize,
      }).unwrap()
      toast.success(t('Cycle plan saved'))
    } catch (err) {
      toast.error(apiError(err, t('Could not save the cycle plan')))
    }
  }

  const numberInput = (key: 'lookbackDays' | 'aShare' | 'bShare' | 'maxItemsPerDay' | 'surpriseSampleSize', props: { min: number; max: number; suffix?: string }) => (
    <div className='flex items-center gap-1.5'>
      <Input
        type='number'
        inputMode='numeric'
        min={props.min}
        max={props.max}
        value={draft[key]}
        disabled={!editable}
        onChange={(e) => set(key, Number(e.target.value))}
        className='h-9 w-24'
      />
      {props.suffix && <span className='text-sm text-muted-foreground'>{props.suffix}</span>}
    </div>
  )

  return (
    <Card>
      <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3 space-y-0 max-sm:px-3'>
        <div>
          <CardTitle className='text-base'>{t('Counting frequency')}</CardTitle>
          <CardDescription>{t('How items are ranked into A, B and C, and how often each class is counted')}</CardDescription>
        </div>
        {editable && (
          <Button onClick={save} disabled={!dirty || isLoading} className='max-sm:w-full'>
            {isLoading ? <Loader2 className='mr-1 size-4 animate-spin' /> : <Save className='mr-1 size-4' />}
            {t('Save')}
          </Button>
        )}
      </CardHeader>
      <CardContent className='space-y-5 max-sm:px-3'>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
          {(['A', 'B', 'C'] as const).map((cls) => {
            const days = draft.intervals[cls]
            const preset = INTERVAL_PRESETS.some((p) => p.days === days)
            return (
              <div key={cls} className='space-y-1.5 rounded-lg border p-3'>
                <div className='flex items-center gap-2 text-sm font-medium'>
                  <ClassBadge cls={cls} />
                  {cls === 'A' ? t('High value') : cls === 'B' ? t('Mid value') : t('Low value / bulk')}
                </div>
                <Select
                  value={preset ? String(days) : 'custom'}
                  disabled={!editable}
                  onValueChange={(v) => v !== 'custom' && setInterval(cls, Number(v))}
                >
                  <SelectTrigger className='h-9 w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INTERVAL_PRESETS.map((p) => (
                      <SelectItem key={p.days} value={String(p.days)}>
                        {t(p.label)}
                      </SelectItem>
                    ))}
                    <SelectItem value='custom'>{t('Custom…')}</SelectItem>
                  </SelectContent>
                </Select>
                <div className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                  {t('every')}
                  <Input
                    type='number'
                    inputMode='numeric'
                    min={1}
                    max={cls === 'C' ? 730 : 365}
                    value={days}
                    disabled={!editable}
                    onChange={(e) => setInterval(cls, Math.max(1, Number(e.target.value) || 1))}
                    className='h-7 w-16 text-xs'
                  />
                  {t('day(s)')}
                </div>
              </div>
            )
          })}
        </div>

        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label>{t('Rank items by')}</Label>
            <Select value={draft.basis} disabled={!editable} onValueChange={(v) => set('basis', v as StockCountPolicy['basis'])}>
              <SelectTrigger className='h-9 w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BASIS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {t(o.label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className='text-xs text-muted-foreground'>{t(BASIS_OPTIONS.find((o) => o.value === draft.basis)?.hint ?? '')}</p>
          </div>
          <div className='space-y-1.5'>
            <Label>{t('Look back')}</Label>
            {numberInput('lookbackDays', { min: 7, max: 730, suffix: t('days of sales') })}
          </div>
          <div className='space-y-1.5'>
            <Label>{t('Class cut-offs (share of total value)')}</Label>
            <div className='flex flex-wrap items-center gap-2 text-sm'>
              <span>A ≤</span>
              {numberInput('aShare', { min: 1, max: 99, suffix: '%' })}
              <span>B ≤</span>
              {numberInput('bShare', { min: 2, max: 100, suffix: '%' })}
            </div>
            <p className='text-xs text-muted-foreground'>{t('Usual: A = top 80% of value (few items), B = next 15%, C = the rest.')}</p>
          </div>
          <div className='space-y-1.5'>
            <Label>{t('Most items per day')}</Label>
            {numberInput('maxItemsPerDay', { min: 0, max: 10000, suffix: t('(0 = no limit)') })}
          </div>
          <div className='space-y-1.5'>
            <Label>{t('Surprise audit size')}</Label>
            {numberInput('surpriseSampleSize', { min: 1, max: 500, suffix: t('items') })}
          </div>
          <div className='space-y-3'>
            <label className='flex items-center justify-between gap-3 text-sm'>
              {t('Blind counts by default')}
              <Switch checked={draft.blindByDefault} disabled={!editable} onCheckedChange={(v) => set('blindByDefault', v)} />
            </label>
            <label className='flex items-center justify-between gap-3 text-sm'>
              {t('Schedule items with zero stock')}
              <Switch checked={draft.includeZeroStock} disabled={!editable} onCheckedChange={(v) => set('includeZeroStock', v)} />
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

const statusOf = (item: PlanItem, intervals: Record<AbcClass, number>) => {
  if (item.cls === 'exclude') return 'excluded'
  if (item.onOpenCount) return 'open'
  if (item.daysSince === null) return 'never'
  return item.daysSince >= intervals[item.cls] ? 'due' : 'ok'
}

function ItemsCard({ editable }: { editable: boolean }) {
  const { t } = useLanguage()
  const { data: items = [], isLoading } = useGetPlanItemsQuery()
  const { data: plan } = useGetCyclePlanQuery()
  const [setOverride] = useSetClassOverrideMutation()
  const [search, setSearch] = useState('')
  const [cls, setCls] = useState<string>('all')
  const [page, setPage] = useState(1)

  const intervals = useMemo(() => plan?.policy.intervals ?? { A: 1, B: 7, C: 90 }, [plan?.policy.intervals])
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(
      (item) =>
        (cls === 'all' || item.cls === cls || (cls === 'due' && ['due', 'never'].includes(statusOf(item, intervals)))) &&
        (!q || `${item.name} ${item.variantLabel ?? ''} ${item.barcode ?? ''}`.toLowerCase().includes(q))
    )
  }, [items, search, cls, intervals])
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const changeClass = async (productId: string, value: string) => {
    try {
      await setOverride({ productId, cls: value === 'auto' ? null : (value as AbcClass | 'exclude') }).unwrap()
    } catch (err) {
      toast.error(apiError(err, t('Could not change the class')))
    }
  }

  const statusLabel = (item: PlanItem) => {
    const status = statusOf(item, intervals)
    if (status === 'excluded') return <span className='text-muted-foreground'>{t('Not scheduled')}</span>
    if (status === 'open') return <span className='text-sky-600 dark:text-sky-400'>{t('On an open count')}</span>
    if (status === 'never') return <span className='text-amber-600 dark:text-amber-400'>{t('Never counted')}</span>
    if (status === 'due') return <span className='text-rose-600 dark:text-rose-400'>{t('Due')}</span>
    return <span className='text-emerald-600 dark:text-emerald-400'>{t('On schedule')}</span>
  }
  const lastCounted = (item: PlanItem) =>
    item.daysSince === null ? '—' : item.daysSince === 0 ? t('Today') : t('{{n}} day(s) ago').replace('{{n}}', String(item.daysSince))

  return (
    <Card>
      <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-3 space-y-0 max-sm:px-3'>
        <div>
          <CardTitle className='text-base'>{t('Item classes')}</CardTitle>
          <CardDescription>
            {editable
              ? t('Ranked automatically — change a class by hand, e.g. force a small theft-prone item into A')
              : t('Ranked automatically by value')}
          </CardDescription>
        </div>
        <div className='flex flex-wrap gap-2 max-sm:grid max-sm:w-full max-sm:grid-cols-2'>
          <div className='relative max-sm:col-span-2'>
            <Search className='absolute top-2.5 left-2.5 size-4 text-muted-foreground' />
            <Input
              placeholder={t('Search item or barcode…')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className='h-9 w-56 pl-8 max-sm:w-full'
            />
          </div>
          <Select
            value={cls}
            onValueChange={(v) => {
              setCls(v)
              setPage(1)
            }}
          >
            <SelectTrigger className='h-9 w-40 max-sm:col-span-2 max-sm:w-full'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>{t('All classes')}</SelectItem>
              <SelectItem value='A'>{t('Class A')}</SelectItem>
              <SelectItem value='B'>{t('Class B')}</SelectItem>
              <SelectItem value='C'>{t('Class C')}</SelectItem>
              <SelectItem value='exclude'>{t('Excluded')}</SelectItem>
              <SelectItem value='due'>{t('Due / never counted')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className='max-sm:px-3'>
        {isLoading ? (
          <Skeleton className='h-60 w-full' />
        ) : (
          <>
            <div className='hidden md:block'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Item')}</TableHead>
                    <TableHead className='w-44'>{t('Class')}</TableHead>
                    <TableHead className='text-right'>{t('Stock')}</TableHead>
                    <TableHead>{t('Last counted')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageItems.map((item) => (
                    <TableRow key={item.key}>
                      <TableCell>
                        <div className='max-w-[320px] truncate font-medium' title={item.name}>
                          {item.name}
                          {item.variantLabel && <span className='font-normal text-muted-foreground'> — {item.variantLabel}</span>}
                        </div>
                        <div className='text-xs text-muted-foreground'>{[item.category, item.barcode].filter(Boolean).join(' · ')}</div>
                      </TableCell>
                      <TableCell>
                        <ClassPicker item={item} editable={editable} onChange={changeClass} />
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>{fmtQty(item.systemQty)}</TableCell>
                      <TableCell className='text-sm text-muted-foreground'>{lastCounted(item)}</TableCell>
                      <TableCell className='text-sm'>{statusLabel(item)}</TableCell>
                    </TableRow>
                  ))}
                  {pageItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className='py-8 text-center text-muted-foreground'>
                        {t('No items')}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <div className='space-y-2 md:hidden'>
              {pageItems.map((item) => (
                <div key={item.key} className='rounded-lg border p-3'>
                  <div className='flex items-start justify-between gap-2'>
                    <div className='min-w-0'>
                      <div className='truncate font-medium'>{item.name}</div>
                      {item.variantLabel && <div className='truncate text-xs text-muted-foreground'>{item.variantLabel}</div>}
                    </div>
                    <ClassPicker item={item} editable={editable} onChange={changeClass} compact />
                  </div>
                  <div className='mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground'>
                    <span>
                      {t('Stock')}: <b className='text-foreground'>{fmtQty(item.systemQty)}</b>
                    </span>
                    <span>
                      {t('Last counted')}: {lastCounted(item)}
                    </span>
                    <span>{statusLabel(item)}</span>
                  </div>
                </div>
              ))}
            </div>
            <SimplePagination
              currentPage={page}
              totalPages={Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))}
              totalResults={filtered.length}
              limit={PAGE_SIZE}
              onPageChange={setPage}
              className='mt-3'
            />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ClassPicker({
  item,
  editable,
  onChange,
  compact,
}: {
  item: PlanItem
  editable: boolean
  onChange: (productId: string, value: string) => void
  compact?: boolean
}) {
  const { t } = useLanguage()
  if (!editable) return <ClassBadge cls={item.cls} />
  return (
    <Select value={item.overridden ? item.cls : 'auto'} onValueChange={(v) => onChange(item.productId, v)}>
      <SelectTrigger className={compact ? 'h-8 w-28' : 'h-8 w-40'}>
        <div className='flex items-center gap-1.5'>
          <ClassBadge cls={item.cls} />
          <span className='text-xs text-muted-foreground'>{item.overridden ? t('set by hand') : t('auto')}</span>
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value='auto'>{t('Automatic')}</SelectItem>
        <SelectItem value='A'>{t('Always A')}</SelectItem>
        <SelectItem value='B'>{t('Always B')}</SelectItem>
        <SelectItem value='C'>{t('Always C')}</SelectItem>
        <SelectItem value='exclude'>{t('Exclude from cycle counts')}</SelectItem>
      </SelectContent>
    </Select>
  )
}
