import { useState } from 'react'
import { ChevronLeft, ChevronRight, FileSpreadsheet, FileText, History as HistoryIcon, Image as ImageIcon, MessageCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useLanguage } from '@/context/language-context'
import { formatBusinessDateTime } from '@/lib/business-timezone'
import { useGetPriceUpdateBatchesQuery, type SourceType } from '@/stores/priceUpdate.api'

import { userName } from '../lib/format'
import { StatusBadge } from './status-badge'

const SOURCE_ICON: Record<SourceType, typeof FileText> = {
  text: MessageCircle,
  whatsapp: MessageCircle,
  pdf: FileText,
  excel: FileSpreadsheet,
  image: ImageIcon,
  manual: FileText,
}

const SOURCE_LABEL: Record<SourceType, string> = {
  text: 'Pasted text',
  whatsapp: 'WhatsApp message',
  pdf: 'PDF',
  excel: 'Excel / CSV',
  image: 'Photo',
  manual: 'Manual',
}

const PAGE_SIZE = 20

export function HistoryTab({ onOpen }: { onOpen: (batchId: string) => void }) {
  const { t } = useLanguage()
  const [page, setPage] = useState(1)
  const { data, isLoading, isFetching } = useGetPriceUpdateBatchesQuery({ page, limit: PAGE_SIZE })

  if (isLoading) {
    return (
      <div className='space-y-2'>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className='h-16 w-full' />
        ))}
      </div>
    )
  }

  const batches = data?.results || []
  if (!batches.length) {
    return (
      <Card className='border-dashed'>
        <div className='flex flex-col items-center gap-2 px-4 py-14 text-center'>
          <HistoryIcon className='h-10 w-10 text-muted-foreground' />
          <p className='font-medium'>{t('No price updates yet')}</p>
          <p className='max-w-sm text-sm text-muted-foreground'>{t('Every update you apply is listed here with what changed — and can be undone.')}</p>
        </div>
      </Card>
    )
  }

  return (
    <div className='space-y-3'>
      <Card className='overflow-hidden'>
        <ul className='divide-y'>
          {batches.map((b) => {
            const Icon = SOURCE_ICON[b.source.type] || FileText
            const by = userName(b.appliedBy)
            return (
              <li key={b.id}>
                <button
                  type='button'
                  onClick={() => onOpen(b.id)}
                  className='grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-muted/50 sm:grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1fr)_auto]'
                >
                  <span className='row-span-2 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary sm:row-span-1'>
                    <Icon className='h-5 w-5' />
                  </span>
                  <span className='min-w-0'>
                    <span className='block truncate text-sm font-semibold'>
                      #{b.batchNumber} · {b.source.supplierName || t(SOURCE_LABEL[b.source.type] || 'Price update')}
                    </span>
                    <span className='block truncate text-xs text-muted-foreground'>
                      {formatBusinessDateTime(b.appliedAt || b.createdAt)}
                      {by ? ` · ${by}` : ''}
                      {b.source.fileName ? ` · ${b.source.fileName}` : ''}
                    </span>
                  </span>
                  <span className='col-start-2 text-xs text-muted-foreground sm:col-start-auto'>
                    <b className='text-foreground'>{b.stats.applied}</b> {t('updated')}
                    {b.stats.applied > 0 && (
                      <span className='ml-2'>
                        {t('Cost')} {b.stats.avgCostChangePercent > 0 ? '+' : ''}
                        {b.stats.avgCostChangePercent}%
                      </span>
                    )}
                  </span>
                  <span className='col-start-2 justify-self-start sm:col-start-auto sm:justify-self-end'>
                    <StatusBadge status={b.status} />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Card>
      {(data?.totalPages || 1) > 1 && (
        <div className='flex items-center justify-between text-sm text-muted-foreground'>
          <span>
            {t('Page')} {page} / {data?.totalPages}
          </span>
          <div className='flex gap-2'>
            <Button variant='outline' size='sm' disabled={page <= 1 || isFetching} onClick={() => setPage(page - 1)}>
              <ChevronLeft className='h-4 w-4' />
            </Button>
            <Button variant='outline' size='sm' disabled={page >= (data?.totalPages || 1) || isFetching} onClick={() => setPage(page + 1)}>
              <ChevronRight className='h-4 w-4' />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
