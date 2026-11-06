import { useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { BarChart3, ChevronRight, Plus, Target } from 'lucide-react'
import {
  useGetProductionTargetsQuery,
  type ProductionTarget,
  type TargetPhase,
  type TargetStatus,
} from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { FilterChips, SearchField, Toolbar } from '../components/list-controls'
import { EmptyState, PageHeader, Stat, StatGrid } from '../components/page'
import { Pager } from '../components/pager'
import { ProgressBar } from '../components/badges'
import { TargetDialog } from '../components/target-dialog'
import { TargetDetailSheet } from '../components/target-detail-sheet'
import {
  TargetAlertsPanel,
  TargetLinesTable,
  TargetStatusPill,
} from '../components/target-parts'
import { progressTone, timingText } from '../lib/targets'
import {
  TARGET_MEASURE_LABELS,
  TARGET_PERIOD_LABELS,
  fmtDay,
} from '../lib/constants'

type PhaseFilter = 'all' | TargetPhase
type StatusFilter = 'all' | TargetStatus
type Editing = { mode: 'new' } | { mode: 'edit'; target: ProductionTarget } | { mode: 'copy'; target: ProductionTarget }

function TargetCard({ target, onOpen }: { target: ProductionTarget; onOpen: () => void }) {
  const { t } = useLanguage()
  return (
    <Card className='gap-0 overflow-hidden py-0'>
      <button
        type='button'
        onClick={onOpen}
        className='hover:bg-muted/40 focus-visible:ring-ring flex w-full flex-wrap items-center gap-x-6 gap-y-3 border-b px-5 py-3.5 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset max-sm:px-4'
      >
        <div className='min-w-0 flex-1'>
          <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
            <span className='text-muted-foreground font-mono text-xs'>{target.targetNumber}</span>
            <h3 className='truncate font-semibold'>{target.title}</h3>
          </div>
          <p className='text-muted-foreground mt-0.5 text-xs'>
            {fmtDay(target.startDay)} – {fmtDay(target.endDay)} · {t(TARGET_PERIOD_LABELS[target.periodType])} ·{' '}
            {t(TARGET_MEASURE_LABELS[target.measure].label)} ·{' '}
            <span className={cn(target.phase === 'running' && target.daysLeft <= 3 && target.status === 'at_risk' && 'font-medium text-rose-600 dark:text-rose-400')}>
              {timingText(target, t)}
            </span>
          </p>
        </div>
        <div className='flex items-center gap-3 max-sm:w-full'>
          <div className='w-40 max-sm:flex-1'>
            <div className='text-muted-foreground mb-1 flex justify-between text-xs'>
              <span>{t('Progress')}</span>
              <span className='text-foreground font-semibold tabular-nums'>{target.progress}%</span>
            </div>
            <ProgressBar value={target.progress} tone={progressTone(target.status)} label={`${target.title} ${t('progress')}`} />
          </div>
          <TargetStatusPill status={target.status} />
          <ChevronRight className='text-muted-foreground h-4 w-4 shrink-0' aria-hidden />
        </div>
      </button>
      <TargetLinesTable target={target} />
    </Card>
  )
}

export default function TargetsPage({
  targetId,
  status: initialStatus,
}: {
  /** Open this target's detail sheet (alerts link here). */
  targetId?: string
  status?: StatusFilter
}) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('manageProductionTargets')
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [phase, setPhase] = useState<PhaseFilter>('all')
  const [status, setStatus] = useState<StatusFilter>(initialStatus || 'all')
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Editing | null>(null)
  // An alert link (?status=at_risk) arriving while the page is already open.
  useEffect(() => {
    if (initialStatus) {
      setStatus(initialStatus)
      setPage(1)
    }
  }, [initialStatus])

  const { data, isLoading, isFetching } = useGetProductionTargetsQuery({
    phase,
    status,
    search: debounced.trim() || undefined,
    page,
    limit: 10,
  })
  const stats = data?.stats
  const filtered = !!debounced || phase !== 'all' || status !== 'all'

  const openTarget = (id?: string) =>
    navigate({ to: '/manufacturing/targets', search: (id ? { targetId: id } : {}) as never, replace: !id })
  const toggleStatus = (next: TargetStatus) => {
    setStatus((cur) => (cur === next ? 'all' : next))
    setPage(1)
  }

  return (
    <div className='space-y-5'>
      <PageHeader
        title={t('Production Targets')}
        description={t(
          'Set what the factory must make and by when. Progress is measured live from finished goods received and packed, with stock on hand, open orders and what is still to plan.'
        )}
        actions={
          <>
            <Button variant='outline' asChild>
              <Link to={'/manufacturing/reports' as never} search={{ report: 'targets' } as never}>
                <BarChart3 className='h-4 w-4' />
                {t('Target vs Actual report')}
              </Link>
            </Button>
            {canManage && (
              <Button onClick={() => setEditing({ mode: 'new' })}>
                <Plus className='h-4 w-4' />
                {t('New target')}
              </Button>
            )}
          </>
        }
      />

      <TargetAlertsPanel />

      <StatGrid className='md:grid-cols-3 xl:grid-cols-6'>
        <Stat
          label={t('All targets')}
          value={stats?.total ?? '—'}
          onClick={() => {
            setStatus('all')
            setPage(1)
          }}
          pressed={status === 'all'}
        />
        <Stat
          label={t('On track')}
          value={stats?.on_track ?? '—'}
          onClick={() => toggleStatus('on_track')}
          pressed={status === 'on_track'}
        />
        <Stat
          label={t('At risk')}
          value={stats?.at_risk ?? '—'}
          tone='warning'
          active={!!stats?.at_risk}
          hint={t('Behind the pace to date')}
          onClick={() => toggleStatus('at_risk')}
          pressed={status === 'at_risk'}
        />
        <Stat
          label={t('Missed')}
          value={stats?.missed ?? '—'}
          tone='danger'
          active={!!stats?.missed}
          hint={t('Period ended short')}
          onClick={() => toggleStatus('missed')}
          pressed={status === 'missed'}
        />
        <Stat
          label={t('Achieved')}
          value={stats?.achieved ?? '—'}
          tone='success'
          active={!!stats?.achieved}
          onClick={() => toggleStatus('achieved')}
          pressed={status === 'achieved'}
        />
        <Stat
          label={t('Upcoming')}
          value={stats?.upcoming ?? '—'}
          onClick={() => toggleStatus('upcoming')}
          pressed={status === 'upcoming'}
        />
      </StatGrid>

      <div className='space-y-3'>
        <Toolbar>
          <SearchField
            value={search}
            onChange={(v) => {
              setSearch(v)
              setPage(1)
            }}
            placeholder={t('Search target no., name or product')}
          />
        </Toolbar>
        <FilterChips
          label={t('Period')}
          value={phase}
          onChange={(v) => {
            setPhase(v as PhaseFilter)
            setPage(1)
          }}
          options={[
            { value: 'all', label: t('All periods') },
            { value: 'running', label: t('Running now') },
            { value: 'upcoming', label: t('Upcoming') },
            { value: 'ended', label: t('Ended') },
          ]}
        />
      </div>

      {isLoading ? (
        <div className='space-y-3'>
          <Skeleton className='h-40 w-full rounded-xl' />
          <Skeleton className='h-40 w-full rounded-xl' />
        </div>
      ) : !data?.results.length ? (
        <EmptyState
          icon={Target}
          title={filtered ? t('No target matches these filters') : t('No production targets yet')}
          description={
            filtered
              ? t('Try another period, status or search.')
              : t('Set a target — e.g. 1,000 fans this month — and track made, in stock and remaining against it every day.')
          }
          action={
            !filtered && canManage ? (
              <Button onClick={() => setEditing({ mode: 'new' })}>
                <Plus className='h-4 w-4' />
                {t('New target')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={cn('space-y-3 transition-opacity', isFetching && 'opacity-60')} aria-busy={isFetching}>
          {data.results.map((target) => (
            <TargetCard key={target.id} target={target} onOpen={() => openTarget(target.id)} />
          ))}
          {data.totalPages > 1 && (
            <Card className='py-0'>
              <Pager data={data} page={page} onPageChange={setPage} />
            </Card>
          )}
        </div>
      )}

      {targetId && (
        <TargetDetailSheet
          targetId={targetId}
          onClose={() => openTarget()}
          onEdit={(target) => setEditing({ mode: 'edit', target })}
          onCopy={(target) => setEditing({ mode: 'copy', target })}
        />
      )}
      {editing && (
        <TargetDialog
          target={editing.mode === 'edit' ? editing.target : undefined}
          copyFrom={editing.mode === 'copy' ? editing.target : undefined}
          onClose={() => setEditing(null)}
          onSaved={(saved) => editing.mode !== 'edit' && openTarget(saved.id)}
        />
      )}
    </div>
  )
}
