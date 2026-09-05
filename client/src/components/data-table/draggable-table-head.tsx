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

/** A `TableHead` with a small grip handle that reorders its column when dragged. See
 *  `DndTableHeader` for the DndContext that wraps these. Non-draggable columns (select,
 *  actions) render a plain TableHead instead.
 *
 *  Only the handle itself is the drag surface (via dnd-kit's `setActivatorNodeRef`) —
 *  the rest of the header, including the sort/filter button rendered in `children`,
 *  behaves like an ordinary click target. An earlier version made the whole cell
 *  draggable to make the handle easier to grab, but that meant a click aimed at the
 *  sort button could get swallowed as a drag attempt instead of opening its menu. A
 *  dedicated handle — hidden until hover so it doesn't clutter the header, but the only
 *  thing that responds to a drag gesture — avoids that conflict entirely. */
export function DraggableTableHead({ id, className, colSpan, children }: DraggableTableHeadProps) {
  const { attributes, listeners, isDragging, setNodeRef, setActivatorNodeRef, transform, transition } =
    useSortable({ id })

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    zIndex: isDragging ? 10 : undefined,
    position: 'relative',
  }

  return (
    <TableHead ref={setNodeRef} style={style} colSpan={colSpan} className={cn('group/head', className)}>
      <div className='flex items-center gap-1'>
        <button
          type='button'
          ref={setActivatorNodeRef}
          className='shrink-0 cursor-grab touch-none rounded p-0.5 text-muted-foreground/40 opacity-0 transition-opacity hover:bg-muted hover:text-muted-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring group-hover/head:opacity-100 active:cursor-grabbing'
          aria-label='Drag to reorder column'
          {...attributes}
          {...listeners}
        >
          <GripVertical className='h-3.5 w-3.5' />
        </button>
        <div className='min-w-0 flex-1'>{children}</div>
      </div>
    </TableHead>
  )
}
