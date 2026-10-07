import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ClipboardCheck } from 'lucide-react'
import {
  useGetOutputsQuery,
  useGetProductionOrderQuery,
  type ProductionOutput,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { InspectOutputDialog } from '../components/execution-dialogs'
import { EmptyState, SectionHeader } from '../components/manufacturing-shell'
import { Pager } from '../components/pager'
import { fmtDate, fmtQty, refName } from '../lib/constants'

/** Quality check queue: reported output waiting for inspection, and the inspection history. */
export default function QualityPage() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { hasPermission } = usePermissions()
  const canInspect = hasPermission('inspectProduction')
  const [view, setView] = useState<'pending_qc' | 'inspected'>('pending_qc')
  const [page, setPage] = useState(1)
  const [inspecting, setInspecting] = useState<ProductionOutput | null>(null)
  const { data, isLoading } = useGetOutputsQuery({
    status: view,
    page,
    limit: 20,
  })
  const rows = data?.results || []

  return (
    <div className='space-y-4'>
      <SectionHeader
        title={t('Quality check')}
        description={t(
          'Output reported from the floor waits here. Passing units go to finished stock; rejected units go to scrap or rework.'
        )}
      />
      <div className='inline-flex rounded-lg border p-0.5'>
        {(
          [
            ['pending_qc', t('Waiting for inspection')],
            ['inspected', t('Inspected')],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type='button'
            onClick={() => {
              setView(key)
              setPage(1)
            }}
            className={cn(
              'rounded-md px-3 py-1 text-xs',
              view === key
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <Card>
        <CardContent className='space-y-3 p-0'>
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  <TableHead>{t('Output')}</TableHead>
                  <TableHead>{t('Product')}</TableHead>
                  <TableHead>{t('Order')}</TableHead>
                  <TableHead className='text-right'>{t('Produced')}</TableHead>
                  <TableHead className='text-right'>{t('Good')}</TableHead>
                  <TableHead className='text-right'>{t('Rejected')}</TableHead>
                  <TableHead className='text-right'>{t('Value')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Skeleton className='h-16 w-full' />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <EmptyState
                        icon={ClipboardCheck}
                        title={
                          view === 'pending_qc'
                            ? t('Nothing waiting for inspection')
                            : t('No inspections yet')
                        }
                      />
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <div className='font-mono text-xs font-medium'>
                        {o.outputNumber}
                      </div>
                      <div className='text-muted-foreground text-xs'>
                        {fmtDate(o.reportedAt)} · {refName(o.reportedBy) || '—'}
                      </div>
                    </TableCell>
                    <TableCell className='font-medium'>
                      {o.productName}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={
                          `/manufacturing/production-orders/${o.productionOrderId}` as never
                        }
                        className='text-primary font-mono text-xs hover:underline'
                      >
                        {o.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {fmtQty(o.producedQuantity)}{' '}
                      <span className='text-muted-foreground text-xs'>
                        {o.unit}
                      </span>
                    </TableCell>
                    <TableCell className='text-right text-emerald-600 tabular-nums dark:text-emerald-400'>
                      {o.status === 'inspected' ? fmtQty(o.goodQuantity) : '—'}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {o.status === 'inspected'
                        ? `${fmtQty(o.rejectedQuantity)}${o.rejectDisposition ? ` → ${t(o.rejectDisposition)}` : ''}`
                        : '—'}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatMoney(o.materialCost)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {o.status === 'pending_qc' && canInspect && (
                        <Button
                          size='sm'
                          className='h-7'
                          onClick={() => setInspecting(o)}
                        >
                          {t('Inspect')}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className='px-3 pb-3'>
            <Pager data={data} page={page} onPageChange={setPage} />
          </div>
        </CardContent>
      </Card>
      {inspecting && (
        <InspectFromQueue
          output={inspecting}
          onClose={() => setInspecting(null)}
        />
      )}
    </div>
  )
}

/** The inspection dialog needs the order (for finished-goods tracking inputs). */
function InspectFromQueue({
  output,
  onClose,
}: {
  output: ProductionOutput
  onClose: () => void
}) {
  const { data: order } = useGetProductionOrderQuery(output.productionOrderId)
  if (!order) return null
  return <InspectOutputDialog order={order} output={output} onClose={onClose} />
}
