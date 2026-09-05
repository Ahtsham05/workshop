import type { MouseEvent, TouchEvent } from 'react'
import { cn } from '@/lib/utils'

interface ColumnResizeHandleProps {
  onResizeStart: (event: MouseEvent | TouchEvent) => void
  isResizing: boolean
}

/** Thin drag-to-resize grip pinned to a header's right edge. The hit area (6px) is wider
 *  than the visible line (1px) so it's easy to grab without looking exactly on target,
 *  the same reasoning as the reorder grip's generous activation distance. Stops the
 *  mousedown/touchstart from bubbling so it never gets mistaken for a column-reorder drag
 *  or a click on the header underneath. */
export function ColumnResizeHandle({ onResizeStart, isResizing }: ColumnResizeHandleProps) {
  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation()
        onResizeStart(e)
      }}
      onTouchStart={(e) => {
        e.stopPropagation()
        onResizeStart(e)
      }}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        'absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none',
        "after:absolute after:inset-y-1 after:right-0 after:w-px after:bg-border after:content-[''] after:transition-colors hover:after:bg-primary/70",
        isResizing && 'after:bg-primary'
      )}
    />
  )
}
