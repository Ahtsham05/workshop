import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { AlertTriangle, ClipboardList, Plus } from 'lucide-react'
import {
  useGetProductionOrdersQuery,
  type ProductionStatus,
} from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PriorityText, ProgressBar, StatusBadge } from '../components/badges'
import { EmptyState, SectionHeader } from '../components/manufacturing-shell'
import { Pager } from '../components/pager'
import { ProductionOrderDialog } from '../components/production-order-dialog'
import {
  PRODUCTION_STATUSES,
  STATUS_META,
  fmtDate,
  fmtQty,
} from '../lib/constants'

const OPEN: ProductionStatus[] = [
  'draft',
  'planned',
  'released',
  'in_production',
  'paused',
]

export default function ProductionOrdersPage() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const routeSearch = useSearch({ strict: false }) as {
    status?: string
    new?: boolean
  }

  const [status, setStatus] = useState<string>(routeSearch.status || 'open')
  const [overdue, setOverdue] = useState(false)
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(!!routeSearch.new)

  useEffect(() => {
    if (routeSearch.status) setStatus(routeSearch.status)
  }, [routeSearch.status])

  const { data, isLoading, isFetching } = useGetProductionOrdersQuery({
    page,
    limit: 20,
    search: debounced || undefined,
    status:
      status === 'all'
        ? undefined
        : status === 'open'
          ? OPEN.join(',')
          : status,
    ...(overdue ? { overdue: true } : {}),
  })
  const rows = data?.results || []
  const now = Date.now()

  const tabs: { key: string; label: string }[] = [
    { key: 'open', label: t('Open') },
    ...PRODUCTION_STATUSES.map((s) => ({
      key: s,
      label: t(STATUS_META[s].label),
    })),
    { key: 'all', label: t('All') },
  ]

  return (
    <div className='space-y-4'>
      <SectionHeader
        title={t('Production orders')}
        description={t(
          'Plan, release and track every manufacturing run from draft to completion.'
        )}
        actions={
          hasPermission('manageProductionOrders') && (
            <Button onClick={() => setCreating(true)} className='max-sm:w-full'>
              <Plus className='mr-2 h-4 w-4' />
              {t('New order')}
            </Button>
          )
        }
      />

      <Card>
        <CardContent className='space-y-3 p-4 max-sm:p-3'>
          <div className='-mx-1 flex gap-1 overflow-x-auto px-1 pb-1'>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type='button'
                onClick={() => {
                  setStatus(tab.key)
                  setPage(1)
                }}
                className={cn(
                  'shrink-0 rounded-md px-3 py-1 text-xs transition-colors',
                  status === tab.key
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              placeholder={t('Search order, product or BOM…')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className='h-9 w-72 max-sm:w-full'
            />
            <Button
              variant={overdue ? 'default' : 'outline'}
              size='sm'
              onClick={() => {
                setOverdue(!overdue)
                setPage(1)
              }}
            >
              <AlertTriangle className='mr-1.5 h-3.5 w-3.5' />
              {t('Overdue only')}
            </Button>
          </div>

          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  <TableHead>{t('Order')}</TableHead>
                  <TableHead>{t('Product')}</TableHead>
                  <TableHead className='w-44'>{t('Progress')}</TableHead>
                  <TableHead>{t('Schedule')}</TableHead>
                  <TableHead>{t('Priority')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={6}>
                        <Skeleton className='h-6 w-full' />
                      </TableCell>
                    </TableRow>
                  ))}
                {!isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6}>
                      <EmptyState
                        icon={ClipboardList}
                        title={t('No production orders')}
                        description={t('Nothing matches these filters.')}
                      />
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((order) => {
                  const isLate =
                    !!order.plannedCompletionDate &&
                    OPEN.includes(order.status) &&
                    new Date(order.plannedCompletionDate).getTime() < now
                  return (
                    <TableRow
                      key={order.id}
                      className={cn(
                        'cursor-pointer',
                        isFetching && 'opacity-70'
                      )}
                      onClick={() =>
                        navigate({
                          to: `/manufacturing/production-orders/${order.id}` as never,
                        })
                      }
                    >
                      <TableCell>
                        <Link
                          to={
                            `/manufacturing/production-orders/${order.id}` as never
                          }
                          className='font-mono text-xs font-medium hover:underline'
                          onClick={(e) => e.stopPropagation()}
                        >
                          {order.orderNumber}
                        </Link>
                        {order.bomNumber && (
                          <div className='text-muted-foreground text-[11px]'>
                            {order.bomNumber} v{order.bomVersion}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className='font-medium'>
                        {order.productName}
                      </TableCell>
                      <TableCell>
                        <div className='text-muted-foreground mb-1 flex justify-between text-xs tabular-nums'>
                          <span>
                            {fmtQty(order.completedQuantity)} /{' '}
                            {fmtQty(order.plannedQuantity)} {order.unit}
                          </span>
                          <span>
                            {Math.round(
                              (order.completedQuantity /
                                order.plannedQuantity) *
                                100
                            )}
                            %
                          </span>
                        </div>
                        <ProgressBar
                          value={
                            (order.completedQuantity / order.plannedQuantity) *
                            100
                          }
                          tone='emerald'
                        />
                      </TableCell>
                      <TableCell className='text-sm'>
                        <div className='text-muted-foreground'>
                          {fmtDate(order.plannedStartDate)}
                        </div>
                        <div
                          className={cn(
                            isLate &&
                              'font-medium text-rose-600 dark:text-rose-400'
                          )}
                        >
                          → {fmtDate(order.plannedCompletionDate)}
                          {isLate && (
                            <AlertTriangle className='ml-1 inline h-3 w-3' />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <PriorityText priority={order.priority} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={order.status} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <Pager data={data} page={page} onPageChange={setPage} />
        </CardContent>
      </Card>

      {creating && (
        <ProductionOrderDialog
          onClose={() => setCreating(false)}
          onSaved={(order) =>
            navigate({
              to: `/manufacturing/production-orders/${order.id}` as never,
            })
          }
        />
      )}
    </div>
  )
}
