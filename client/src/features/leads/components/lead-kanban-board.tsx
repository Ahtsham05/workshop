import { useMemo, useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { toast } from 'sonner'
import { useLanguage } from '@/context/language-context'
import { useChangeLeadStageMutation, type Lead, type LeadStage } from '@/stores/lead.api'
import { STAGES, isSkippedStageTransition } from '../utils/stage-config'
import { LeadKanbanColumn } from './lead-kanban-column'
import { LeadCard } from './lead-card'
import { LeadStageSkipDialog } from './lead-stage-skip-dialog'
import { LeadConvertDialog } from './lead-convert-dialog'

interface LeadKanbanBoardProps {
  leads: Lead[]
  onCardClick: (lead: Lead) => void
}

export function LeadKanbanBoard({ leads, onCardClick }: LeadKanbanBoardProps) {
  const { t } = useLanguage()
  const [changeLeadStage, { isLoading: isChangingStage }] = useChangeLeadStageMutation()
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const [activeLead, setActiveLead] = useState<Lead | null>(null)
  const [pendingSkip, setPendingSkip] = useState<{ lead: Lead; toStage: LeadStage } | null>(null)
  const [convertLead, setConvertLead] = useState<Lead | null>(null)

  const leadsByStage = useMemo(() => {
    const map: Record<LeadStage, Lead[]> = { new: [], contacted: [], qualified: [], proposal_sent: [], won: [], lost: [] }
    for (const lead of leads) {
      if (map[lead.stage]) map[lead.stage].push(lead)
    }
    return map
  }, [leads])

  const findLead = (id: string) => leads.find((l) => (l._id || l.id) === id) || null

  const handleDragStart = (event: DragStartEvent) => {
    setActiveLead(findLead(String(event.active.id)))
  }

  const applyStageChange = async (lead: Lead, toStage: LeadStage, confirmSkip?: boolean) => {
    try {
      await changeLeadStage({ id: lead._id || lead.id, stage: toStage, confirmSkip }).unwrap()
      if (toStage === 'won') {
        setConvertLead(lead)
      }
    } catch (err) {
      const status = (err as { status?: number })?.status
      if (status === 409 && !confirmSkip) {
        setPendingSkip({ lead, toStage })
        return
      }
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || t('Failed to move lead'))
    }
  }

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveLead(null)
    const { active, over } = event
    if (!over) return

    const lead = findLead(String(active.id))
    const toStage = String(over.id) as LeadStage
    if (!lead || lead.stage === toStage || !STAGES.includes(toStage)) return

    if (isSkippedStageTransition(lead.stage, toStage)) {
      setPendingSkip({ lead, toStage })
      return
    }
    applyStageChange(lead, toStage)
  }

  return (
    <>
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex h-full gap-3 overflow-x-auto pb-2">
          {STAGES.map((stage) => (
            <LeadKanbanColumn key={stage} stage={stage} leads={leadsByStage[stage]} onCardClick={onCardClick} />
          ))}
        </div>
        <DragOverlay dropAnimation={{ duration: 200, easing: 'cubic-bezier(0.18, 0.67, 0.6, 1.22)' }}>
          {activeLead && (
            <div className="w-72 rotate-2 scale-105 shadow-2xl">
              <LeadCard lead={activeLead} onClick={() => {}} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <LeadStageSkipDialog
        open={!!pendingSkip}
        fromStage={pendingSkip?.lead.stage || null}
        toStage={pendingSkip?.toStage || null}
        isLoading={isChangingStage}
        onCancel={() => setPendingSkip(null)}
        onConfirm={async () => {
          if (!pendingSkip) return
          await applyStageChange(pendingSkip.lead, pendingSkip.toStage, true)
          setPendingSkip(null)
        }}
      />

      <LeadConvertDialog open={!!convertLead} onOpenChange={(v) => !v && setConvertLead(null)} lead={convertLead} />
    </>
  )
}
