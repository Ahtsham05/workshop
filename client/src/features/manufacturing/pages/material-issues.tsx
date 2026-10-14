import { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import {
  ArrowRight,
  FileText,
  MoreHorizontal,
  PackageMinus,
  Pencil,
  PieChart,
  Plus,
  ReceiptText,
  Trash2,
} from 'lucide-react'
import {
  useGetMaterialIssuesQuery,
  type MaterialIssue,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DateRangeFilter } from '@/components/filters/date-range-filter'
import { CellStack, DataTable, type Column } from '../components/data-table'
import { DeleteIssueDialog } from '../components/delete-issue-dialog'
import { DetailSheet, SheetSection } from '../components/detail-sheet'
import { FilterChips, SearchField, Toolbar } from '../components/list-controls'
import { MaterialUsageView } from '../components/material-usage-view'
import { EmptyState, Field, PageHeader } from '../components/page'
import { Pager } from '../components/pager'
import { fmtDate, fmtQty, refName } from '../lib/constants'

function KindBadge({ issue }: { issue: MaterialIssue }) {
  const { t } = useLanguage()
  return (
    <>
      <Badge
        variant='outline'
        className={cn(
          'h-5 px-1.5 text-[10px] font-medium',
          issue.kind === 'return'
            ? 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300'
            : 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
        )}
      >
        {issue.kind === 'return' ? t('Return') : t('Issue')}
      </Badge>
      {issue.status === 'cancelled' && (
        <Badge
          variant='outline'
          className='h-5 border-rose-500/30 bg-rose-500/10 px-1.5 text-[10px] font-medium text-rose-700 dark:text-rose-300'
        >
          {t('Cancelled')}
        </Badge>
      )}
      {issue.isOverIssue && (
        <Badge
          variant='outline'
          className='h-5 border-violet-500/30 bg-violet-500/10 px-1.5 text-[10px] font-medium text-violet-700 dark:text-violet-300'
        >
          {t('Over-issue')}
        </Badge>
      )}
    </>
  )
}

/**
 * Material issues: the vouchers (issues and returns), and Material usage — where the
 * issued material went (used in output, returned, wastage, still in the factory).
 */
export default function MaterialIssuesPage({
  view,
  orderId,
}: {
  view?: 'usage'
  orderId?: string
}) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const canIssue = hasPermission('executeProduction')
  const setSearch = (next: { view?: 'usage'; orderId?: string }) =>
    navigate({
      to: '/manufacturing/material-issues' as never,
      search: next as never,
      replace: true,
    })

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Material issues')}
        description={
          view === 'usage'
            ? t(
                'Where issued material went: used in finished goods, returned to the store, wasted, or still on the factory floor.'
              )
            : t(
                'Every component moved from stock into WIP (issues) and back (returns). Each is permanent and appears in the stock ledger.'
              )
        }
        actions={
          canIssue ? (
            <Button asChild>
              <Link to={'/manufacturing/material-issues/new' as never}>
                <Plus className='mr-1.5 h-4 w-4' />
                {t('New Issue Voucher')}
              </Link>
            </Button>
          ) : undefined
        }
      />
      <Tabs
        value={view === 'usage' ? 'usage' : 'vouchers'}
        onValueChange={(v) => setSearch(v === 'usage' ? { view: 'usage' } : {})}
      >
        <TabsList>
          <TabsTrigger value='vouchers' className='gap-1.5 px-3'>
            <ReceiptText className='h-4 w-4' />
            {t('Issue vouchers')}
          </TabsTrigger>
          <TabsTrigger value='usage' className='gap-1.5 px-3'>
            <PieChart className='h-4 w-4' />
            {t('Material usage')}
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {view === 'usage' ? (
        <MaterialUsageView
          key={orderId || 'all'}
          orderId={orderId}
          onClearOrder={() => setSearch({ view: 'usage' })}
        />
      ) : (
        <IssueVouchers />
      )}
    </div>
  )
}

