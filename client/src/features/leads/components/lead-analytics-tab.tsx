import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { Users, Percent, Trophy, Clock3, Layers } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useLanguage } from '@/context/language-context'
import { useGetLeadStatsQuery } from '@/stores/lead.api'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { toneIconWrapClass } from '@/lib/stat-card-tones'
import { STAGE_LABELS, SOURCE_LABELS, formatCurrency } from '../utils/stage-config'

// Same fixed cycled palette used by the Reports module's charts (see expense-report.tsx) —
// kept identical so leads analytics reads as part of the same platform, not a bolt-on.
const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#94a3b8',
]

export function LeadAnalyticsTab() {
  const { t } = useLanguage()
  const { data, isLoading } = useGetLeadStatsQuery()

  if (isLoading || !data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCard key={i} title="" value="" icon={null} isLoading />
        ))}
      </div>
    )
  }

  const stageData = data.byStage.map((s) => ({ name: t(STAGE_LABELS[s.stage]), count: s.count, value: s.totalValue }))
  const sourceData = data.bySource.map((s) => ({ name: t(SOURCE_LABELS[s.source]), value: s.count }))

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title={t('Total Leads')}
          value={data.totalCount}
          icon={<Users />}
          tone="sky"
          description={t('across every pipeline stage')}
        />
        <StatCard
          title={t('Conversion Rate')}
          value={data.conversionRate}
          valueSuffix="%"
          icon={<Percent />}
          tone="emerald"
          description={t('of all leads became customers')}
        />
        <StatCard
          title={t('Won / Lost')}
          value={`${data.wonCount} / ${data.lostCount}`}
          icon={<Trophy />}
          tone="violet"
          description={t('closed deals this period')}
        />
        <StatCard
          title={t('Avg. Time to Close')}
          value={data.avgDaysToClose !== null ? data.avgDaysToClose : '—'}
          valueSuffix={data.avgDaysToClose !== null ? t('d') : ''}
          icon={<Clock3 />}
          tone="amber"
          description={t('from creation to won')}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className={toneIconWrapClass('sky')}><Layers className="h-4 w-4" /></span>
              {t('Leads by Stage')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={stageData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip formatter={(v: number) => v} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
                <Bar dataKey="count" fill={COLORS[0]} radius={[4, 4, 0, 0]} name={t('Leads')} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <span className={toneIconWrapClass('violet')}><Percent className="h-4 w-4" /></span>
              {t('Leads by Source')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={sourceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={48}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                  labelLine={false}
                  stroke="var(--card)"
                  strokeWidth={2}
                >
                  {sourceData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => v} />
                <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <span className={toneIconWrapClass('emerald')}><Layers className="h-4 w-4" /></span>
            {t('Pipeline Value by Stage')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {stageData.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between rounded-lg border bg-muted/30 p-3 text-sm transition-colors hover:bg-muted/60"
              >
                <span className="text-muted-foreground">{s.name}</span>
                <span className="font-semibold tabular-nums">{formatCurrency(s.value)}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
