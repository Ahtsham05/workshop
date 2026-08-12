import { useEffect, useMemo, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { Plus, Search, Target, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'
import { Can } from '@/context/permission-context'
import { usePermissions } from '@/context/permission-context'
import { useGetUsersQuery } from '@/stores/users.api'
import { useGetLeadsQuery, LEADS_BOARD_QUERY_PARAMS, type LeadSource, type LeadUserRef } from '@/stores/lead.api'
import { SOURCES, SOURCE_LABELS, STAGES, formatCurrency } from './utils/stage-config'
import { LeadKanbanBoard } from './components/lead-kanban-board'
import { LeadDetailSheet } from './components/lead-detail-sheet'
import { LeadMutateDialog } from './components/lead-mutate-dialog'
import { LeadAnalyticsTab } from './components/lead-analytics-tab'

type ViewTab = 'board' | 'analytics'

export default function LeadsPage() {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const canViewAll = hasPermission('viewAllLeads')
  const routeSearch = useSearch({ from: '/_authenticated/leads/' })

  const { data, isLoading } = useGetLeadsQuery(LEADS_BOARD_QUERY_PARAMS)
  const { data: usersData } = useGetUsersQuery({ limit: 200 }, { skip: !canViewAll })
  const leads = useMemo(() => data?.results || [], [data])

  const [viewTab, setViewTab] = useState<ViewTab>('board')
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<LeadSource | 'all'>('all')
  const [repFilter, setRepFilter] = useState<string>('all')
  const [addOpen, setAddOpen] = useState(false)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)

  useEffect(() => {
    if (routeSearch.leadId) setSelectedLeadId(routeSearch.leadId)
  }, [routeSearch.leadId])
  // Derived (not a snapshot) so the sheet always reflects the latest cache data —
  // e.g. a stage change from the board while the sheet is open for that same lead.
  const selectedLead = useMemo(
    () => (selectedLeadId ? leads.find((l) => (l._id || l.id) === selectedLeadId) || null : null),
    [leads, selectedLeadId],
  )

  const filteredLeads = useMemo(() => {
    let list = leads
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.companyName?.toLowerCase().includes(q) ||
          l.phone?.includes(q) ||
          l.email?.toLowerCase().includes(q),
      )
    }
    if (sourceFilter !== 'all') list = list.filter((l) => l.source === sourceFilter)
    if (repFilter !== 'all') {
      list = list.filter((l) => {
        const rep = l.assignedTo as string | LeadUserRef
        const repId = typeof rep === 'string' ? rep : rep?.id || rep?._id
        return repId === repFilter
      })
    }
    return list
  }, [leads, search, sourceFilter, repFilter])

  const openPipelineValue = useMemo(
    () => leads.filter((l) => l.stage !== 'won' && l.stage !== 'lost').reduce((sum, l) => sum + (l.estimatedValue || 0), 0),
    [leads],
  )

  return (
    <div className="flex h-full w-full flex-col gap-4 p-4">
      <Card className="border bg-card/80 p-4 shadow-sm backdrop-blur-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/12 text-violet-600 dark:text-violet-400">
              <Target className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">{t('Leads')}</h1>
              <p className="text-sm text-muted-foreground">{t('Track and convert leads through your sales pipeline')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {openPipelineValue > 0 && (
              <div className="hidden items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 sm:flex">
                <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <div className="leading-tight">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('Open Pipeline')}</p>
                  <p className="text-sm font-semibold tabular-nums">{formatCurrency(openPipelineValue)}</p>
                </div>
              </div>
            )}
            <Can permission="createLeads">
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t('New Lead')}
              </Button>
            </Can>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={viewTab} onValueChange={(v) => setViewTab(v as ViewTab)}>
          <TabsList>
            <TabsTrigger value="board">{t('Pipeline')}</TabsTrigger>
            <TabsTrigger value="analytics">{t('Analytics')}</TabsTrigger>
          </TabsList>
        </Tabs>

        {viewTab === 'board' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search leads...')}
                className="w-48 pl-8"
              />
            </div>
            <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as LeadSource | 'all')}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('All sources')}</SelectItem>
                {SOURCES.map((s) => (
                  <SelectItem key={s} value={s}>{t(SOURCE_LABELS[s])}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {canViewAll && (
              <Select value={repFilter} onValueChange={setRepFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('All reps')}</SelectItem>
                  {(usersData?.results || []).map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )}
      </div>

      <Tabs value={viewTab} className="min-h-0 flex-1">
        <TabsContent value="board" className="h-full">
          {isLoading ? (
            <div className="flex h-full gap-3 overflow-hidden pb-2">
              {STAGES.map((stage) => (
                <div key={stage} className="w-72 shrink-0 space-y-2 rounded-xl border bg-muted/20 p-2">
                  <Skeleton className="h-11 w-full rounded-lg" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                  <Skeleton className="h-24 w-full rounded-lg" />
                </div>
              ))}
            </div>
          ) : (
            <LeadKanbanBoard leads={filteredLeads} onCardClick={(lead) => setSelectedLeadId(lead._id || lead.id)} />
          )}
        </TabsContent>
        <TabsContent value="analytics">
          <LeadAnalyticsTab />
        </TabsContent>
      </Tabs>

      <LeadMutateDialog open={addOpen} onOpenChange={setAddOpen} />
      <LeadDetailSheet lead={selectedLead} onOpenChange={(v) => !v && setSelectedLeadId(null)} />
    </div>
  )
}
