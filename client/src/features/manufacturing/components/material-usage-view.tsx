import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, PackageMinus, Recycle, Undo2, X } from 'lucide-react'
import {
  useGetMaterialUsageQuery,
  type MaterialUsageLine,
  type MaterialUsageMaterial,
  type MaterialUsageOrder,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DateRangeFilter } from '@/components/filters/date-range-filter'
import { fmtDate, fmtQty, orderPath } from '../lib/constants'
import { StatusBadge } from './badges'
import { DataTable, type Column } from './data-table'
import { DetailSheet, SheetSection } from './detail-sheet'
import { FilterChips, SearchField, Toolbar } from './list-controls'
import { EmptyState, Stat, StatGrid } from './page'

/*
 * Material usage — where every issued unit went:
 *   issued = used in output + returned to store + still in the factory (WIP) + wastage
 * Server: services/manufacturing/materialUsage.service.js.
 *
 * Bar colours (categorical, fixed order, validated light + dark with the dataviz
 * validator: emerald / sky / amber / rose 600): used → returned → in factory → wastage.
 */
const PARTS = [
  {
    key: 'used',
    valueKey: 'usedValue',
    label: 'Used in production',
    color: '#059669',
  },
  {
    key: 'returned',
    valueKey: 'returnedValue',
    label: 'Returned to store',
    color: '#0284c7',
  },
  {
    key: 'inFactory',
    valueKey: 'inFactoryValue',
    label: 'In factory (WIP)',
    color: '#d97706',
  },
  {
    key: 'wastage',
    valueKey: 'wastageValue',
    label: 'Wastage',
    color: '#e11d48',
  },
] as const

type ValueTotals = Record<(typeof PARTS)[number]['valueKey'], number> & {
  issuedValue: number
}

const pct = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0

