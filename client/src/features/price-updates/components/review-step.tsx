import { useMemo, useReducer, useState } from 'react'
import { toast } from 'sonner'
import { ArrowLeft, CheckCheck, ChevronDown, Loader2, RotateCcw, Search, TrendingDown, TrendingUp, TriangleAlert } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { useLanguage } from '@/context/language-context'
import { getErrorMessage } from '@/lib/get-error-message'
import { useCurrencySymbolPrefix } from '@/lib/format-money'
import type { ListType, PricingRule } from '@/lib/price-update-rules'
import { cn } from '@/lib/utils'
import { useApplyPriceUpdateMutation, type AnalyzeResponse, type ApplyResponse, type PriceMode } from '@/stores/priceUpdate.api'

import { IGNORED_REASON } from '../lib/labels'
import {
  buildApplyItems,
  deriveRows,
  initSession,
  matchesFilter,
  sessionReducer,
  summarize,
  type DerivedRow,
  type ReviewFilter,
} from '../lib/session'
import { RulePanel } from './rule-panel'
import { ReviewRow, type RowActions } from './review-row'
import type { SourceMeta } from './source-step'

const PAGE_SIZE = 100
const GRID =
  'grid-cols-[28px_minmax(0,1fr)] lg:grid-cols-[28px_minmax(150px,1fr)_minmax(230px,1.35fr)_minmax(130px,0.75fr)_minmax(130px,0.75fr)_minmax(128px,auto)]'

export interface AppliedResult {
  response: ApplyResponse
  /** The rows that were sent, in request order — so a result can be shown by product name. */
  sent: DerivedRow[]
}

interface ReviewStepProps {
  analysis: AnalyzeResponse
  source: SourceMeta
  listType: ListType
  onListType: (type: ListType) => void
  rule: PricingRule
  onRule: (rule: PricingRule) => void
  onBack: () => void
  onApplied: (result: AppliedResult) => void
}

const priceModeOf = (listType: ListType): PriceMode => (listType === 'cost' ? 'cost' : listType === 'price' ? 'price' : 'both')

