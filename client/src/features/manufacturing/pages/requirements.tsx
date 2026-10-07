import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronRight, ListChecks } from 'lucide-react'
import {
  useGetRequirementsQuery,
  type RequirementLine,
} from '@/stores/manufacturing.api'
import { useLanguage } from '@/context/language-context'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '../components/badges'
import { CellStack, DataTable, type Column } from '../components/data-table'
import { DetailSheet, SheetSection } from '../components/detail-sheet'
import { FilterChips, SearchField, Toolbar } from '../components/list-controls'
import {
  EmptyState,
  Field,
  PageHeader,
  Stat,
  StatGrid,
} from '../components/page'
import { fmtQty } from '../lib/constants'

const lineKey = (l: RequirementLine) =>
  `${l.branchId}:${l.productId}:${l.variantId || ''}`

function Shortage({ line }: { line: RequirementLine }) {
  const { t } = useLanguage()
  return line.shortageQuantity > 0 ? (
    <span className='font-medium text-rose-600 tabular-nums dark:text-rose-400'>
      −{fmtQty(line.shortageQuantity)}
    </span>
  ) : (
    <span className='text-emerald-600 dark:text-emerald-400'>
      {t('Covered')}
    </span>
  )
}

/** Outstanding material needs of all open orders vs on-hand stock (no MRP netting yet). */
export default function RequirementsPage() {
  const { t } = useLanguage()
  const [view, setView] = useState<'all' | 'short'>('all')
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState<RequirementLine | null>(null)
  const { data, isLoading } = useGetRequirementsQuery()

  const needle = search.trim().toLowerCase()
  const lines = (data?.lines || []).filter(
    (l) =>
      (view === 'all' || l.shortageQuantity > 0) &&
      (!needle ||
        l.productName.toLowerCase().includes(needle) ||
        (l.sku || '').toLowerCase().includes(needle))
  )

  const columns: Column<RequirementLine>[] = [
    {
      id: 'material',
      header: t('Material'),
      cell: (l) => <CellStack primary={l.productName} secondary={l.sku} />,
    },
    {
      id: 'need',
      header: t('Outstanding need'),
      align: 'right',
      cell: (l) => (
        <span className='tabular-nums'>
          {fmtQty(l.requiredQuantity)}{' '}
          <span className='text-muted-foreground text-xs'>{l.unit}</span>
        </span>
      ),
    },
    {
      id: 'onhand',
      header: t('On hand'),
      align: 'right',
      hideBelow: 'md',
      cell: (l) => (
        <span className='text-muted-foreground tabular-nums'>
          {fmtQty(l.availableQuantity)}
        </span>
      ),
    },
    {
      id: 'short',
      header: t('Shortage'),
      align: 'right',
      cell: (l) => <Shortage line={l} />,
    },
    {
      id: 'orders',
      header: t('Orders'),
      align: 'right',
      hideBelow: 'lg',
      cell: (l) => (
        <span className='text-muted-foreground inline-flex items-center gap-1 tabular-nums'>
          {l.orders?.length ?? 0}
          <ChevronRight className='h-3.5 w-3.5' aria-hidden />
        </span>
      ),
    },
  ]

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Material requirements')}
        description={t(
          'What every planned, released and running order still needs, against what is on the shelf right now.'
        )}
      />

      {isLoading ? (
        <Skeleton className='h-[88px] w-full rounded-xl' />
      ) : (
        <StatGrid className='grid-cols-3'>
          <Stat label={t('Open orders')} value={data?.orderCount ?? 0} />
          <Stat
            label={t('Materials needed')}
            value={data?.materialCount ?? 0}
          />
          <Stat
            label={t('Short')}
            value={data?.shortageCount ?? 0}
            tone='danger'
            active={(data?.shortageCount ?? 0) > 0}
          />
        </StatGrid>
      )}

      <Toolbar>
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder={t('Filter by material or SKU')}
        />
        <FilterChips
          label={t('Filter requirements')}
          value={view}
          onChange={(v) => setView(v as typeof view)}
          options={[
            {
              value: 'all',
              label: t('All materials'),
              count: data?.materialCount,
            },
            {
              value: 'short',
              label: t('Shortages'),
              count: data?.shortageCount,
              tone: 'danger',
            },
          ]}
        />
      </Toolbar>

      <DataTable
        caption={t('Material requirements')}
        columns={columns}
        rows={lines}
        rowKey={lineKey}
        loading={isLoading}
        onRowClick={setOpen}
        empty={
          <EmptyState
            bordered={false}
            icon={ListChecks}
            title={
              needle || view === 'short'
                ? t('Nothing matches')
                : t('Nothing outstanding')
            }
            description={
              needle || view === 'short'
                ? t('No material matches these filters.')
                : t('Open orders have everything they need issued or in stock.')
            }
          />
        }
        mobileCard={(l) => (
          <div className='flex items-start justify-between gap-3'>
            <div className='min-w-0'>
              <div className='truncate font-medium'>{l.productName}</div>
              <div className='text-muted-foreground text-xs tabular-nums'>
                {t('Need')} {fmtQty(l.requiredQuantity)} · {t('Have')}{' '}
                {fmtQty(l.availableQuantity)} {l.unit}
              </div>
            </div>
            <Shortage line={l} />
          </div>
        )}
      />

      {open && (
        <DetailSheet
          open
          onOpenChange={(o) => !o && setOpen(null)}
          title={open.productName}
          description={open.sku || undefined}
        >
          <dl className='grid grid-cols-3 gap-4'>
            <Field label={t('Outstanding need')}>
              {fmtQty(open.requiredQuantity)} {open.unit}
            </Field>
            <Field label={t('On hand')}>
              {fmtQty(open.availableQuantity)} {open.unit}
            </Field>
            <Field label={t('Shortage')}>
              <Shortage line={open} />
            </Field>
          </dl>
          <SheetSection title={t('Needed by')}>
            <ul className='divide-y rounded-lg border'>
              {(open.orders || []).map((o) => (
                <li key={o.orderId}>
                  <Link
                    to={
                      `/manufacturing/production-orders/${o.orderId}` as never
                    }
                    className='hover:bg-muted/40 flex min-h-12 items-center gap-3 px-3 py-2 text-sm'
                  >
                    <span className='font-mono text-xs'>{o.orderNumber}</span>
                    <StatusBadge
                      status={o.status}
                      className='h-5 px-1.5 text-[10px]'
                    />
                    <span className='ml-auto tabular-nums'>
                      {fmtQty(o.quantity)} {open.unit}
                    </span>
                    <ChevronRight className='text-muted-foreground h-4 w-4' />
                  </Link>
                </li>
              ))}
            </ul>
          </SheetSection>
        </DetailSheet>
      )}
    </div>
  )
}
