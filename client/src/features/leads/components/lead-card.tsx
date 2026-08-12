import { useDraggable } from '@dnd-kit/core'
import { Building2, Clock, MessageCircle, Phone } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { Lead, LeadUserRef } from '@/stores/lead.api'
import { SOURCE_LABELS, formatCurrency, formatTimeInStage } from '../utils/stage-config'

function repName(assignedTo: Lead['assignedTo']): string {
  if (!assignedTo) return '—'
  if (typeof assignedTo === 'string') return assignedTo.slice(0, 6)
  return (assignedTo as LeadUserRef).name || '—'
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?'
}

interface LeadCardProps {
  lead: Lead
  onClick: () => void
}

export function LeadCard({ lead, onClick }: LeadCardProps) {
  const id = lead._id || lead.id
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    data: { stage: lead.stage },
  })

  const dragStyle = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      {...listeners}
      {...attributes}
      onClick={onClick}
      className={cn(
        'group relative flex cursor-grab touch-none gap-2.5 rounded-xl border bg-card p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing',
        isDragging && 'z-50 opacity-40 shadow-lg',
      )}
    >
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold leading-tight">{lead.name}</p>
            {lead.companyName && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                <Building2 className="h-3 w-3 shrink-0" />
                {lead.companyName}
              </p>
            )}
          </div>
          {lead.estimatedValue > 0 && (
            <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
              {formatCurrency(lead.estimatedValue)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
            {SOURCE_LABELS[lead.source]}
          </Badge>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatTimeInStage(lead.stageEnteredAt)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Avatar className="h-5 w-5 ring-1 ring-border">
              <AvatarFallback className="text-[9px]">{initials(repName(lead.assignedTo))}</AvatarFallback>
            </Avatar>
            <span className="truncate text-xs text-muted-foreground">{repName(lead.assignedTo)}</span>
          </div>
          <div className="flex items-center gap-1.5 text-muted-foreground">
            {lead.whatsapp && <MessageCircle className="h-3 w-3 text-emerald-500" />}
            {lead.phone && !lead.whatsapp && <Phone className="h-3 w-3" />}
          </div>
        </div>
      </div>
    </div>
  )
}