function IssueVouchers() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [kind, setKind] = useState<'all' | 'issue' | 'return' | 'cancelled'>(
    'all'
  )
  const { hasPermission } = usePermissions()
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState<MaterialIssue | null>(null)
  const [range, setRange] = useState<{ startDate?: string; endDate?: string }>(
    {}
  )
  const [page, setPage] = useState(1)
  const [open, setOpen] = useState<MaterialIssue | null>(null)
  const { data, isLoading, isFetching } = useGetMaterialIssuesQuery({
    page,
    limit: 20,
    search: debounced || undefined,
    kind: kind === 'issue' || kind === 'return' ? kind : undefined,
    status:
      kind === 'cancelled'
        ? 'cancelled'
        : kind === 'issue'
          ? 'posted'
          : undefined,
    dateFrom: range.startDate,
    dateTo: range.endDate,
  })
  const filtered = !!debounced || kind !== 'all' || !!range.startDate

  const columns: Column<MaterialIssue>[] = [
    {
      id: 'issue',
      header: t('Document'),
      className: 'w-48',
      cell: (issue) => (
        <div className='space-y-1'>
          <div className='flex items-center gap-1.5'>
            <span className='font-mono text-xs font-medium'>
              {issue.issueNumber}
            </span>
            <KindBadge issue={issue} />
          </div>
          <div className='text-muted-foreground text-xs tabular-nums'>
            {fmtDate(issue.issueDate)}
          </div>
        </div>
      ),
    },
    {
      id: 'order',
      header: t('Order'),
      className: 'w-32',
      cell: (issue) => (
        <Link
          to={
            `/manufacturing/production-orders/${issue.productionOrderId}` as never
          }
          onClick={(e) => e.stopPropagation()}
          className='font-mono text-xs hover:underline'
        >
          {issue.orderNumber}
        </Link>
      ),
    },
    {
      id: 'materials',
      header: t('Materials'),
      hideBelow: 'md',
      cell: (issue) => (
        <CellStack
          primary={
            <span className='font-normal'>
              {issue.lines[0]?.productName} ×{fmtQty(issue.lines[0]?.quantity)}
            </span>
          }
          secondary={
            issue.lines.length > 1
              ? t('+{{n}} more').replace(
                  '{{n}}',
                  String(issue.lines.length - 1)
                )
              : undefined
          }
        />
      ),
    },
    {
      id: 'value',
      header: t('Value'),
      align: 'right',
      cell: (issue) => (
        <span
          className={cn(
            'tabular-nums',
            issue.status === 'cancelled' && 'text-muted-foreground line-through'
          )}
        >
          {formatMoney(issue.totalCost)}
        </span>
      ),
    },
    {
      id: 'by',
      header: t('By'),
      hideBelow: 'lg',
      cell: (issue) => (
        <span className='text-muted-foreground'>
          {refName(issue.createdBy) || '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: <span className='sr-only'>{t('Actions')}</span>,
      className: 'w-12',
      align: 'right',
      cell: (issue) => {
        const changeable =
          issue.kind === 'issue' && issue.status !== 'cancelled'
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
                className='h-8 w-8'
                onClick={(e) => e.stopPropagation()}
                aria-label={`${t('Actions for')} ${issue.issueNumber}`}
              >
                <MoreHorizontal className='h-4 w-4' />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align='end'
              onClick={(e) => e.stopPropagation()}
            >
              <DropdownMenuItem asChild>
                <Link
                  to={`/manufacturing/material-issues/${issue.id}` as never}
                >
                  <FileText className='mr-2 h-4 w-4' />
                  {t('Open voucher')}
                </Link>
              </DropdownMenuItem>
              {changeable && hasPermission('executeProduction') && (
                <DropdownMenuItem
                  onClick={() =>
                    navigate({
                      to: `/manufacturing/material-issues/${issue.id}` as never,
                      search: { edit: true } as never,
                    })
                  }
                >
                  <Pencil className='mr-2 h-4 w-4' />
                  {t('Edit')}
                </DropdownMenuItem>
              )}
              {changeable && hasPermission('manageProductionOrders') && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className='text-rose-600 focus:text-rose-700 dark:text-rose-400'
                    onClick={() => setDeleting(issue)}
                  >
                    <Trash2 className='mr-2 h-4 w-4' />
                    {t('Delete')}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <div className='space-y-5'>
      <Toolbar
        end={
          <DateRangeFilter
            startDate={range.startDate}
            endDate={range.endDate}
            onChange={(r) => {
              setRange(r)
              setPage(1)
            }}
          />
        }
      >
        <SearchField
          value={search}
          onChange={(v) => {
            setSearch(v)
            setPage(1)
          }}
          placeholder={t('Search document, order or material')}
        />
        <FilterChips
          label={t('Filter by document type')}
          value={kind}
          onChange={(v) => {
            setKind(v as typeof kind)
            setPage(1)
          }}
          options={[
            { value: 'all', label: t('All') },
            { value: 'issue', label: t('Issues') },
            { value: 'return', label: t('Returns') },
            { value: 'cancelled', label: t('Cancelled'), tone: 'danger' },
          ]}
        />
      </Toolbar>

      <DataTable
        caption={t('Material issues')}
        columns={columns}
        rows={data?.results}
        rowKey={(i) => i.id}
        loading={isLoading}
        fetching={isFetching}
        onRowClick={setOpen}
        empty={
          <EmptyState
            bordered={false}
            icon={PackageMinus}
            title={
              filtered
                ? t('Nothing matches these filters')
                : t('No material issues yet')
            }
            description={
              filtered
                ? t('Try another type, date range or search.')
                : t(
                    'Release a production order, then issue its materials with a New Issue Voucher.'
                  )
            }
          />
        }
        mobileCard={(issue) => (
          <div className='space-y-1.5'>
            <div className='flex items-center justify-between gap-3'>
              <div className='flex items-center gap-1.5'>
                <span className='font-mono text-xs font-medium'>
                  {issue.issueNumber}
                </span>
                <KindBadge issue={issue} />
              </div>
              <span className='text-sm tabular-nums'>
                {formatMoney(issue.totalCost)}
              </span>
            </div>
            <div className='text-muted-foreground truncate text-xs'>
              {issue.orderNumber} · {fmtDate(issue.issueDate)} ·{' '}
              {t('{{n}} line(s)').replace('{{n}}', String(issue.lines.length))}
            </div>
          </div>
        )}
        footer={
          data && data.totalPages > 1 ? (
            <Pager data={data} page={page} onPageChange={setPage} />
          ) : undefined
        }
      />

      {deleting && (
        <DeleteIssueDialog
          issue={deleting}
          open
          onOpenChange={(o) => !o && setDeleting(null)}
        />
      )}

      {open && (
        <DetailSheet
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={
            <span className='flex items-center gap-2'>
              <span className='font-mono'>{open.issueNumber}</span>
            </span>
          }
          description={
            open.kind === 'return'
              ? t('Materials returned from WIP to stock')
              : t('Materials issued from stock into WIP')
          }
          badges={<KindBadge issue={open} />}
          footer={
            <div className='flex flex-wrap gap-2'>
              <Button asChild>
                <Link to={`/manufacturing/material-issues/${open.id}` as never}>
                  <FileText className='mr-1.5 h-3.5 w-3.5' />
                  {t('Open voucher')}
                </Link>
              </Button>
              <Button asChild variant='outline'>
                <Link
                  to={
                    `/manufacturing/production-orders/${open.productionOrderId}` as never
                  }
                >
                  {t('Open order')} {open.orderNumber}
                  <ArrowRight className='ml-1.5 h-3.5 w-3.5' />
                </Link>
              </Button>
            </div>
          }
        >
          <dl className='grid grid-cols-2 gap-4'>
            <Field label={t('Date')}>{fmtDate(open.issueDate)}</Field>
            <Field label={t('Order')}>{open.orderNumber}</Field>
            <Field label={t('Value')}>{formatMoney(open.totalCost)}</Field>
            <Field label={t('Recorded by')}>
              {refName(open.createdBy) || '—'}
            </Field>
          </dl>
          <SheetSection title={t('Lines')}>
            <ul className='divide-y rounded-lg border'>
              {open.lines.map((l, i) => (
                <li
                  key={`${l.materialLineId}-${i}`}
                  className='space-y-1 px-3 py-2.5 text-sm'
                >
                  <div className='flex items-start justify-between gap-3'>
                    <span className='font-medium'>
                      {l.productName}
                      {l.isAlternative && (
                        <span className='text-muted-foreground ml-1.5 text-xs font-normal'>
                          ({t('alternative')})
                        </span>
                      )}
                    </span>
                    <span className='shrink-0 tabular-nums'>
                      {fmtQty(l.quantity)} {l.unit}
                    </span>
                  </div>
                  <div className='text-muted-foreground flex flex-wrap justify-between gap-x-3 text-xs tabular-nums'>
                    <span>
                      {l.batchNumber && (
                        <>
                          {t('Batch')} {l.batchNumber} ·{' '}
                        </>
                      )}
                      {formatMoney(l.unitCost)} / {l.unit}
                    </span>
                    <span>{formatMoney(l.totalCost)}</span>
                  </div>
                  {!!l.serialNumbers?.length && (
                    <div className='text-muted-foreground font-mono text-[11px]'>
                      {l.serialNumbers.join(', ')}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </SheetSection>
          {open.notes && (
            <SheetSection title={t('Notes')}>
              <p className='text-sm whitespace-pre-wrap'>{open.notes}</p>
            </SheetSection>
          )}
        </DetailSheet>
      )}
    </div>
  )
}