export function ReviewStep({ analysis, source, listType, onListType, rule, onRule, onBack, onApplied }: ReviewStepProps) {
  const { t } = useLanguage()
  const currency = useCurrencySymbolPrefix().trim()

  const [state, dispatch] = useReducer(sessionReducer, analysis.rows, initSession)
  const [filter, setFilter] = useState<ReviewFilter>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false)
  const [apply, { isLoading: applying }] = useApplyPriceUpdateMutation()

  const derived = useMemo(() => deriveRows(analysis.rows, state, listType, rule), [analysis.rows, state, listType, rule])
  const summary = useMemo(() => summarize(derived), [derived])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return derived.filter((d) => {
      if (!matchesFilter(d, filter)) return false
      if (!q) return true
      return (
        d.row.name.toLowerCase().includes(q) ||
        d.row.raw.toLowerCase().includes(q) ||
        (d.entry !== null && (d.entry.name.toLowerCase().includes(q) || d.entry.sku.toLowerCase().includes(q) || d.entry.barcode.toLowerCase().includes(q)))
      )
    })
  }, [derived, filter, query])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount)
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const actions: RowActions = useMemo(
    () => ({
      toggle: (index) => dispatch({ type: 'toggle', index }),
      confirm: (index) => dispatch({ type: 'confirm', index }),
      link: (index, entry) => dispatch({ type: 'link', index, entry }),
      unlink: (index) => dispatch({ type: 'unlink', index }),
      setCost: (index, value) => dispatch({ type: 'setCost', index, value }),
      setPrice: (index, value) => dispatch({ type: 'setPrice', index, value }),
    }),
    [],
  )

  const example = useMemo(
    () => derived.find((d) => d.calc && (d.calc.costChanged || d.calc.priceChanged) && d.status !== 'unmatched') || null,
    [derived],
  )
  const twoColumnsHint = useMemo(() => {
    if (listType !== 'cost' && listType !== 'price') return false
    const two = analysis.rows.filter((r) => r.values.filter((v) => !v.kind).length >= 2).length
    return analysis.rows.length > 0 && two / analysis.rows.length >= 0.4
  }, [analysis.rows, listType])

  const tickableIndices = derived.filter((d) => d.status === 'ready' || d.status === 'excluded').map((d) => d.row.index)
  const allTicked = tickableIndices.length > 0 && summary.excluded === 0 && summary.ready > 0
  const pendingSuggestions = derived.filter((d) => d.entry && !d.state.confirmed && d.row.match.status !== 'high').length
  const edited = state.rows.some((r) => r.costOverride !== null || r.priceOverride !== null)

  const chips: Array<{ key: ReviewFilter; label: string; count: number; tone?: string }> = [
    { key: 'all', label: t('All'), count: summary.lines },
    { key: 'ready', label: t('Ready'), count: summary.ready + summary.excluded + summary.superseded, tone: 'text-emerald-600' },
    { key: 'review', label: t('Needs review'), count: summary.review, tone: 'text-amber-600' },
    { key: 'unmatched', label: t('Not matched'), count: summary.unmatched, tone: 'text-muted-foreground' },
    { key: 'unchanged', label: t('No change'), count: summary.unchanged },
    { key: 'warnings', label: t('Warnings'), count: derived.filter((d) => matchesFilter(d, 'warnings')).length, tone: 'text-red-600' },
  ]

  const doApply = async () => {
    setConfirmOpen(false)
    const sent = derived.filter((d) => d.status === 'ready')
    const items = buildApplyItems(sent)
    if (!items.length) return
    try {
      const response = await apply({
        items,
        meta: {
          sourceType: source.sourceType,
          fileName: source.fileName,
          supplierId: source.supplierId,
          note: source.note || undefined,
          priceMode: priceModeOf(listType),
          rule: { ...rule, listType },
          sourceText: source.sourceText,
        },
      }).unwrap()
      onApplied({ response, sent })
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not apply the price update')))
    }
  }

  const requestApply = () => {
    if (summary.updating === 0) return
    // Anything that could be a costly mistake gets one explicit "are you sure"; a clean update doesn't.
    if (summary.belowCost > 0 || summary.bigChanges > 0) setConfirmOpen(true)
    else void doApply()
  }

  const gridHeader = (
    <div className={cn('hidden items-center gap-x-3 border-b bg-muted/50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid', GRID)}>
      <Checkbox
        checked={allTicked}
        disabled={tickableIndices.length === 0}
        onCheckedChange={(v) => dispatch({ type: 'setIncluded', indices: tickableIndices, included: v === true })}
        aria-label={t('Select all ready rows')}
      />
      <span>{t('From your list')}</span>
      <span>{t('Your product')}</span>
      <span>{t('Cost')}{currency ? ` (${currency})` : ''}</span>
      <span>{t('Selling price')}{currency ? ` (${currency})` : ''}</span>
      <span className='text-right'>{t('Margin')}</span>
    </div>
  )

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
        <StatCard label={t('Will be updated')} value={String(summary.updating)} sub={`${t('of')} ${summary.lines} ${t('lines')}`} tone='primary' />
        <StatCard
          label={t('Average cost change')}
          value={`${summary.avgCostPercent > 0 ? '+' : ''}${summary.avgCostPercent.toFixed(1)}%`}
          sub={`${summary.costUp} ${t('up')} · ${summary.costDown} ${t('down')}`}
          icon={summary.avgCostPercent >= 0 ? <TrendingUp className='h-4 w-4' /> : <TrendingDown className='h-4 w-4' />}
        />
        <StatCard
          label={t('Average price change')}
          value={`${summary.avgPricePercent > 0 ? '+' : ''}${summary.avgPricePercent.toFixed(1)}%`}
          sub={t('selling prices')}
        />
        <StatCard
          label={t('Need your attention')}
          value={String(summary.review + summary.unmatched + summary.belowCost)}
          sub={`${summary.review} ${t('to check')} · ${summary.unmatched} ${t('unmatched')}${summary.belowCost ? ` · ${summary.belowCost} ${t('below cost')}` : ''}`}
          tone={summary.belowCost > 0 ? 'danger' : summary.review + summary.unmatched > 0 ? 'warn' : 'ok'}
        />
      </div>

      <RulePanel rule={rule} onRule={onRule} listType={listType} onListType={onListType} example={example} twoColumnsHint={twoColumnsHint} />

      <Card className='overflow-hidden'>
        <div className='space-y-3 border-b p-3'>
          <div className='flex flex-wrap items-center gap-1.5' role='tablist' aria-label={t('Filter lines')}>
            {chips.map((chip) => (
              <button
                key={chip.key}
                type='button'
                role='tab'
                aria-selected={filter === chip.key}
                onClick={() => {
                  setFilter(chip.key)
                  setPage(1)
                }}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  filter === chip.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                {chip.label}
                <span className={cn('tabular-nums', filter === chip.key ? 'text-primary-foreground/80' : chip.tone)}>{chip.count}</span>
              </button>
            ))}
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <div className='relative min-w-52 flex-1'>
              <Search className='absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
                placeholder={t('Search this list…')}
                className='h-9 pl-8'
                showVoiceInput={false}
                aria-label={t('Search this list')}
              />
            </div>
            {pendingSuggestions > 0 && (
              <Button variant='outline' size='sm' onClick={() => setBulkConfirmOpen(true)}>
                <CheckCheck className='mr-1.5 h-4 w-4' /> {t('Confirm all suggestions')} ({pendingSuggestions})
              </Button>
            )}
            {edited && (
              <Button variant='ghost' size='sm' onClick={() => dispatch({ type: 'resetOverrides' })}>
                <RotateCcw className='mr-1.5 h-4 w-4' /> {t('Undo my edits')}
              </Button>
            )}
          </div>
        </div>

        {gridHeader}

        <div>
          {visible.length === 0 ? (
            <p className='px-4 py-10 text-center text-sm text-muted-foreground'>{t('No lines match this filter.')}</p>
          ) : (
            visible.map((d) => <ReviewRow key={d.row.index} d={d} actions={actions} gridClass={GRID} />)
          )}
        </div>

        {pageCount > 1 && (
          <div className='flex items-center justify-between gap-2 border-t p-3 text-xs text-muted-foreground'>
            <span>
              {t('Showing')} {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} {t('of')} {filtered.length}
            </span>
            <div className='flex gap-2'>
              <Button variant='outline' size='sm' disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>{t('Previous')}</Button>
              <Button variant='outline' size='sm' disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)}>{t('Next')}</Button>
            </div>
          </div>
        )}
      </Card>

      {analysis.ignored.length > 0 && (
        <Collapsible>
          <Card>
            <CollapsibleTrigger asChild>
              <button type='button' className='flex w-full items-center justify-between gap-2 p-3 text-left text-sm'>
                <span className='font-medium'>
                  {analysis.ignored.length} {t(analysis.ignored.length === 1 ? 'line was skipped' : 'lines were skipped')}
                  <span className='ml-2 font-normal text-muted-foreground'>{t('(greetings, dates, headings…) — check nothing important is here')}</span>
                </span>
                <ChevronDown className='h-4 w-4 text-muted-foreground' />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className='max-h-64 space-y-1 overflow-y-auto border-t pt-3 text-xs'>
                {analysis.ignored.map((l) => (
                  <div key={`${l.line}-${l.raw}`} className='flex gap-2'>
                    <span className='w-10 shrink-0 text-right text-muted-foreground'>#{l.line}</span>
                    <span className='min-w-0 flex-1 truncate font-mono' title={l.raw}>{l.raw}</span>
                    <span className='shrink-0 text-muted-foreground'>{t(IGNORED_REASON[l.reason] || l.reason)}</span>
                  </div>
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Sticky action bar */}
      {/* `sticky`, not `fixed`: it stays inside the page's own layout, so it can never slide under the sidebar. */}
      <div className='sticky bottom-0 z-30 -mx-4 border-t bg-background/95 px-4 py-3 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:-mx-6 md:px-6'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div className='min-w-0 text-sm'>
            <span className='font-semibold'>{summary.updating}</span> {t(summary.updating === 1 ? 'product will be updated' : 'products will be updated')}
            {summary.belowCost > 0 && (
              <span className='ml-2 inline-flex items-center gap-1 text-red-600'>
                <TriangleAlert className='h-3.5 w-3.5' /> {summary.belowCost} {t('below cost')}
              </span>
            )}
            {summary.review > 0 && <span className='ml-2 text-amber-600'>· {summary.review} {t('still need a look')}</span>}
          </div>
          <div className='flex gap-2'>
            <Button variant='outline' onClick={onBack} disabled={applying}>
              <ArrowLeft className='mr-1.5 h-4 w-4' /> {t('Back')}
            </Button>
            <Button onClick={requestApply} disabled={summary.updating === 0 || applying} className='min-w-44'>
              {applying && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {applying ? t('Applying…') : `${t('Apply')} ${summary.updating} ${t(summary.updating === 1 ? 'update' : 'updates')}`}
            </Button>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Apply these updates?')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className='space-y-3 text-sm'>
                <p>{summary.updating} {t('products will change. You can undo the whole update afterwards from History.')}</p>
                <ul className='space-y-1.5'>
                  {summary.belowCost > 0 && (
                    <li className='flex items-start gap-2 text-red-700 dark:text-red-400'>
                      <TriangleAlert className='mt-0.5 h-4 w-4 shrink-0' />
                      <span><b>{summary.belowCost}</b> {t('will be priced below their cost.')}</span>
                    </li>
                  )}
                  {summary.bigChanges > 0 && (
                    <li className='flex items-start gap-2 text-amber-700 dark:text-amber-400'>
                      <TriangleAlert className='mt-0.5 h-4 w-4 shrink-0' />
                      <span><b>{summary.bigChanges}</b> {t('change by 25% or more.')}</span>
                    </li>
                  )}
                </ul>
                <p className='text-xs text-muted-foreground'>{t('Tip: the “Warnings” filter shows exactly which lines.')}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Go back and check')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doApply()}>{t('Apply anyway')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkConfirmOpen} onOpenChange={setBulkConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Confirm all suggested matches?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingSuggestions} {t('lines have a suggested product that the system wasn’t fully sure about. Only confirm them all if you’ve checked them — unmatched lines are never touched.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                dispatch({ type: 'confirmAllReview' })
                setFilter('ready')
              }}
            >
              {t('Confirm all')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone,
}: {
  label: string
  value: string
  sub?: string
  icon?: React.ReactNode
  tone?: 'primary' | 'ok' | 'warn' | 'danger'
}) {
  return (
    <Card className={cn(tone === 'danger' && 'border-red-500/40', tone === 'warn' && 'border-amber-500/40')}>
      <CardContent className='p-3.5'>
        <p className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>{label}</p>
        <p className={cn('mt-1 flex items-center gap-1.5 text-2xl font-bold tabular-nums', tone === 'danger' && 'text-red-600', tone === 'warn' && 'text-amber-600', tone === 'ok' && 'text-emerald-600')}>
          {icon}
          {value}
        </p>
        {sub && <p className='mt-0.5 truncate text-xs text-muted-foreground'>{sub}</p>}
      </CardContent>
    </Card>
  )
}

