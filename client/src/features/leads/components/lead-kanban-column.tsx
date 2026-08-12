import { useDroppable } from '@dnd-kit/core'
import { Inbox } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import type { Lead, LeadStage } from '@/stores/lead.api'
import { STAGE_COLUMN_STYLES, STAGE_ICONS, STAGE_LABELS, formatCurrency } from '../utils/stage-config'
import { LeadCard } from './lead-card'

interface LeadKanbanColumnProps {
  stage: LeadStage
  leads: Lead[]
  onCardClick: (lead: Lead) => void
}

export function LeadKanbanColumn({ stage, leads, onCardClick }: LeadKanbanColumnProps) {
  const { t } = useLanguage()
  const { setNodeRef, isOver } = useDroppable({ id: stage })
  const style = STAGE_COLUMN_STYLES[stage]
  const Icon = STAGE_ICONS[stage]
  const totalValue = leads.reduce((sum, l) => sum + (l.estimatedValue || 0), 0)

  return (
    <div
      className={cn(
        'flex h-full w-72 shrink-0 flex-col rounded-xl border bg-muted/20 shadow-sm transition-shadow',
        isOver && 'shadow-md ring-2 ring-primary/20',
      )}
    >
      <div className={cn('shrink-0 rounded-t-xl border-t-2 bg-card px-3 py-3', style.header)}>
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', style.iconWrap)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="truncate text-sm font-semibold">{t(STAGE_LABELS[stage])}</span>
          </span>
          <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums', style.badge)}>
            {leads.length}
          </span>
        </div>
        {totalValue > 0 && (
          <p className={cn('mt-1.5 pl-9 text-xs font-medium tabular-nums', style.accentText)}>
            {formatCurrency(totalValue)}
          </p>
        )}
      </div>
      <div
        ref={setNodeRef}
        className={cn(
          'flex-1 space-y-2 overflow-y-auto p-2 transition-colors',
          isOver && 'bg-primary/5',
        )}
        style={{ minHeight: 120 }}
      >
        {leads.map((lead) => (
          <LeadCard key={lead._id || lead.id} lead={lead} onClick={() => onCardClick(lead)} />
        ))}
        {leads.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <Inbox className="h-4 w-4 text-muted-foreground opacity-60" />
            </span>
            <p className="text-xs text-muted-foreground">{t('No leads')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
