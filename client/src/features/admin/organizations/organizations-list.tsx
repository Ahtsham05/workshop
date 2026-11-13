import { useEffect, useMemo, useState } from 'react'
import {
  Building2,
  ChevronRight,
  Eye,
  Mail,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Trash2,
  X,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { usePersistedPageSize } from '@/hooks/use-persisted-page-size'
import { formatAppDateTime } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import {
  useAdminListOrganizationsQuery,
  type AdminOrgRow,
  type LeadStage,
  type OrgBucket,
} from '@/stores/admin-leads.api'
import {
  DEFAULT_TEMPLATE_KEY,
  DUE_CLASS,
  STAGES,
  businessTypeLabel,
  dueState,
  initials,
  planLabel,
  relativeTime,
  stageMeta,
  subscriptionPill,
  telLink,
  templateFor,
  whatsappLink,
} from '../leads/lead-utils'
import { ActivatePlanDialog } from './activate-plan-dialog'
import { BusinessTypeSwitcher } from './business-type-switcher'
import { PurgeExpiredDialog } from './purge-expired-dialog'

const BUCKETS: { key: OrgBucket; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New this week' },
  { key: 'trial', label: 'In trial' },
  { key: 'paid', label: 'Paying' },
  { key: 'trial_expired', label: 'Trial expired' },
  { key: 'lapsed', label: 'Lapsed' },
  { key: 'followup', label: 'Follow-up due' },
]

const SORTS = [
  { value: 'createdAt:desc', label: 'Newest first' },
  { value: 'createdAt:asc', label: 'Oldest first' },
  { value: 'name:asc', label: 'Name A–Z' },
  { value: 'trialEnd:asc', label: 'Trial / plan ending soonest' },
  { value: 'followUp:asc', label: 'Next follow-up' },
]

const AVATAR_TINTS = [
  'bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
]
const tintFor = (id: string) => AVATAR_TINTS[parseInt(id.slice(-4), 16) % AVATAR_TINTS.length]

const ALL = '__all__'

const isFresh = (row: AdminOrgRow) =>
  row.lead?.isNew || Date.now() - new Date(row.createdAt).getTime() < 48 * 3600_000

function OrgAvatar({ row }: { row: AdminOrgRow }) {
  return (
    <div className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg text-xs font-semibold', tintFor(row.id))}>
      {initials(row.name)}
    </div>
  )
}

function ContactIcons({ row }: { row: AdminOrgRow }) {
  // Opens WhatsApp with the team's standard welcome message already typed.
  const wa = whatsappLink(row.phone, templateFor(DEFAULT_TEMPLATE_KEY).build({ businessName: row.name }))
  const tel = telLink(row.phone)
  const email = row.owner?.email || row.email
  return (
    <div className='flex items-center gap-0.5'>
      {wa && (
        <a href={wa} target='_blank' rel='noopener noreferrer' title={`WhatsApp ${row.phone}`} onClick={(e) => e.stopPropagation()}
          className='rounded p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950'>
          <MessageCircle className='size-3.5' />
        </a>
      )}
      {tel && (
        <a href={tel} title={`Call ${row.phone}`} onClick={(e) => e.stopPropagation()} className='rounded p-1 text-sky-600 hover:bg-sky-50 dark:hover:bg-sky-950'>
          <Phone className='size-3.5' />
        </a>
      )}
      {email && (
        <a href={`mailto:${email}`} title={`Email ${email}`} onClick={(e) => e.stopPropagation()} className='rounded p-1 text-muted-foreground hover:bg-muted'>
          <Mail className='size-3.5' />
        </a>
      )}
    </div>
  )
}

function LeadCell({ row }: { row: AdminOrgRow }) {
  if (!row.lead) return <span className='text-xs text-muted-foreground'>—</span>
  const meta = stageMeta(row.lead.stage)
  const due = dueState(row.lead.nextFollowUpAt)
  return (
    <div className='space-y-1'>
      <Badge variant='outline' className={cn('gap-1.5 font-medium', meta.chip)}>
        <span className={cn('size-1.5 rounded-full', meta.dot)} />
        {meta.label}
      </Badge>
      {row.lead.nextFollowUpAt && (
        <p className={cn('text-[11px] leading-tight', DUE_CLASS[due])} title={row.lead.nextFollowUpNote}>
          {due === 'overdue' || due === 'now' ? 'Due ' : 'Next '}
          {relativeTime(row.lead.nextFollowUpAt)}
        </p>
      )}
    </div>
  )
}

export function OrganizationsList({
  onSelectOrg,
  onOpenLead,
}: {
  onSelectOrg: (id: string) => void
  onOpenLead: (id: string) => void
}) {
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput.trim(), 300)
  const [bucket, setBucket] = useState<OrgBucket>('all')
  const [businessType, setBusinessType] = useState(ALL)
  const [plan, setPlan] = useState(ALL)
  const [stage, setStage] = useState<LeadStage | typeof ALL>(ALL)
  const [sortBy, setSortBy] = useState('createdAt:desc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = usePersistedPageSize('admin-organizations', 50)
  const [purgeOpen, setPurgeOpen] = useState(false)
  const [activateOrgId, setActivateOrgId] = useState<string | null>(null)

  // Any filter change goes back to page 1.
  useEffect(() => setPage(1), [search, bucket, businessType, plan, stage, sortBy, limit])

  const { data, isLoading, isFetching, refetch } = useAdminListOrganizationsQuery({
    search: search || undefined,
    bucket,
    businessType: businessType === ALL ? undefined : businessType,
    plan: plan === ALL ? undefined : plan,
    stage: stage === ALL ? undefined : stage,
    sortBy,
    page,
    limit,
  })
  const rows = data?.results ?? []
  const counts = data?.counts
  const activeFilters = [businessType, plan, stage].filter((v) => v !== ALL).length + (search ? 1 : 0)

  const clearFilters = () => {
    setSearchInput('')
    setBusinessType(ALL)
    setPlan(ALL)
    setStage(ALL)
    setBucket('all')
  }

  const subtitle = useMemo(() => {
    if (!data) return 'Loading…'
    const total = data.totalResults
    if (total === 0) return 'No organizations match'
    const from = (data.page - 1) * data.limit + 1
    const to = Math.min(data.page * data.limit, total)
    return `Showing ${from}–${to} of ${total}`
  }, [data])

  return (
    <Card className='gap-0 overflow-hidden py-0'>
      <CardHeader className='space-y-4 border-b px-4 py-4 sm:px-6'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <h3 className='flex items-center gap-2 text-base font-semibold'>
              <Building2 className='size-4' /> Organizations
            </h3>
            <p className='text-sm text-muted-foreground'>{subtitle}</p>
          </div>
          <div className='flex w-full flex-wrap items-center gap-2 sm:w-auto'>
            <div className='relative w-full sm:w-72'>
              <Search className='absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder='Search name, owner, phone, email, city…'
                className='pl-8 pr-8'
              />
              {searchInput && (
                <button type='button' onClick={() => setSearchInput('')} className='absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground' aria-label='Clear search'>
                  <X className='size-4' />
                </button>
              )}
            </div>
            <Button variant='outline' size='icon' onClick={() => refetch()} title='Refresh' disabled={isFetching}>
              <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
            </Button>
          </div>
        </div>

        {/* Status chips with live counts */}
        <div className='-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1'>
          {BUCKETS.map((b) => {
            const n = counts?.[b.key]
            const active = bucket === b.key
            return (
              <button
                key={b.key}
                type='button'
                onClick={() => setBucket(b.key)}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  active ? 'border-primary bg-primary text-primary-foreground' : 'bg-background hover:bg-muted',
                  b.key === 'followup' && !active && (n ?? 0) > 0 && 'border-orange-300 text-orange-700 dark:border-orange-800 dark:text-orange-300',
                )}
              >
                {b.label}
                {n != null && (
                  <span className={cn('rounded-full px-1.5 py-px text-[10px] tabular-nums', active ? 'bg-primary-foreground/20' : 'bg-muted')}>{n}</span>
                )}
              </button>
            )
          })}
        </div>

        <div className='grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center'>
          <Select value={businessType} onValueChange={setBusinessType}>
            <SelectTrigger className='w-full md:w-44'><SelectValue placeholder='Business type' /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All business types</SelectItem>
              {(data?.facets.businessTypes ?? []).map((t) => (
                <SelectItem key={t} value={t}>{businessTypeLabel(t)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger className='w-full md:w-36'><SelectValue placeholder='Plan' /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All plans</SelectItem>
              {(data?.facets.plans ?? []).map((p) => (
                <SelectItem key={p} value={p}>{planLabel(p)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stage} onValueChange={(v) => setStage(v as LeadStage | typeof ALL)}>
            <SelectTrigger className='w-full md:w-40'><SelectValue placeholder='Lead stage' /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All lead stages</SelectItem>
              {STAGES.map((s) => (
                <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className='w-full md:w-52'><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(activeFilters > 0 || bucket !== 'all') && (
            <Button variant='ghost' size='sm' onClick={clearFilters} className='col-span-2 justify-self-start md:col-span-1'>
              <X className='mr-1 size-3.5' /> Clear filters
            </Button>
          )}
        </div>
      </CardHeader>

      {bucket === 'trial_expired' && (counts?.trial_expired ?? 0) > 0 && (
        <div className='flex flex-col gap-2 border-b bg-red-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:bg-red-950/20'>
          <p className='text-sm'>
            <span className='font-medium'>{counts?.trial_expired} organization{counts?.trial_expired === 1 ? '' : 's'}</span>
            <span className='text-muted-foreground'> have an expired trial and never subscribed.</span>
          </p>
          <Button variant='destructive' size='sm' className='self-start sm:self-auto' onClick={() => setPurgeOpen(true)}>
            <Trash2 className='mr-1.5 size-3.5' /> Delete expired trials…
          </Button>
        </div>
      )}
      <PurgeExpiredDialog open={purgeOpen} onOpenChange={setPurgeOpen} />
      <ActivatePlanDialog orgId={activateOrgId} onOpenChange={(v) => !v && setActivateOrgId(null)} />

      <CardContent className='px-0'>
        {isLoading ? (
          <div className='space-y-2 p-4'>{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className='h-14' />)}</div>
        ) : rows.length === 0 ? (
          <div className='flex flex-col items-center justify-center gap-2 py-16 text-center'>
            <Building2 className='size-10 text-muted-foreground/50' />
            <p className='text-sm font-medium'>No organizations found</p>
            <p className='text-xs text-muted-foreground'>Try a different search or clear the filters.</p>
            {(activeFilters > 0 || bucket !== 'all') && (
              <Button variant='outline' size='sm' className='mt-2' onClick={clearFilters}>Clear filters</Button>
            )}
          </div>
        ) : (
          <TooltipProvider delayDuration={300}>
            {/* Desktop / tablet table */}
            <div className={cn('hidden overflow-x-auto md:block', isFetching && 'opacity-70 transition-opacity')}>
              <Table>
                <TableHeader>
                  <TableRow className='bg-muted/40 hover:bg-muted/40'>
                    <TableHead className='pl-6'>Organization</TableHead>
                    <TableHead>Owner &amp; contact</TableHead>
                    <TableHead>Subscription</TableHead>
                    <TableHead>Usage</TableHead>
                    <TableHead>Sales lead</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className='pr-6 text-right'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const pill = subscriptionPill(row.subscription)
                    return (
                      <TableRow key={row.id} className='group cursor-pointer' onClick={() => onSelectOrg(row.id)}>
                        <TableCell className='pl-6'>
                          <div className='flex items-center gap-3'>
                            <OrgAvatar row={row} />
                            <div className='min-w-0'>
                              <div className='flex items-center gap-1.5'>
                                <span className='max-w-[220px] truncate font-medium'>{row.name}</span>
                                {isFresh(row) && (
                                  <Badge className='h-4 gap-0.5 bg-sky-600 px-1.5 text-[10px] text-white hover:bg-sky-600'>
                                    <Sparkles className='size-2.5' /> NEW
                                  </Badge>
                                )}
                                {!row.isActive && <Badge variant='outline' className='h-4 px-1.5 text-[10px]'>Inactive</Badge>}
                              </div>
                              <p className='flex items-center text-xs text-muted-foreground'>
                                <BusinessTypeSwitcher orgId={row.id} orgName={row.name} businessType={row.businessType} />
                                {row.city ? <span className='ml-1'>· {row.city}</span> : null}
                              </p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className='min-w-0'>
                            <p className='max-w-[200px] truncate text-sm'>{row.owner?.name ?? '—'}</p>
                            <div className='flex items-center gap-1'>
                              <span className='max-w-[150px] truncate text-xs text-muted-foreground'>{row.phone || row.owner?.email || row.email || '—'}</span>
                              <ContactIcons row={row} />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className='space-y-1'>
                            <Badge variant='outline' className={cn('font-medium', pill.className)}>{pill.label}</Badge>
                            <p className='text-[11px] text-muted-foreground'>{planLabel(row.subscription.planKey)}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className='text-xs tabular-nums'>
                            {row.usage.users} user{row.usage.users === 1 ? '' : 's'} · {row.usage.branches} branch{row.usage.branches === 1 ? '' : 'es'}
                          </p>
                          <p className='text-xs tabular-nums text-muted-foreground'>
                            {row.usage.invoices.toLocaleString()} invoice{row.usage.invoices === 1 ? '' : 's'}
                            {row.usage.lastActivityAt ? ` · active ${relativeTime(row.usage.lastActivityAt)}` : ''}
                          </p>
                        </TableCell>
                        <TableCell><LeadCell row={row} /></TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className='text-xs text-muted-foreground'>{relativeTime(row.createdAt)}</span>
                            </TooltipTrigger>
                            <TooltipContent>{formatAppDateTime(new Date(row.createdAt))}</TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className='pr-6 text-right'>
                          <div className='flex items-center justify-end gap-1'>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size='sm' variant='outline' className='h-8 text-primary' onClick={(e) => { e.stopPropagation(); setActivateOrgId(row.id) }}>
                                  <Zap className='mr-1 size-3.5' /> {row.subscription.isPaid ? 'Renew' : 'Activate'}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Activate, renew or change the plan — with or without a payment</TooltipContent>
                            </Tooltip>
                            <Button size='sm' variant='outline' className='h-8' onClick={(e) => { e.stopPropagation(); onOpenLead(row.id) }}>
                              <Target className='mr-1 size-3.5' /> Lead
                            </Button>
                            <Button size='sm' variant='ghost' className='h-8' onClick={(e) => { e.stopPropagation(); onSelectOrg(row.id) }}>
                              <Eye className='mr-1 size-3.5' /> View
                              <ChevronRight className='ml-0.5 size-3.5 opacity-50 transition-transform group-hover:translate-x-0.5' />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Phone cards */}
            <div className='divide-y md:hidden'>
              {rows.map((row) => {
                const pill = subscriptionPill(row.subscription)
                return (
                  <div key={row.id} className='space-y-2.5 px-4 py-3'>
                    <div className='flex items-start gap-3'>
                      <OrgAvatar row={row} />
                      <div className='min-w-0 flex-1'>
                        <div className='flex items-center gap-1.5'>
                          <span className='truncate font-medium'>{row.name}</span>
                          {isFresh(row) && <Badge className='h-4 shrink-0 bg-sky-600 px-1.5 text-[10px] text-white'>NEW</Badge>}
                        </div>
                        <div className='flex min-w-0 items-center text-xs text-muted-foreground'>
                          <BusinessTypeSwitcher orgId={row.id} orgName={row.name} businessType={row.businessType} className='shrink-0' />
                          <span className='ml-1 truncate'>· {row.owner?.name ?? '—'} · joined {relativeTime(row.createdAt)}</span>
                        </div>
                      </div>
                      <ContactIcons row={row} />
                    </div>
                    <div className='flex flex-wrap items-center gap-1.5'>
                      <Badge variant='outline' className={cn('font-medium', pill.className)}>{pill.label}</Badge>
                      {row.lead && (
                        <Badge variant='outline' className={cn('gap-1.5', stageMeta(row.lead.stage).chip)}>
                          <span className={cn('size-1.5 rounded-full', stageMeta(row.lead.stage).dot)} />
                          {stageMeta(row.lead.stage).label}
                        </Badge>
                      )}
                      <span className='text-[11px] text-muted-foreground'>
                        {row.usage.users}u · {row.usage.invoices} inv
                      </span>
                    </div>
                    {row.lead?.nextFollowUpAt && (
                      <p className={cn('text-xs', DUE_CLASS[dueState(row.lead.nextFollowUpAt)])}>
                        Follow-up {relativeTime(row.lead.nextFollowUpAt)} — {row.lead.nextFollowUpNote || 'scheduled'}
                      </p>
                    )}
                    <div className='grid grid-cols-3 gap-2'>
                      <Button size='sm' variant='outline' className='text-primary' onClick={() => setActivateOrgId(row.id)}>
                        <Zap className='mr-1 size-3.5' /> {row.subscription.isPaid ? 'Renew' : 'Activate'}
                      </Button>
                      <Button size='sm' variant='outline' onClick={() => onOpenLead(row.id)}><Target className='mr-1 size-3.5' /> Lead</Button>
                      <Button size='sm' variant='secondary' onClick={() => onSelectOrg(row.id)}><Eye className='mr-1 size-3.5' /> View</Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </TooltipProvider>
        )}

        {data && data.totalResults > 0 && (
          <div className='border-t px-4 py-3 sm:px-6'>
            <SimplePagination
              currentPage={data.page}
              totalPages={data.totalPages}
              totalResults={data.totalResults}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
