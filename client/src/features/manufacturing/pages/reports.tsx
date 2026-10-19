import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowLeft,
  Boxes,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  FileText,
  Factory,
  FileSpreadsheet,
  GitBranch,
  Layers,
  PackageMinus,
  Printer,
  RefreshCw,
  Scale,
  Trash2,
  Workflow,
  type LucideIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import type { RootState } from '@/stores/store'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import {
  useGetManufacturingReportQuery,
  useSearchManufacturingBatchesQuery,
} from '@/stores/manufacturing.api'
import { useCurrencyMeta } from '@/lib/format-money'
import { formatAppDate } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useLanguage } from '@/context/language-context'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
import { openPrintWindowForFormat } from '@/features/invoice/utils/print-utils'
import {
  LEDGER_PERIOD_PRESETS,
  getStoredLedgerPeriod,
  resolveLedgerPeriod,
  storeLedgerPeriod,
  type LedgerPeriod,
} from '@/features/accounting/utils/ledger-period'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Switch } from '@/components/ui/switch'
import { FilterChips, SearchField } from '../components/list-controls'
import { EmptyState, PageHeader } from '../components/page'
import { ReportView } from '../components/report-view'
import { fmtQty, orderPath, statusLabel } from '../lib/constants'
import { buildReportDoc } from '../lib/report-doc'
import { exportReportToExcel } from '../lib/report-excel'
import { generateReportHTML } from '../lib/report-print'
import type { ReportKey, ReportParams } from '../lib/report-types'

type MenuKey = Exclude<ReportKey, 'stock-register'>

const REPORTS: { key: MenuKey; label: string; hint: string; icon: LucideIcon }[] = [
  { key: 'production', label: 'Production Summary', hint: 'Batch-wise planned, completed, remaining', icon: ClipboardList },
  { key: 'daily', label: 'Date-wise Summary', hint: 'Issue, production, remaining by date', icon: CalendarDays },
  { key: 'batch', label: 'Batch Report', hint: 'One batch from issue to finished goods', icon: FileText },
  { key: 'material-issues', label: 'Issue for Production', hint: 'Material issue register', icon: PackageMinus },
  { key: 'material-consumption', label: 'Issue vs Consumption', hint: 'Issued, used, wasted, on floor', icon: Scale },
  { key: 'finished-goods', label: 'Finished Goods', hint: 'Produced, dispatched, remaining', icon: Boxes },
  { key: 'raw-materials', label: 'Raw Materials', hint: 'Purchased, issued, balance', icon: Factory },
  { key: 'in-process', label: 'In-Process Batches', hint: 'What is on the floor now', icon: Workflow },
  { key: 'scrap', label: 'Scrap & Rejection', hint: 'Losses by stage and reason', icon: Trash2 },
  { key: 'batch-stock', label: 'Batch Stock & Expiry', hint: 'Every lot, its age and expiry', icon: Layers },
  { key: 'batch-trace', label: 'Batch Traceability', hint: 'One lot: in, out, made from, sold to', icon: GitBranch },
]

const PERIOD_KEY = 'mfg-report-period'
const DATELESS: ReportKey[] = ['in-process', 'batch-stock', 'batch-trace']
const IDLE_LABEL: Partial<Record<ReportKey, string>> = {
  'finished-goods': 'Hide products with no stock and no movement',
  'raw-materials': 'Hide products with no stock and no movement',
  daily: 'Hide days with no activity',
}
const WITH_STATUS: ReportKey[] = ['production', 'material-consumption']
const STATEMENTS: ReportKey[] = ['finished-goods', 'raw-materials']
const DRILLS_TO_BATCH: ReportKey[] = ['production', 'daily', 'in-process', 'material-issues', 'material-consumption']