/** One stacked bar: the issued value split into where it went, with its legend. */
function UsageBar({ totals, title }: { totals: ValueTotals; title: string }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const whole = totals.issuedValue
  const parts = PARTS.map((p) => ({ ...p, value: totals[p.valueKey] || 0 }))
  return (
    <figure className='bg-card space-y-3 rounded-xl border p-4'>
      <figcaption className='flex flex-wrap items-baseline justify-between gap-2'>
        <span className='text-sm font-semibold'>{title}</span>
        <span className='text-muted-foreground text-xs'>
          {t('of')} {formatMoney(whole)} {t('issued, at cost')}
        </span>
      </figcaption>
      <div
        className='bg-muted flex h-3 w-full gap-[2px] overflow-hidden rounded-full'
        role='img'
        aria-label={parts
          .map((p) => `${t(p.label)} ${pct(p.value, whole)}%`)
          .join(', ')}
      >
        {whole > 0 &&
          parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <Tooltip key={p.key}>
                <TooltipTrigger asChild>
                  <div
                    className='h-full min-w-[3px] transition-opacity first:rounded-l-full last:rounded-r-full hover:opacity-80'
                    style={{
                      width: `${pct(p.value, whole)}%`,
                      backgroundColor: p.color,
                    }}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {t(p.label)}: {formatMoney(p.value)} ({pct(p.value, whole)}%)
                </TooltipContent>
              </Tooltip>
            ))}
      </div>
      <ul className='grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4'>
        {parts.map((p) => (
          <li key={p.key} className='flex min-w-0 items-start gap-2'>
            <span
              className='mt-0.5 h-2.5 w-2.5 shrink-0 rounded-sm'
              style={{ backgroundColor: p.color }}
              aria-hidden
            />
            <span className='min-w-0'>
              <span className='text-muted-foreground block truncate'>
                {t(p.label)}
              </span>
              <span className='text-foreground font-semibold tabular-nums'>
                {pct(p.value, whole)}%
              </span>{' '}
              <span className='text-muted-foreground tabular-nums'>
                {formatMoney(p.value)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  )
}

/** Quantity with unit; muted dash for zero. */
function Qty({
  value,
  unit,
  tone,
  stacked,
}: {
  value: number
  unit?: string
  tone?: 'danger' | 'warn'
  /** Unit on its own line (narrow phone cells). */
  stacked?: boolean
}) {
  if (!value) return <span className='text-muted-foreground'>—</span>
  return (
    <span
      className={cn(
        'tabular-nums',
        tone === 'danger' && 'font-medium text-rose-600 dark:text-rose-400',
        tone === 'warn' && 'font-medium text-amber-600 dark:text-amber-400'
      )}
    >
      {fmtQty(value)}
      {unit && (
        <span
          className={cn(
            'text-muted-foreground text-[11px] font-normal',
            stacked ? 'block truncate' : 'ml-1'
          )}
        >
          {getUnitLabel(unit)}
        </span>
      )}
    </span>
  )
}

/** (used + wastage) − what the BOM allows for the good output. */
function Variance({ value, unit }: { value: number; unit: string }) {
  if (Math.abs(value) < 1e-6)
    return <span className='text-muted-foreground tabular-nums'>0</span>
  return (
    <span
      className={cn(
        'font-medium tabular-nums',
        value > 0
          ? 'text-rose-600 dark:text-rose-400'
          : 'text-emerald-600 dark:text-emerald-400'
      )}
    >
      {value > 0 ? '+' : '−'}
      {fmtQty(Math.abs(value))}
      <span className='text-muted-foreground ml-1 text-[11px] font-normal'>
        {getUnitLabel(unit)}
      </span>
    </span>
  )
}

const qtyColumns = <T extends MaterialUsageLine | MaterialUsageMaterial>(
  t: (s: string) => string
): Column<T>[] => [
  {
    id: 'issued',
    header: t('Issued'),
    align: 'right',
    cell: (r) => <Qty value={r.issued} unit={r.unit} />,
  },
  {
    id: 'used',
    header: t('Used'),
    align: 'right',
    cell: (r) => <Qty value={r.used} unit={r.unit} />,
  },
  {
    id: 'returned',
    header: t('Returned'),
    align: 'right',
    hideBelow: 'lg',
    cell: (r) => <Qty value={r.returned} unit={r.unit} />,
  },
  {
    id: 'wastage',
    header: t('Wastage'),
    align: 'right',
    cell: (r) => <Qty value={r.wastage} unit={r.unit} tone='danger' />,
  },
  {
    id: 'inFactory',
    header: t('In factory'),
    align: 'right',
    cell: (r) => <Qty value={r.inFactory} unit={r.unit} tone='warn' />,
  },
  {
    id: 'variance',
    header: t('Variance'),
    align: 'right',
    hideBelow: 'xl',
    cell: (r) => <Variance value={r.variance} unit={r.unit} />,
  },
]

export function MaterialUsageView({
  orderId,
  onClearOrder,
}: {
  /** Narrow to one production order (from "Material usage of this order"). */
  orderId?: string
  onClearOrder?: () => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [status, setStatus] = useState<'all' | 'open' | 'completed'>('all')
  const [by, setBy] = useState<'material' | 'order'>(
    orderId ? 'order' : 'material'
  )
  const [range, setRange] = useState<{ startDate?: string; endDate?: string }>(
    {}
  )
  const [openOrder, setOpenOrder] = useState<MaterialUsageOrder | null>(null)
  const { data, isLoading, isFetching } = useGetMaterialUsageQuery({
    status,
    search: debounced || undefined,
    dateFrom: range.startDate,
    dateTo: range.endDate,
    productionOrderId: orderId,
  })
  const filtered =
    !!debounced || status !== 'all' || !!range.startDate || !!orderId
  const totals = data?.totals

  const materialColumns = useMemo<Column<MaterialUsageMaterial>[]>(
    () => [
      {
        id: 'material',
        header: t('Material'),
        cell: (m) => (
          <div className='min-w-0'>
            <div className='truncate font-medium'>{m.productName}</div>
            <div className='text-muted-foreground truncate text-xs'>
              {[m.sku, `${m.orderCount} ${t('order(s)')}`]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
        ),
      },
      ...qtyColumns<MaterialUsageMaterial>(t),
      {
        id: 'value',
        header: t('Issued value'),
        money: true,
        align: 'right',
        hideBelow: 'md',
        cell: (m) => (
          <span className='tabular-nums'>{formatMoney(m.issuedValue)}</span>
        ),
      },
    ],
    [t, formatMoney]
  )

  const orderColumns = useMemo<Column<MaterialUsageOrder>[]>(
    () => [
      {
        id: 'order',
        header: t('Order'),
        cell: (o) => (
          <div className='min-w-0'>
            <div className='flex items-center gap-1.5'>
              <span className='font-mono text-xs font-medium'>
                {o.orderNumber}
              </span>
              <StatusBadge status={o.status} orderType={o.orderType} />
            </div>
            <div className='truncate text-sm'>{o.productName}</div>
          </div>
        ),
      },
      {
        id: 'output',
        header: t('Good / planned'),
        align: 'right',
        hideBelow: 'md',
        cell: (o) => (
          <span className='tabular-nums'>
            {fmtQty(o.goodQuantity)} / {fmtQty(o.plannedQuantity)}{' '}
            <span className='text-muted-foreground text-[11px]'>
              {getUnitLabel(o.unit)}
            </span>
            {o.rejectedQuantity > 0 && (
              <span className='block text-[11px] text-rose-600 dark:text-rose-400'>
                {fmtQty(o.rejectedQuantity)} {t('rejected')}
              </span>
            )}
          </span>
        ),
      },
      {
        id: 'issued',
        header: t('Issued'),
        align: 'right',
        cell: (o) => (
          <span className='tabular-nums'>{formatMoney(o.issuedValue)}</span>
        ),
      },
      {
        id: 'split',
        header: t('Where it went'),
        hideBelow: 'lg',
        className: 'w-56',
        cell: (o) => <MiniSplit order={o} />,
      },
      {
        id: 'wastage',
        header: t('Wastage'),
        align: 'right',
        cell: (o) =>
          o.wastageValue > 0 ? (
            <span className='font-medium text-rose-600 tabular-nums dark:text-rose-400'>
              {formatMoney(o.wastageValue)}
            </span>
          ) : (
            <span className='text-muted-foreground'>—</span>
          ),
      },
      {
        id: 'inFactory',
        header: t('In factory'),
        align: 'right',
        cell: (o) =>
          o.inFactoryValue > 0 ? (
            <span className='font-medium text-amber-600 tabular-nums dark:text-amber-400'>
              {formatMoney(o.inFactoryValue)}
            </span>
          ) : (
            <span className='text-muted-foreground'>—</span>
          ),
      },
    ],
    [t, formatMoney]
  )

  return (
    <div className='space-y-5'>
      {orderId && (
        <div className='flex flex-wrap items-center gap-2 text-sm'>
          <Badge variant='secondary' className='h-7 gap-1.5 px-2.5 font-normal'>
            {t('Order')}{' '}
            <span className='font-mono font-medium'>
              {data?.orders[0]?.orderNumber || '…'}
            </span>
            {onClearOrder && (
              <button
                type='button'
                onClick={onClearOrder}
                aria-label={t('Show all orders')}
                className='hover:text-foreground text-muted-foreground -mr-1 rounded p-0.5'
              >
                <X className='h-3.5 w-3.5' />
              </button>
            )}
          </Badge>
        </div>
      )}

      <StatGrid className='lg:grid-cols-5'>
        <Stat
          label={t('Material issued')}
          value={totals ? formatMoney(totals.issuedValue) : '…'}
          hint={
            totals
              ? `${totals.orderCount} ${t('production order(s)')}`
              : undefined
          }
        />
        <Stat
          label={t('Used in production')}
          value={totals ? formatMoney(totals.usedValue) : '…'}
          hint={
            totals
              ? `${pct(totals.usedValue, totals.issuedValue)}% ${t('of issued')}`
              : undefined
          }
        />
        <Stat
          label={t('Returned to store')}
          value={totals ? formatMoney(totals.returnedValue) : '…'}
          hint={
            totals
              ? `${pct(totals.returnedValue, totals.issuedValue)}% ${t('of issued')}`
              : undefined
          }
        />
        <Stat
          label={t('In factory (WIP)')}
          value={totals ? formatMoney(totals.inFactoryValue) : '…'}
          tone='warning'
          active={(totals?.inFactoryValue ?? 0) > 0}
          hint={
            totals
              ? `${pct(totals.inFactoryValue, totals.issuedValue)}% ${t('of issued')}`
              : undefined
          }
        />
        <Stat
          label={t('Wastage')}
          value={totals ? formatMoney(totals.wastageValue) : '…'}
          tone='danger'
          active={(totals?.wastageValue ?? 0) > 0}
          hint={
            totals
              ? `${pct(totals.wastageValue, totals.issuedValue)}% ${t('of issued')}`
              : undefined
          }
        />
      </StatGrid>

      {totals && totals.issuedValue > 0 && (
        <UsageBar totals={totals} title={t('Where the issued material went')} />
      )}

      <Toolbar
        end={
          <DateRangeFilter
            startDate={range.startDate}
            endDate={range.endDate}
            onChange={setRange}
          />
        }
      >
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={t('Search order, product or material')}
        />
        <FilterChips
          label={t('Show by')}
          value={by}
          onChange={(v) => setBy(v as typeof by)}
          options={[
            { value: 'material', label: t('By material') },
            { value: 'order', label: t('By order') },
          ]}
        />
        <FilterChips
          label={t('Filter by order status')}
          value={status}
          onChange={(v) => setStatus(v as typeof status)}
          options={[
            { value: 'all', label: t('All orders') },
            { value: 'open', label: t('Open') },
            { value: 'completed', label: t('Completed') },
          ]}
        />
      </Toolbar>

      {by === 'material' ? (
        <DataTable
          caption={t('Material usage by material')}
          columns={materialColumns}
          rows={data?.materials}
          rowKey={(m) => `${m.productId}:${m.variantId || ''}:${m.unit}`}
          loading={isLoading}
          fetching={isFetching}
          empty={<UsageEmpty filtered={filtered} />}
          mobileCard={(m) => (
            <div className='space-y-1.5'>
              <div className='flex items-start justify-between gap-3'>
                <span className='min-w-0 truncate font-medium'>
                  {m.productName}
                </span>
                <span className='shrink-0 text-sm tabular-nums'>
                  {formatMoney(m.issuedValue)}
                </span>
              </div>
              <MobileQtyGrid row={m} />
            </div>
          )}
        />
      ) : (
        <DataTable
          caption={t('Material usage by order')}
          columns={orderColumns}
          rows={data?.orders}
          rowKey={(o) => o.id}
          loading={isLoading}
          fetching={isFetching}
          onRowClick={setOpenOrder}
          empty={<UsageEmpty filtered={filtered} />}
          mobileCard={(o) => (
            <div className='space-y-1.5'>
              <div className='flex items-center justify-between gap-3'>
                <span className='flex items-center gap-1.5'>
                  <span className='font-mono text-xs font-medium'>
                    {o.orderNumber}
                  </span>
                  <StatusBadge status={o.status} orderType={o.orderType} />
                </span>
                <span className='text-sm tabular-nums'>
                  {formatMoney(o.issuedValue)}
                </span>
              </div>
              <div className='truncate text-sm'>{o.productName}</div>
              <MiniSplit order={o} />
            </div>
          )}
        />
      )}
      {data?.truncated && (
        <p className='text-muted-foreground text-xs'>
          {t(
            'Showing the latest 300 orders — narrow the dates or search to see older ones.'
          )}
        </p>
      )}

      {openOrder && (
        <DetailSheet
          open
          onOpenChange={(o) => !o && setOpenOrder(null)}
          className='sm:max-w-2xl'
          title={
            <span className='flex items-center gap-2'>
              <span className='font-mono'>{openOrder.orderNumber}</span>
              <span className='font-normal'>· {openOrder.productName}</span>
            </span>
          }
          description={`${t('Made')} ${fmtQty(openOrder.goodQuantity)} ${t('good')} + ${fmtQty(openOrder.rejectedQuantity)} ${t('rejected')} ${t('of')} ${fmtQty(openOrder.plannedQuantity)} ${getUnitLabel(openOrder.unit)} · ${t('started')} ${fmtDate(openOrder.createdAt)}`}
          badges={
            <StatusBadge
              status={openOrder.status}
              orderType={openOrder.orderType}
            />
          }
          footer={
            <div className='flex flex-wrap gap-2'>
              <Button asChild variant='outline' size='sm'>
                <Link
                  to={orderPath(openOrder) as never}
                  search={{ tab: 'wip' } as never}
                >
                  <Undo2 className='mr-1.5 h-3.5 w-3.5' />
                  {t('Return unused')}
                </Link>
              </Button>
              <Button asChild variant='outline' size='sm'>
                <Link
                  to={orderPath(openOrder) as never}
                  search={{ tab: 'scrap' } as never}
                >
                  <Recycle className='mr-1.5 h-3.5 w-3.5' />
                  {t('Record wastage')}
                </Link>
              </Button>
              <Button asChild size='sm'>
                <Link to={orderPath(openOrder) as never}>
                  {t('Open order')}
                  <ArrowRight className='ml-1.5 h-3.5 w-3.5' />
                </Link>
              </Button>
            </div>
          }
        >
          <UsageBar
            totals={openOrder}
            title={t('Where this order’s material went')}
          />
          <SheetSection title={t('Materials')}>
            <ul className='divide-y rounded-lg border'>
              {openOrder.lines.map((l) => (
                <li key={l.materialLineId} className='space-y-1.5 px-3 py-2.5'>
                  <div className='flex items-start justify-between gap-3 text-sm'>
                    <span className='min-w-0 font-medium'>{l.productName}</span>
                    <span className='shrink-0 tabular-nums'>
                      {t('Issued')} <Qty value={l.issued} unit={l.unit} />
                    </span>
                  </div>
                  <MobileQtyGrid row={l} />
                  <div className='text-muted-foreground flex flex-wrap justify-between gap-x-3 text-[11px]'>
                    <span>
                      {t('BOM allows for the good output')}:{' '}
                      {fmtQty(l.standard)} {getUnitLabel(l.unit)}
                    </span>
                    <span>
                      {t('Variance')}{' '}
                      <Variance value={l.variance} unit={l.unit} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </SheetSection>
        </DetailSheet>
      )}
    </div>
  )
}

/** Used / returned / wastage / in factory in four small cells. */
function MobileQtyGrid({
  row,
}: {
  row: Pick<
    MaterialUsageLine,
    'used' | 'returned' | 'wastage' | 'inFactory' | 'unit'
  >
}) {
  const { t } = useLanguage()
  const cells: [string, number, 'danger' | 'warn' | undefined][] = [
    [t('Used'), row.used, undefined],
    [t('Returned'), row.returned, undefined],
    [t('Wastage'), row.wastage, 'danger'],
    [t('In factory'), row.inFactory, 'warn'],
  ]
  return (
    <dl className='grid grid-cols-4 gap-2 text-xs'>
      {cells.map(([label, value, tone]) => (
        <div key={label} className='min-w-0'>
          <dt className='text-muted-foreground truncate'>{label}</dt>
          <dd>
            <Qty value={value} unit={row.unit} tone={tone} stacked />
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** A thin version of the usage bar for a table row. */
function MiniSplit({ order }: { order: MaterialUsageOrder }) {
  const { t } = useLanguage()
  const whole = order.issuedValue
  return (
    <div
      className='bg-muted flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full'
      role='img'
      aria-label={PARTS.map(
        (p) => `${t(p.label)} ${pct(order[p.valueKey], whole)}%`
      ).join(', ')}
      title={PARTS.map(
        (p) => `${t(p.label)} ${pct(order[p.valueKey], whole)}%`
      ).join(' · ')}
    >
      {whole > 0 &&
        PARTS.filter((p) => order[p.valueKey] > 0).map((p) => (
          <div
            key={p.key}
            className='h-full min-w-[2px]'
            style={{
              width: `${pct(order[p.valueKey], whole)}%`,
              backgroundColor: p.color,
            }}
          />
        ))}
    </div>
  )
}

function UsageEmpty({ filtered }: { filtered: boolean }) {
  const { t } = useLanguage()
  return (
    <EmptyState
      bordered={false}
      icon={PackageMinus}
      title={
        filtered
          ? t('Nothing matches these filters')
          : t('No material issued yet')
      }
      description={
        filtered
          ? t('Try another status, date range or search.')
          : t(
              'Issue materials with a New Issue Voucher — what is used, returned, wasted and still in the factory shows here.'
            )
      }
    />
  )
}
