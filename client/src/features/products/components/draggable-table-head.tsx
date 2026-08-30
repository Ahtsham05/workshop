import type { CSSProperties, ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'
import { TableHead } from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface DraggableTableHeadProps {
  id: string
  className?: string
  colSpan?: number
  children: ReactNode
}

/** A `TableHead` that can be picked up — grab anywhere on the header — and dropped
 *  elsewhere in the row to reorder its column. See `columnOrder` in users-table.tsx for
 *  the DndContext that wraps these. Non-draggable columns (select, actions) render a
 *  plain TableHead instead.
 *
 *  The whole cell is the drag surface rather than a small dedicated handle: a tiny
 *  hover-only grip icon turned out to be too easy to miss, so users tried dragging from
 *  the visible sort button instead, which just toggled its asc/desc menu open and closed
 *  over and over instead of moving anything. dnd-kit only claims a gesture once it moves
 *  past the PointerSensor's activation distance (see users-table.tsx), so a plain click
 *  still reaches the nested sort button normally — only an actual drag is intercepted. */
export function DraggableTableHead({ id, className, colSpan, children }: DraggableTableHeadProps) {
  const { attributes, listeners, isDragging, setNodeRef, transform, transition } = useSortable({ id })

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  }

  return (
    <TableHead
      ref={setNodeRef}
      style={style}
      colSpan={colSpan}
      className={cn('group/head cursor-grab touch-none select-none active:cursor-grabbing', className)}
      {...attributes}
      {...listeners}
    >
      <div className='flex items-center gap-1'>
        <GripVertical className='h-3.5 w-3.5 shrink-0 text-muted-foreground/30 transition-opacity group-hover/head:text-muted-foreground' />
        <div className='min-w-0 flex-1'>{children}</div>
      </div>
    </TableHead>
  )
}
