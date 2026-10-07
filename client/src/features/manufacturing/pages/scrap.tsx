import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Plus, Recycle } from 'lucide-react'
import {
  useGetScrapRecordsQuery,
  type ScrapReason,
  type ScrapStage,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RecordScrapDialog } from '../components/execution-dialogs'
import { EmptyState, SectionHeader } from '../components/manufacturing-shell'
import { Pager } from '../components/pager'
import {
  SCRAP_REASON_LABELS,
  SCRAP_STAGE_LABELS,
  fmtDate,
  fmtQty,
} from '../lib/constants'

export default function ScrapPage() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { hasPermission } = usePermissions()
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [stage, setStage] = useState<string>('all')
  const [reason, setReason] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [recording, setRecording] = useState(false)
  const { data, isLoading } = useGetScrapRecordsQuery({
    page,
    limit: 20,
    search: debounced || undefined,
    ...(stage !== 'all' ? { stage: stage as ScrapStage } : {}),
    ...(reason !== 'all' ? { reason: reason as ScrapReason } : {}),
  })

  return (
    <div className='space-y-4'>
      <SectionHeader
        title={t('Scrap')}
        description={t(
          'Manufacturing losses by stage and reason. Material/WIP scrap is recorded against an order; finished-stock scrap also deducts stock.'
        )}
        actions={
          hasPermission('executeProduction') && (
            <Button
              variant='outline'
              onClick={() => setRecording(true)}
              className='max-sm:w-full'
            >
              <Plus className='mr-2 h-4 w-4' />
              {t('Write off finished stock')}
            </Button>
          )
        }
      />
      <Card>
        <CardContent className='space-y-3 p-4 max-sm:p-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              placeholder={t('Search scrap, order or product…')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className='h-9 w-64 max-sm:w-full'
            />
            <Select
              value={stage}
              onValueChange={(v) => {
                setStage(v)
                setPage(1)
              }}
            >
              <SelectTrigger className='h-9 w-44'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('All stages')}</SelectItem>
                {(Object.keys(SCRAP_STAGE_LABELS) as ScrapStage[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(SCRAP_STAGE_LABELS[s])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={reason}
              onValueChange={(v) => {
                setReason(v)
                setPage(1)
              }}
            >
              <SelectTrigger className='h-9 w-40'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('All reasons')}</SelectItem>
                {(Object.keys(SCRAP_REASON_LABELS) as ScrapReason[]).map(
                  (r) => (
                    <SelectItem key={r} value={r}>
                      {t(SCRAP_REASON_LABELS[r])}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>
          </div>
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  <TableHead>{t('Scrap')}</TableHead>
                  <TableHead>{t('Product')}</TableHead>
                  <TableHead>{t('Stage')}</TableHead>
                  <TableHead>{t('Reason')}</TableHead>
                  <TableHead>{t('Order')}</TableHead>
                  <TableHead className='text-right'>{t('Quantity')}</TableHead>
                  <TableHead className='text-right'>{t('Value')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <Skeleton className='h-16 w-full' />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && !data?.results.length && (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <EmptyState
                        icon={Recycle}
                        title={t('No scrap recorded')}
                        description={t(
                          'Record scrap from a production order, or write off finished stock here.'
                        )}
                      />
                    </TableCell>
                  </TableRow>
                )}
                {data?.results.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className='font-mono text-xs font-medium'>
                        {s.scrapNumber}
                      </div>
                      <div className='text-muted-foreground text-xs'>
                        {fmtDate(s.scrapDate)}
                      </div>
                    </TableCell>
                    <TableCell className='font-medium'>
                      {s.productName}
                    </TableCell>
                    <TableCell>
                      <span className='text-sm'>
                        {t(SCRAP_STAGE_LABELS[s.stage])}
                      </span>
                      {s.affectsStock && (
                        <Badge
                          variant='outline'
                          className='ml-1.5 text-[10px] font-normal'
                        >
                          {t('stock deducted')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm'>
                      {t(SCRAP_REASON_LABELS[s.reason])}
                    </TableCell>
                    <TableCell>
                      {s.productionOrderId ? (
                        <Link
                          to={
                            `/manufacturing/production-orders/${s.productionOrderId}` as never
                          }
                          className='text-primary font-mono text-xs hover:underline'
                        >
                          {s.orderNumber}
                        </Link>
                      ) : (
                        <span className='text-muted-foreground text-xs'>—</span>
                      )}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {fmtQty(s.quantity)}{' '}
                      <span className='text-muted-foreground text-xs'>
                        {s.unit}
                      </span>
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatMoney(s.totalCost)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager data={data} page={page} onPageChange={setPage} />
        </CardContent>
      </Card>
      {recording && <RecordScrapDialog onClose={() => setRecording(false)} />}
    </div>
  )
}
