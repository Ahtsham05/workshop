import { Children, Fragment, isValidElement, type ReactElement, type ReactNode } from 'react'
import { closestCenter, closestCorners, DndContext } from '@dnd-kit/core'
import { rectSortingStrategy, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ARRANGE_AUTOSCROLL, reorder, useArrangeSensors } from '../lib/arrange'

/**
 * One draggable tile while arranging. The whole tile is the handle, and its own content
 * ignores the pointer, so a card that is normally a link can't navigate away mid-arrange.
 */
export function SortableTile({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      {...listeners}
      className={cn(
        'relative cursor-grab touch-none select-none rounded-xl outline-2 outline-offset-2 outline-dashed outline-primary/40 active:cursor-grabbing',
        isDragging && 'z-20 scale-[1.03] opacity-90 shadow-2xl outline-primary',
        className
      )}
    >
      <div className='pointer-events-none'>{children}</div>
      <span className='pointer-events-none absolute end-1.5 top-1.5 flex size-6 items-center justify-center rounded-md bg-background/90 text-muted-foreground shadow-sm ring-1 ring-border'>
        <GripVertical className='size-3.5' />
      </span>
    </div>
  )
}

/** Flattens fragments so conditionally rendered groups of cards each become their own tile. */
function flatten(children: ReactNode): ReactElement<{ cardId?: string }>[] {
  const out: ReactElement<{ cardId?: string }>[] = []
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return
    if (child.type === Fragment) out.push(...flatten((child.props as { children?: ReactNode }).children))
    else out.push(child as ReactElement<{ cardId?: string }>)
  })
  return out
}

/**
 * A grid of cards (each child carries a `cardId`) shown in the saved order; while arranging,
 * every card can be dragged to a new place.
 */
export function SortableCardGrid({
  children,
  order,
  arranging,
  onReorder,
  className,
}: {
  children: ReactNode
  order: string[]
  arranging: boolean
  onReorder: (ids: string[]) => void
  className?: string
}) {
  const sensors = useArrangeSensors()
  const cards = flatten(children).filter((c) => c.props.cardId)
  const byId = new Map(cards.map((c) => [c.props.cardId!, c]))
  const defaultIds = cards.map((c) => c.props.cardId!)
  const rank = new Map(order.map((id, i) => [id, i]))
  const ids = [...defaultIds].sort((a, b) => {
    const ra = rank.get(a)
    const rb = rank.get(b)
    if (ra != null && rb != null) return ra - rb
    if (ra != null) return -1
    if (rb != null) return 1
    return defaultIds.indexOf(a) - defaultIds.indexOf(b)
  })

  if (!arranging) {
    return (
      <div className={className}>
        {ids.map((id) => (
          <Fragment key={id}>{byId.get(id)}</Fragment>
        ))}
      </div>
    )
  }

  return (
    <DndContext
      sensors={sensors}
      autoScroll={ARRANGE_AUTOSCROLL}
      collisionDetection={closestCenter}
      onDragEnd={(event) => {
        const next = reorder(ids, event)
        // Keep ids of cards hidden for this business so their saved place isn't lost.
        if (next) onReorder([...next, ...order.filter((id) => !next.includes(id))])
      }}
    >
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        <div className={className}>
          {ids.map((id) => (
            <SortableTile key={id} id={id}>
              {byId.get(id)}
            </SortableTile>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

/** A whole page section while arranging: a labelled bar to drag it up or down the page. */
export function SortableSection({ id, label, arranging, children }: { id: string; label: string; arranging: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: !arranging })
  if (!arranging) return <>{children}</>
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative mb-6 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/[0.03] p-2 pt-0', isDragging && 'z-30 border-primary bg-background shadow-2xl')}
    >
      <button
        ref={setActivatorNodeRef}
        type='button'
        {...attributes}
        {...listeners}
        className='-mx-2 mb-2 flex w-[calc(100%+1rem)] cursor-grab touch-none items-center gap-2 rounded-t-2xl bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary active:cursor-grabbing'
        aria-label={`Move section: ${label}`}
      >
        <GripVertical className='size-4' />
        {label}
        <span className='ms-auto font-normal text-primary/70'>Drag to move this section</span>
      </button>
      {/* Section bottom margins collapse inside the frame */}
      <div className='[&>*]:!mb-0 [&>*]:!mt-0'>{children}</div>
    </div>
  )
}

export function SortableSectionList({ ids, onReorder, children }: { ids: string[]; onReorder: (ids: string[]) => void; children: ReactNode }) {
  const sensors = useArrangeSensors()
  return (
    <DndContext
      sensors={sensors}
      autoScroll={ARRANGE_AUTOSCROLL}
      // Sections differ wildly in height; matching by corners (not centres) lets a short
      // section be dropped above a tall one.
      collisionDetection={closestCorners}
      onDragEnd={(event) => {
        const next = reorder(ids, event)
        if (next) onReorder(next)
      }}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </DndContext>
  )
}
