import { format } from 'date-fns'
import { ArrowRight, FileText, MessageSquare, AlarmClock, GitCommitHorizontal } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import type { LeadTimelineEvent } from '@/stores/lead.api'
import { STAGE_LABELS } from '../utils/stage-config'

const KIND_ICON: Record<LeadTimelineEvent['kind'], typeof ArrowRight> = {
  stage_change: GitCommitHorizontal,
  communication: MessageSquare,
  reminder: AlarmClock,
  quotation: FileText,
}

const KIND_COLOR: Record<LeadTimelineEvent['kind'], string> = {
  stage_change: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  communication: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  reminder: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  quotation: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
}

function eventTitle(event: LeadTimelineEvent, t: (s: string) => string): string {
  if (event.kind === 'stage_change') {
    return `${t('Stage changed to')} ${t(event.stage ? STAGE_LABELS[event.stage] : '')}`
  }
  if (event.kind === 'communication') {
    const data = event.data as { type?: string; subject?: string } | undefined
    return data?.subject || t(`Logged a ${data?.type || 'interaction'}`)
  }
  if (event.kind === 'reminder') {
    const data = event.data as { title?: string } | undefined
    return data?.title || t('Follow-up reminder')
  }
  const data = event.data as { invoiceNumber?: string; total?: number } | undefined
  return `${t('Quotation')} ${data?.invoiceNumber || ''}`.trim()
}

function eventSubtitle(event: LeadTimelineEvent): string | undefined {
  if (event.kind === 'communication') {
    const data = event.data as { notes?: string } | undefined
    return data?.notes
  }
  if (event.kind === 'stage_change') {
    return event.note
  }
  if (event.kind === 'quotation') {
    const data = event.data as { total?: number; status?: string } | undefined
    return data?.total ? `Rs ${data.total} · ${data.status || ''}` : undefined
  }
  return undefined
}

interface LeadActivityTimelineProps {
  events: LeadTimelineEvent[]
  isLoading?: boolean
}

export function LeadActivityTimeline({ events, isLoading }: LeadActivityTimelineProps) {
  const { t } = useLanguage()

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t('Loading...')}</p>
  }
  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{t('No activity yet')}</p>
  }

  return (
    <div className="space-y-4">
      {events.map((event, idx) => {
        const Icon = KIND_ICON[event.kind]
        const subtitle = eventSubtitle(event)
        return (
          <div key={idx} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full', KIND_COLOR[event.kind])}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              {idx < events.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
            </div>
            <div className="min-w-0 flex-1 pb-4">
              <p className="text-sm font-medium">{eventTitle(event, t)}</p>
              {subtitle && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>}
              <p className="mt-1 text-[11px] text-muted-foreground">{format(new Date(event.timestamp), 'PPP p')}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
