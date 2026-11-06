import { useEffect, useMemo, useState } from 'react'
import {
  AlarmClock,
  BellRing,
  CheckCheck,
  Columns3,
  Flame,
  ListTodo,
  MessageCircle,
  Phone,
  Search,
  Snowflake,
  Sparkles,
  Sun,
  TrendingUp,
  Trophy,
  UserPlus,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'
import {
  useAdminAcknowledgeLeadsMutation,
  useAdminGetLeadPipelineQuery,
  useAdminSnoozeLeadMutation,
  type LeadTemperature,
  type PipelineLead,
} from '@/stores/admin-leads.api'
import {
  DUE_CLASS,
  STAGES,
  businessTypeLabel,
  dueState,
  initials,
  relativeTime,
  stageMeta,
  subscriptionPill,
  telLink,
} from './lead-utils'

const TEMP_ICON: Record<LeadTemperature, { icon: typeof Flame; className: string }> = {
  hot: { icon: Flame, className: 'text-red-500' },
  warm: { icon: Sun, className: 'text-amber-500' },
  cold: { icon: Snowflake, className: 'text-sky-500' },
}

type View = 'queue' | 'board'

function Kpi({ label, value, hint, icon: Icon, tone }: { label: string; value: string | number; hint?: string; icon: typeof Flame; tone: string }) {
  return (
    <Card className='gap-0 py-0'>
      <CardContent className='flex items-start justify-between gap-2 p-4'>
        <div className='min-w-0'>
          <p className='text-xs text-muted-foreground'>{label}</p>
          <p className='mt-1 text-2xl font-semibold tabular-nums'>{value}</p>
          {hint && <p className='mt-0.5 truncate text-[11px] text-muted-foreground'>{hint}</p>}
        </div>
        <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg', tone)}>
          <Icon className='size-4' />
        </span>
      </CardContent>
    </Card>
  )
}

function LeadRow({ lead, onOpen, now }: { lead: PipelineLead; onOpen: () => void; now: number }) {
  const [snooze, { isLoading }] = useAdminSnoozeLeadMutation()
  const org = lead.organization
  const due = dueState(lead.nextFollowUpAt, now)
  const pill = subscriptionPill(org.subscription)
  const temp = TEMP_ICON[lead.temperature]
  const tel = telLink(org.phone)
  return (
    <div
      role='button'
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className='flex cursor-pointer flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/40 sm:flex-row sm:items-center sm:gap-4'
    >
      <div className='flex min-w-0 flex-1 items-center gap-3'>
        <div className='relative flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary'>
          {initials(org.name)}
          {lead.isNew && <span className='absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-sky-500 ring-2 ring-background' />}
        </div>
        <div className='min-w-0'>
          <p className='flex items-center gap-1.5 truncate text-sm font-medium'>
            <span className='truncate'>{org.name}</span>
            <temp.icon className={cn('size-3.5 shrink-0', temp.className)} />
          </p>
          <p className='truncate text-xs text-muted-foreground'>
            {org.owner?.name ?? '—'} · {businessTypeLabel(org.businessType)} · {org.phone || org.owner?.email || 'no contact'}
          </p>
        </div>
      </div>
      <div className='flex flex-wrap items-center gap-1.5 sm:w-56 sm:justify-end'>
        <Badge variant='outline' className={cn('text-[11px]', stageMeta(lead.stage).chip)}>{stageMeta(lead.stage).label}</Badge>
        <Badge variant='outline' className={cn('text-[11px]', pill.className)}>{pill.label}</Badge>
      </div>
      <div className='sm:w-48'>
        <p className={cn('text-xs font-medium', DUE_CLASS[due])}>
          {lead.nextFollowUpAt ? (due === 'overdue' || due === 'now' ? `Due ${relativeTime(lead.nextFollowUpAt, now)}` : relativeTime(lead.nextFollowUpAt, now)) : 'No follow-up'}
        </p>
        <p className='truncate text-[11px] text-muted-foreground'>{lead.nextFollowUpNote}</p>
      </div>
      <div className='flex items-center gap-1' onClick={(e) => e.stopPropagation()}>
        {tel && (
          <Button asChild size='icon' variant='ghost' className='size-8' title={`Call ${org.phone}`}>
            <a href={tel}><Phone className='size-3.5' /></a>
          </Button>
        )}
        {(due === 'overdue' || due === 'now') && (
          <Button
            size='sm'
            variant='outline'
            className='h-8 text-xs'
            disabled={isLoading}
            onClick={() =>
              snooze({ orgId: lead.organizationId, minutes: 60 })
                .unwrap()
                .then(() => toast.success('Snoozed 1 hour'))
                .catch(() => toast.error('Could not snooze'))
            }
          >
            +1h
          </Button>
        )}
        <Button size='sm' className='h-8 text-xs' onClick={onOpen}>Open</Button>
      </div>
    </div>
  )
}

function QueueSection({ title, tone, leads, onOpen, now, empty, collapsedLimit }: { title: string; tone: string; leads: PipelineLead[]; onOpen: (id: string) => void; now: number; empty?: string; collapsedLimit?: number }) {
  const [expanded, setExpanded] = useState(false)
  if (!leads.length && !empty) return null
  const shown = collapsedLimit != null && !expanded ? leads.slice(0, collapsedLimit) : leads
  return (
    <div>
      <div className='flex items-center gap-2 border-b bg-muted/30 px-4 py-2'>
        <span className={cn('size-2 rounded-full', tone)} />
        <h4 className='text-xs font-semibold uppercase tracking-wide'>{title}</h4>
        <span className='text-xs text-muted-foreground'>{leads.length}</span>
      </div>
      {leads.length ? (
        <div className='divide-y'>
          {shown.map((l) => <LeadRow key={l.id} lead={l} now={now} onOpen={() => onOpen(l.organizationId)} />)}
          {shown.length < leads.length && (
            <button type='button' onClick={() => setExpanded(true)} className='w-full px-4 py-2.5 text-left text-xs font-medium text-primary hover:bg-muted/40'>
              Show all {leads.length} — open a lead and schedule a follow-up to move it up the queue
            </button>
          )}
        </div>
      ) : (
        <p className='px-4 py-4 text-sm text-muted-foreground'>{empty}</p>
      )}
    </div>
  )
}

export function LeadsTab({ onOpenLead }: { onOpenLead: (orgId: string) => void }) {
  const [view, setView] = useState<View>('queue')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput.trim(), 300)
  const { data, isLoading } = useAdminGetLeadPipelineQuery({ search: search || undefined }, { pollingInterval: 60_000 })
  const [acknowledge, { isLoading: isAcking }] = useAdminAcknowledgeLeadsMutation()
  // Re-evaluate overdue / today buckets as time passes, not only when data refetches.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const leads = useMemo(() => data?.results ?? [], [data])
  const stats = data?.stats

  const groups = useMemo(() => {
    const open = leads.filter((l) => ['new', 'contacted', 'demo', 'negotiation'].includes(l.stage))
    const byDue = (a: PipelineLead, b: PipelineLead) => +new Date(a.nextFollowUpAt ?? 0) - +new Date(b.nextFollowUpAt ?? 0)
    const fresh = open.filter((l) => l.isNew).sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    const rest = open.filter((l) => !l.isNew)
    return {
      fresh,
      overdue: rest.filter((l) => dueState(l.nextFollowUpAt, now) === 'overdue').sort(byDue),
      today: rest.filter((l) => ['now', 'today'].includes(dueState(l.nextFollowUpAt, now))).sort(byDue),
      upcoming: rest.filter((l) => dueState(l.nextFollowUpAt, now) === 'upcoming').sort(byDue).slice(0, 30),
      unscheduled: rest.filter((l) => !l.nextFollowUpAt),
    }
  }, [leads, now])

  const board = useMemo(
    () =>
      STAGES.map((s) => ({
        ...s,
        leads: leads
          .filter((l) => l.stage === s.key)
          .sort((a, b) => +new Date(a.nextFollowUpAt ?? '9999-01-01') - +new Date(b.nextFollowUpAt ?? '9999-01-01'))
          .slice(0, s.key === 'won' || s.key === 'lost' ? 25 : 200),
      })),
    [leads],
  )

  return (
    <div className='space-y-4'>
      {/* KPIs */}
      <div className='grid grid-cols-2 gap-3 lg:grid-cols-5'>
        <Kpi label='New signups (7 days)' value={stats?.newThisWeek ?? '—'} hint={stats?.newUnseen ? `${stats.newUnseen} not opened yet` : 'All seen'} icon={UserPlus} tone='bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300' />
        <Kpi label='Follow-ups due' value={stats ? stats.dueNow : '—'} hint={stats ? `${stats.overdue} overdue · ${stats.dueToday} today` : undefined} icon={AlarmClock} tone='bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300' />
        <Kpi label='Active trials' value={stats?.activeTrials ?? '—'} hint={stats ? `${stats.open} open leads` : undefined} icon={Sparkles} tone='bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300' />
        <Kpi label='Won (30 days)' value={stats?.won30 ?? '—'} hint={stats ? `${stats.lost30} lost` : undefined} icon={Trophy} tone='bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' />
        <Kpi
          label='Conversion (30 days)'
          value={stats?.conversionRate30 != null ? `${stats.conversionRate30}%` : '—'}
          hint='Won ÷ (won + lost)'
          icon={TrendingUp}
          tone='bg-primary/10 text-primary'
        />
      </div>

      <Card className='gap-0 overflow-hidden py-0'>
        <div className='flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3'>
          <div className='inline-flex rounded-lg border p-0.5'>
            {([
              { key: 'queue', label: 'Follow-up queue', icon: ListTodo },
              { key: 'board', label: 'Pipeline', icon: Columns3 },
            ] as const).map((v) => (
              <button
                key={v.key}
                type='button'
                onClick={() => setView(v.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
                  view === v.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <v.icon className='size-3.5' /> {v.label}
              </button>
            ))}
          </div>
          <div className='flex w-full flex-wrap items-center gap-2 sm:w-auto'>
            {(stats?.newUnseen ?? 0) > 0 && (
              <Button
                variant='outline'
                size='sm'
                disabled={isAcking}
                onClick={() => acknowledge({}).unwrap().then(() => toast.success('All new signups marked as seen'))}
              >
                <CheckCheck className='mr-1 size-3.5' /> Mark all seen
              </Button>
            )}
            <div className='relative w-full sm:w-64'>
              <Search className='absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder='Search leads…' className='h-9 pl-8 pr-8' />
              {searchInput && (
                <button type='button' onClick={() => setSearchInput('')} className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground' aria-label='Clear search'>
                  <X className='size-4' />
                </button>
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className='space-y-2 p-4'>{[1, 2, 3, 4].map((i) => <Skeleton key={i} className='h-14' />)}</div>
        ) : view === 'queue' ? (
          <div>
            <QueueSection title='New signups — call within the hour' tone='bg-sky-500' leads={groups.fresh} onOpen={onOpenLead} now={now} />
            <QueueSection title='Overdue' tone='bg-red-500' leads={groups.overdue} onOpen={onOpenLead} now={now} />
            <QueueSection title='Today' tone='bg-orange-500' leads={groups.today} onOpen={onOpenLead} now={now} empty='Nothing else due today. 🎉' />
            <QueueSection title='Upcoming' tone='bg-muted-foreground/50' leads={groups.upcoming} onOpen={onOpenLead} now={now} />
            <QueueSection title='No follow-up scheduled (re-engage)' tone='bg-zinc-300' leads={groups.unscheduled} onOpen={onOpenLead} now={now} collapsedLimit={5} />
            {leads.length === 0 && (
              <div className='flex flex-col items-center gap-2 py-16 text-center'>
                <BellRing className='size-10 text-muted-foreground/50' />
                <p className='text-sm font-medium'>No leads yet</p>
                <p className='text-xs text-muted-foreground'>New trial signups appear here automatically, with an alert.</p>
              </div>
            )}
          </div>
        ) : (
          <div className='flex gap-3 overflow-x-auto p-4'>
            {board.map((col) => (
              <div key={col.key} className='flex w-64 shrink-0 flex-col rounded-lg border bg-muted/20'>
                <div className='flex items-center gap-2 border-b px-3 py-2'>
                  <span className={cn('size-2 rounded-full', col.dot)} />
                  <span className='text-xs font-semibold'>{col.label}</span>
                  <span className='ml-auto rounded-full bg-muted px-1.5 text-[10px] tabular-nums'>{stats?.byStage[col.key] ?? col.leads.length}</span>
                </div>
                <div className='max-h-[60vh] space-y-2 overflow-y-auto p-2'>
                  {col.leads.length === 0 && <p className='px-1 py-3 text-center text-[11px] text-muted-foreground'>Empty</p>}
                  {col.leads.map((l) => {
                    const due = dueState(l.nextFollowUpAt, now)
                    const temp = TEMP_ICON[l.temperature]
                    const pill = subscriptionPill(l.organization.subscription)
                    return (
                      <button
                        key={l.id}
                        type='button'
                        onClick={() => onOpenLead(l.organizationId)}
                        className='w-full rounded-md border bg-background p-2.5 text-left shadow-xs transition-shadow hover:shadow-md'
                      >
                        <div className='flex items-start justify-between gap-1'>
                          <p className='line-clamp-2 text-sm font-medium leading-tight'>{l.organization.name}</p>
                          <temp.icon className={cn('mt-0.5 size-3.5 shrink-0', temp.className)} />
                        </div>
                        <p className='mt-0.5 truncate text-[11px] text-muted-foreground'>
                          {l.organization.owner?.name ?? '—'} · {businessTypeLabel(l.organization.businessType)}
                        </p>
                        <div className='mt-2 flex flex-wrap items-center gap-1'>
                          <Badge variant='outline' className={cn('h-5 px-1.5 text-[10px]', pill.className)}>{pill.label}</Badge>
                          {l.isNew && <Badge className='h-5 bg-sky-600 px-1.5 text-[10px] text-white'>NEW</Badge>}
                        </div>
                        {l.nextFollowUpAt && (
                          <p className={cn('mt-1.5 flex items-center gap-1 text-[11px]', DUE_CLASS[due])}>
                            <AlarmClock className='size-3' /> {relativeTime(l.nextFollowUpAt, now)}
                            {l.organization.phone && <MessageCircle className='ml-auto size-3 text-emerald-600' />}
                          </p>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
