import { useCallback, useEffect, useRef, useState } from 'react'

interface UseResizableWidthOptions {
  /** localStorage key — each resizable pane remembers its own width across sessions. */
  storageKey: string
  defaultWidth: number
  min: number
  max: number
  /**
   * 'ltr' (default): dragging the handle right grows the pane — for a pane on the
   * LEFT of its handle (the note list). 'rtl': dragging right SHRINKS the pane —
   * for a pane on the RIGHT of its handle (the AI panel).
   */
  direction?: 'ltr' | 'rtl'
}

const readWidth = (key: string, min: number, max: number, fallback: number): number => {
  try {
    const raw = Number(localStorage.getItem(key))
    return raw >= min && raw <= max ? raw : fallback
  } catch {
    return fallback
  }
}

/**
 * A single resizable pane's width, driven by pointer-capture drag on an adjacent
 * handle — the same technique `notepad-window.tsx` already uses for the floating
 * window's own resize grip, just applied to one pane's width instead of the whole
 * window's box. Persists per pane via `storageKey` so a chosen width survives reload.
 */
export function useResizableWidth({ storageKey, defaultWidth, min, max, direction = 'ltr' }: UseResizableWidthOptions) {
  const [width, setWidth] = useState<number>(() => readWidth(storageKey, min, max, defaultWidth))
  const [isResizing, setIsResizing] = useState(false)
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(width))
    } catch {
      /* storage full or blocked — the in-memory width still works for this session */
    }
  }, [storageKey, width])

  // The viewport can get narrower than a previously-saved width (window resize,
  // rotating a tablet) — reclamp so the pane never pushes its siblings off screen.
  useEffect(() => {
    setWidth((current) => Math.min(Math.max(current, min), max))
  }, [min, max])

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return
      dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width }
      event.currentTarget.setPointerCapture(event.pointerId)
      setIsResizing(true)
    },
    [width],
  )

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!drag || drag.pointerId !== event.pointerId) return
      event.preventDefault()
      const delta = event.clientX - drag.startX
      const signedDelta = direction === 'rtl' ? -delta : delta
      setWidth(Math.min(max, Math.max(min, drag.startWidth + signedDelta)))
    },
    [direction, max, min],
  )

  const endDrag = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    dragRef.current = null
    setIsResizing(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }, [])

  return {
    width,
    isResizing,
    handleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  }
}
