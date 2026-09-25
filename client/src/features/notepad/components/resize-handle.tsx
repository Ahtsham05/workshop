import { cn } from '@/lib/utils'

interface ResizeHandleProps {
  isResizing: boolean
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void
  onPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void
  label: string
}

/** A draggable vertical divider between two panes — widens its hit area on hover so it's easy to grab without stealing space visually. */
export function ResizeHandle({ isResizing, label, ...handleProps }: ResizeHandleProps) {
  return (
    <div
      role='separator'
      aria-orientation='vertical'
      aria-label={label}
      tabIndex={-1}
      {...handleProps}
      className={cn(
        'group relative w-2 shrink-0 cursor-col-resize touch-none select-none',
        isResizing && 'z-10',
      )}
    >
      <div
        className={cn(
          'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors',
          'group-hover:bg-primary/60',
          isResizing && 'bg-primary w-0.5',
        )}
      />
    </div>
  )
}