export default function ManufacturingReportsPage({
  report = 'production',
  productId,
  orderId,
  batchId,
  from,
}: {
  report?: ReportKey
  productId?: string
  /** The batch (production order) of the batch report. */
  orderId?: string
  /** The stock batch (lot) of the batch traceability report. */
  batchId?: string
  /** Report a stock register or batch report was opened from (for the back link). */
  from?: MenuKey
}) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const currency = useCurrencyMeta()
  const activeBranchId = useSelector((s: RootState) => s.auth.activeBranchId)
  const user = useSelector((s: RootState) => s.auth.data?.user)
  const { data: branch } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: org } = useGetMyOrganizationQuery(undefined)

  const [period, setPeriod] = useState<LedgerPeriod>(() => getStoredLedgerPeriod(PERIOD_KEY))
  const [status, setStatus] = useState<'all' | 'open' | 'completed'>('all')
  const [search, setSearch] = useState('')
  const [hideIdle, setHideIdle] = useState(true)
  const [batchKind, setBatchKind] = useState<NonNullable<ReportParams['kind']>>('all')
  const [expiry, setExpiry] = useState<NonNullable<ReportParams['expiry']>>('all')
  const [withEmpty, setWithEmpty] = useState(false)
  const debouncedSearch = useDebouncedValue(search, 300)

  const isRegister = report === 'stock-register'
  const isBatch = report === 'batch'
  const isBatchStock = report === 'batch-stock'
  const isTrace = report === 'batch-trace'
  const active: MenuKey = isRegister ? from || 'finished-goods' : (report as MenuKey)

  const changePeriod = (next: LedgerPeriod) => {
    setPeriod(next)
    storeLedgerPeriod(PERIOD_KEY, next)
  }
  const go = (search: Record<string, string | undefined>) =>
    navigate({ to: '/manufacturing/reports', search: search as never })

  useEffect(() => {
    setSearch('')
  }, [report])

  const params = {
    report,
    ...(DATELESS.includes(report) || isBatch ? {} : { startDate: period.startDate, endDate: period.endDate }),
    ...(WITH_STATUS.includes(report) && status !== 'all' ? { status } : {}),
    ...(STATEMENTS.includes(report) ? { search: debouncedSearch.trim() || undefined } : {}),
    ...(IDLE_LABEL[report] ? { hideIdle } : {}),
    ...(isRegister && productId ? { productId } : {}),
    ...(isBatch && orderId ? { productionOrderId: orderId } : {}),
    ...(isBatchStock
      ? {
          kind: batchKind,
          expiry,
          stock: withEmpty ? ('all' as const) : ('in' as const),
          search: debouncedSearch.trim() || undefined,
        }
      : {}),
    ...(isTrace && batchId ? { batchId } : {}),
  }
  const skip = (isRegister && !productId) || (isBatch && !orderId) || (isTrace && !batchId)
  // The traceability picker: the branch's most recent batches.
  const { data: batchHits, isFetching: loadingLots } = useSearchManufacturingBatchesQuery('', { skip: !isTrace })
  const lotOptions = useMemo(
    () =>
      (batchHits || []).map((b) => ({
        value: b.id,
        label: `${b.batchNumber} — ${b.productName}`,
        sublabel: `${fmtQty(b.quantity)} ${b.unit}${b.expiryDate ? ` · ${t('exp')} ${formatAppDate(new Date(b.expiryDate))}` : ''}`,
      })),
    [batchHits, t]
  )
  // The batch picker lists the batches worked in the chosen period.
  const { data: batchList, isFetching: loadingBatches } = useGetManufacturingReportQuery(
    { report: 'production', startDate: period.startDate, endDate: period.endDate },
    { skip: !isBatch }
  )
  const batchOptions = useMemo(() => {
    const orders = batchList?.report === 'production' ? batchList.orders : []
    const options = [...orders]
      .reverse()
      .map((o) => ({
        value: o.id,
        label: `${o.orderNumber} — ${o.productName}`,
        sublabel: `${fmtQty(o.planned)} ${o.unit} · ${statusLabel(o.status, o.orderType)}`,
      }))
    return options
  }, [batchList])
  const { data, isFetching, isError, refetch } = useGetManufacturingReportQuery(params, {
    skip,
    refetchOnMountOrArgChange: 30,
  })
  // A previous report's data can linger while the next one loads — only draw a match.
  const current = data && data.report === report ? data : undefined
  const tracedOptions =
    current?.report === 'batch-trace' && !lotOptions.some((o) => o.value === current.batch.id)
      ? [{ value: current.batch.id, label: `${current.batch.batchNumber} — ${current.batch.productName}` }, ...lotOptions]
      : lotOptions
  const pickerOptions =
    current?.report === 'batch' && !batchOptions.some((o) => o.value === current.order.id)
      ? [{ value: current.order.id, label: `${current.order.orderNumber} — ${current.order.productName}` }, ...batchOptions]
      : batchOptions

  const decimals = currency.decimalPlaces ?? 2
  const doc = useMemo(
    () =>
      current
        ? buildReportDoc(current, {
            t,
            currency: currency.symbol?.trim() || currency.code || '',
            figure: (n) =>
              `${n < 0 ? '−' : ''}${Math.abs(n).toLocaleString('en-US', {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals,
              })}`,
          })
        : null,
    [current, t, currency.symbol, currency.code, decimals]
  )

  const companyName = resolveBranchCompanyName(org?.name, branch?.name) || org?.name
  const branchName = branch?.name

  const print = () => {
    if (!doc) return
    try {
      openPrintWindowForFormat(
        generateReportHTML(
          doc,
          {
            companyName,
            companyAddress: [branch?.location?.address, branch?.location?.city].filter(Boolean).join(', '),
            companyPhone: branch?.phone,
            companyLogo: org?.logo?.url,
            branchName,
            preparedBy: user?.name,
          },
          t
        ),
        'a4'
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Could not open the print window'))
    }
  }

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Reports')}
        description={t(
          'Production, material issue, finished goods and in-process statements — print them or take them to Excel.'
        )}
        actions={
          <>
            <Button variant='outline' size='sm' onClick={() => refetch()} disabled={skip || isFetching}>
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
              {t('Refresh')}
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={!doc}
              onClick={() => doc && exportReportToExcel(doc, { companyName, branchName })}
            >
              <FileSpreadsheet className='h-4 w-4' />
              {t('Excel')}
            </Button>
            <Button size='sm' disabled={!doc} onClick={print}>
              <Printer className='h-4 w-4' />
              {t('Print / PDF')}
            </Button>
          </>
        }
      />

      <nav
        aria-label={t('Reports')}
        className='-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 xl:grid-cols-5'
      >
        {REPORTS.map((r) => {
          const selected = r.key === active
          return (
            <button
              key={r.key}
              type='button'
              aria-pressed={selected}
              onClick={() => go({ report: r.key })}
              className={cn(
                'focus-visible:ring-ring flex min-w-[11rem] shrink-0 items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none focus-visible:ring-2 sm:min-w-0',
                selected
                  ? 'border-foreground bg-foreground text-background'
                  : 'bg-card hover:border-foreground/30'
              )}
            >
              <r.icon className={cn('mt-0.5 h-4 w-4 shrink-0', !selected && 'text-muted-foreground')} aria-hidden />
              <span className='min-w-0'>
                <span className='block text-sm font-semibold'>{t(r.label)}</span>
                <span className={cn('block truncate text-xs', selected ? 'opacity-75' : 'text-muted-foreground')}>
                  {t(r.hint)}
                </span>
              </span>
            </button>
          )
        })}
      </nav>

      <div className='bg-card space-y-3 rounded-xl border px-4 py-3'>
        {(isRegister || ((isBatch || isTrace) && from)) && (
          <Button
            variant='ghost'
            size='sm'
            className='-ml-2'
            onClick={() => go({ report: from || 'finished-goods' })}
          >
            <ArrowLeft className='h-4 w-4' />
            {t('Back to')} {t(REPORTS.find((r) => r.key === (from || 'finished-goods'))?.label || '')}
          </Button>
        )}
        {DATELESS.includes(report) ? (
          <p className='text-muted-foreground text-sm'>
            {isBatchStock
              ? t('Every batch (lot) held right now — where it came from, when it was made and when it expires.')
              : isTrace
                ? t('Follow one batch: every quantity in and out, the material batches it was made from, the orders it went into and the customers who bought it.')
                : t('Shows the position right now — every batch released, running, paused or waiting for QC.')}
          </p>
        ) : (
          <div className='flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between'>
            <FilterChips
              label={t('Period')}
              value={period.preset}
              onChange={(v) => changePeriod(resolveLedgerPeriod(v as Exclude<LedgerPeriod['preset'], 'custom'>))}
              options={[
                ...LEDGER_PERIOD_PRESETS.map((p) => ({ value: p.value, label: t(p.label) })),
                ...(period.preset === 'custom' ? [{ value: 'custom', label: t('Custom') }] : []),
              ]}
            />
            <div className='grid grid-cols-2 gap-2 sm:w-[22rem]'>
              {(['startDate', 'endDate'] as const).map((field) => (
                <div key={field} className='min-w-0 space-y-1'>
                  <Label className='text-muted-foreground text-xs'>
                    {field === 'startDate' ? t('From') : t('To')}
                  </Label>
                  <Input
                    type='date'
                    value={period[field]}
                    onChange={(e) => {
                      const value = e.target.value
                      if (!value) return
                      const next = { ...period, preset: 'custom' as const, [field]: value }
                      if (next.startDate > next.endDate) {
                        if (field === 'startDate') next.endDate = value
                        else next.startDate = value
                      }
                      changePeriod(next)
                    }}
                    className='h-9'
                  />
                </div>
              ))}
            </div>
          </div>
        )}
        {isBatch && (
          <div className='flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-end'>
            <div className='min-w-0 flex-1 space-y-1 sm:max-w-md'>
              <Label className='text-muted-foreground text-xs'>
                {t('Batch / production order')}
                {loadingBatches ? ' …' : ` (${batchOptions.length} ${t('in this period')})`}
              </Label>
              <SearchableSelect
                options={pickerOptions}
                value={orderId || ''}
                onValueChange={(id) => id && go({ report: 'batch', orderId: id, from })}
                placeholder={t('Choose a batch')}
                searchPlaceholder={t('Search order no. or product')}
                emptyText={t('No batch was worked in this period — widen the period above.')}
              />
            </div>
            {orderId && current?.report === 'batch' && (
              <Button variant='outline' size='sm' asChild>
                <Link to={orderPath({ id: current.order.id, orderType: current.order.orderType }) as never}>
                  <ExternalLink className='h-4 w-4' />
                  {t('Open order')}
                </Link>
              </Button>
            )}
          </div>
        )}
        {isBatchStock && (
          <div className='flex flex-col gap-3 border-t pt-3'>
            <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
              <FilterChips
                label={t('Products')}
                value={batchKind}
                onChange={(v) => setBatchKind(v as typeof batchKind)}
                options={[
                  { value: 'all', label: t('All products') },
                  { value: 'finished', label: t('Finished goods') },
                  { value: 'materials', label: t('Raw & packing') },
                ]}
              />
              <FilterChips
                label={t('Expiry')}
                value={expiry}
                onChange={(v) => setExpiry(v as typeof expiry)}
                options={[
                  { value: 'all', label: t('Any expiry') },
                  { value: 'expired', label: t('Expired') },
                  { value: '30', label: t('≤ 30 days') },
                  { value: '60', label: t('≤ 60 days') },
                  { value: '90', label: t('≤ 90 days') },
                ]}
              />
            </div>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
              <SearchField value={search} onChange={setSearch} placeholder={t('Search batch no., product or SKU')} />
              <label className='flex items-center gap-2 text-sm'>
                <Switch checked={withEmpty} onCheckedChange={setWithEmpty} />
                {t('Include used-up batches')}
              </label>
            </div>
          </div>
        )}
        {isTrace && (
          <div className='flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-end'>
            <div className='min-w-0 flex-1 space-y-1 sm:max-w-md'>
              <Label className='text-muted-foreground text-xs'>
                {t('Batch (lot)')}
                {loadingLots ? ' …' : ` (${lotOptions.length} ${t('recent')})`}
              </Label>
              <SearchableSelect
                options={tracedOptions}
                value={batchId || ''}
                onValueChange={(id) => id && go({ report: 'batch-trace', batchId: id, from })}
                placeholder={t('Choose a batch')}
                searchPlaceholder={t('Search batch no. or product')}
                emptyText={t('No batch found — open Batch Stock & Expiry to find older batches.')}
              />
            </div>
          </div>
        )}
        {(WITH_STATUS.includes(report) || STATEMENTS.includes(report) || IDLE_LABEL[report]) && (
          <div className='flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between'>
            {WITH_STATUS.includes(report) && (
              <FilterChips
                label={t('Orders')}
                value={status}
                onChange={(v) => setStatus(v as typeof status)}
                options={[
                  { value: 'all', label: t('All orders') },
                  { value: 'open', label: t('Open') },
                  { value: 'completed', label: t('Completed') },
                ]}
              />
            )}
            {STATEMENTS.includes(report) && (
              <SearchField value={search} onChange={setSearch} placeholder={t('Search product or SKU')} />
            )}
            {IDLE_LABEL[report] && (
              <label className='flex items-center gap-2 text-sm'>
                <Switch checked={hideIdle} onCheckedChange={setHideIdle} />
                {t(IDLE_LABEL[report]!)}
              </label>
            )}
          </div>
        )}
      </div>

      {skip ? (
        isTrace ? (
          <EmptyState
            icon={GitBranch}
            title={t('Choose a batch')}
            description={t('Pick a batch above, or click any batch in Batch Stock & Expiry.')}
          />
        ) : isBatch ? (
          <EmptyState
            icon={FileText}
            title={t('Choose a batch')}
            description={t('Pick a production order above, or click any batch in the Production Summary, Date-wise or In-Process report.')}
          />
        ) : (
          <EmptyState
            icon={Boxes}
            title={t('Choose a product')}
            description={t('Open a stock statement and click a product to see its register.')}
          />
        )
      ) : isError && !current ? (
        <EmptyState
          icon={ClipboardList}
          title={t('This report could not be loaded')}
          action={
            <Button variant='outline' size='sm' onClick={() => refetch()}>
              {t('Try again')}
            </Button>
          }
        />
      ) : !doc ? (
        <div className='space-y-3'>
          <Skeleton className='h-24 w-full rounded-xl' />
          <Skeleton className='h-80 w-full rounded-xl' />
        </div>
      ) : (
        <div className={cn('transition-opacity', isFetching && 'opacity-60')} aria-busy={isFetching}>
          {(STATEMENTS.includes(report) || DRILLS_TO_BATCH.includes(report) || isBatchStock || isTrace) && (
            <p className='text-muted-foreground mb-2 text-xs'>
              {STATEMENTS.includes(report)
                ? t('Click a product to open its day-by-day stock register.')
                : isBatchStock
                  ? t('Click a batch to trace it.')
                  : isTrace
                    ? t('Click a production order to open its batch report, or a material batch to trace it further back.')
                    : t('Click a batch to open its full batch report.')}
            </p>
          )}
          <ReportView
            doc={doc}
            companyName={companyName}
            branchName={branchName}
            onDrill={(drill) =>
              'productId' in drill
                ? go({ report: 'stock-register', productId: drill.productId, from: report })
                : 'batchId' in drill
                  ? go({ report: 'batch-trace', batchId: drill.batchId, from: isTrace ? from : (report as MenuKey) })
                  : go({ report: 'batch', orderId: drill.orderId, from: isBatch ? from : (report as MenuKey) })
            }
          />
        </div>
      )}
    </div>
  )
}
