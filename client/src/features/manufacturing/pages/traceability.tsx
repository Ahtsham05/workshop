import { useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  GitFork,
  Layers,
  ScanLine,
  Search,
  Factory,
} from 'lucide-react'
import {
  useTraceFinishedQuery,
  useTraceLookupQuery,
  useTraceOrderQuery,
  useTraceWhereUsedQuery,
  type TraceLookupHit,
} from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState, PageHeader, Panel } from '../components/page'
import { TraceTree, WhereUsedTree } from '../components/trace-views'

const KIND_ICON = { serial: ScanLine, batch: Layers, order: Factory } as const

/**
 * Traceability: search a serial number, batch number or order number, then read
 * forward (what it was made from, down to raw-material batches and suppliers) and
 * reverse (which assemblies, productions and finished products it went into).
 */
export default function TraceabilityPage() {
  const { t } = useLanguage()
  const routeSearch = useSearch({ strict: false }) as {
    kind?: TraceLookupHit['kind']
    id?: string
    label?: string
  }
  const [q, setQ] = useState(routeSearch.label || '')
  const debounced = useDebouncedValue(q.trim(), 250)
  const [selected, setSelected] = useState<Pick<
    TraceLookupHit,
    'kind' | 'id' | 'label'
  > | null>(
    routeSearch.kind && routeSearch.id
      ? {
          kind: routeSearch.kind,
          id: routeSearch.id,
          label: routeSearch.label || '',
        }
      : null
  )
  const { data: hits, isFetching } = useTraceLookupQuery(debounced, {
    skip: debounced.length < 2,
  })

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Traceability')}
        description={t(
          'Follow any finished unit back to its production and assembly orders, components, raw-material batches and suppliers — or any raw-material batch forward to the finished products that contain it.'
        )}
      />
      <div className='space-y-3'>
        <div className='relative max-w-2xl'>
          <Search
            className='text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2'
            aria-hidden
          />
          <Input
            type='search'
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('Serial / IMEI, batch number or order number')}
            aria-label={t('Serial / IMEI, batch number or order number')}
            className='h-11 pl-9 text-base'
            showVoiceInput={false}
            autoFocus
          />
        </div>
        {debounced.length >= 2 && (
          <div className='flex flex-wrap gap-2'>
            {isFetching && (
              <span className='text-muted-foreground text-xs'>
                {t('Searching…')}
              </span>
            )}
            {!isFetching && hits?.length === 0 && (
              <span className='text-muted-foreground text-xs'>
                {t('No matches')}
              </span>
            )}
            {hits?.map((hit) => {
              const Icon = KIND_ICON[hit.kind]
              const active = selected?.id === hit.id
              return (
                <button
                  key={`${hit.kind}:${hit.id}`}
                  type='button'
                  onClick={() => setSelected(hit)}
                  aria-pressed={active}
                  className={cn(
                    'focus-visible:ring-ring flex min-h-9 items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm transition-colors outline-none focus-visible:ring-2',
                    active
                      ? 'border-foreground bg-foreground text-background'
                      : 'hover:bg-muted'
                  )}
                >
                  <Icon className='h-3.5 w-3.5' />
                  <span className='font-mono'>{hit.label}</span>
                  <span
                    className={cn(
                      'text-xs',
                      active ? 'opacity-80' : 'text-muted-foreground'
                    )}
                  >
                    {hit.productName}
                  </span>
                  {hit.kind !== 'order' && (
                    <Badge
                      variant='outline'
                      className={cn(
                        'h-5 px-1.5 text-[10px]',
                        active && 'border-background/40 text-background'
                      )}
                    >
                      {hit.madeHere ? t('made here') : t('purchased')}
                    </Badge>
                  )}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {!selected ? (
        <EmptyState
          icon={GitFork}
          title={t('Pick something to trace')}
          description={t(
            'Try a finished product’s serial number, a raw-material batch number, or an order number like MO-00001.'
          )}
        />
      ) : (
        <TraceResult
          key={`${selected.kind}:${selected.id}`}
          subject={selected}
        />
      )}
    </div>
  )
}

function TraceResult({
  subject,
}: {
  subject: Pick<TraceLookupHit, 'kind' | 'id' | 'label'>
}) {
  const { t } = useLanguage()
  const finishedArgs =
    subject.kind === 'serial'
      ? { imeiId: subject.id }
      : subject.kind === 'batch'
        ? { batchId: subject.id }
        : undefined
  const forwardFinished = useTraceFinishedQuery(finishedArgs || {}, {
    skip: !finishedArgs,
  })
  const forwardOrder = useTraceOrderQuery(subject.id, {
    skip: subject.kind !== 'order',
  })
  const reverse = useTraceWhereUsedQuery(finishedArgs || {}, {
    skip: !finishedArgs,
  })

  const forwardTrace =
    subject.kind === 'order' ? forwardOrder.data : forwardFinished.data?.trace
  const forwardLoading =
    subject.kind === 'order'
      ? forwardOrder.isLoading
      : forwardFinished.isLoading

  return (
    <div className='grid gap-4 xl:grid-cols-2'>
      <Panel
        title={
          <span className='flex items-center gap-2'>
            <ArrowDownToLine className='h-4 w-4' aria-hidden />
            {t('Made from')}
          </span>
        }
        description={t(
          'Finished product → production order → assembly orders → components → batches → suppliers'
        )}
      >
        {forwardLoading && <Skeleton className='h-40 w-full' />}
        {!forwardLoading && forwardTrace && <TraceTree node={forwardTrace} />}
        {!forwardLoading && !forwardTrace && (
          <p className='text-muted-foreground py-6 text-center text-sm'>
            {forwardFinished.data?.message ||
              t('This item was purchased, not produced here.')}
          </p>
        )}
      </Panel>
      <Panel
        title={
          <span className='flex items-center gap-2'>
            <ArrowUpFromLine className='h-4 w-4' aria-hidden />
            {t('Used in')}
          </span>
        }
        description={t('Batch → assembly → production → finished products')}
      >
        {subject.kind === 'order' ? (
          <p className='text-muted-foreground py-6 text-center text-sm'>
            {t(
              'Search a batch or serial number of what this order produced to see where it went.'
            )}
          </p>
        ) : reverse.isLoading ? (
          <Skeleton className='h-40 w-full' />
        ) : (
          <WhereUsedTree nodes={reverse.data || []} />
        )}
      </Panel>
    </div>
  )
}
