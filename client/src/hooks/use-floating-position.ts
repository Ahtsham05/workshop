import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type MouseEvent } from 'react'

/**
 * Lets a fixed floating button (assistant launcher, minimized Calculator / Notes pills) be
 * dragged anywhere on screen and stay there. A short press is still a normal click; only a
 * real move (> 5px) turns into a drag, and the click that ends a drag is swallowed.
 *
 * The position is kept per device (screens differ), measured from the corner the button is
 * anchored to, so it stays put when the window is resized and is clamped back on screen.
 * The bottom offset always adds the heights of the fixed notification / install banners.
 */

type Anchor = 'right' | 'left'

interface Position {
  /** Distance from the anchored side edge, px. */
  side: number
  /** Distance from the bottom edge (above the banners), px. */
  bottom: number
}

const EDGE = 8
const DRAG_THRESHOLD = 5
const BANNERS = 'var(--push-banner-height, 0px) + var(--pwa-banner-height, 0px)'

function read(key: string): Position | null {
  try {
    const raw = localStorage.getItem(`floating-pos:${key}`)
    const parsed = raw ? (JSON.parse(raw) as Position) : null
    return parsed && Number.isFinite(parsed.side) && Number.isFinite(parsed.bottom) ? parsed : null
  } catch {
    return null
  }
}

function write(key: string, position: Position | null) {
  try {
    if (position) localStorage.setItem(`floating-pos:${key}`, JSON.stringify(position))
    else localStorage.removeItem(`floating-pos:${key}`)
  } catch {
    /* private mode — the position just isn't remembered */
  }
}

export function useFloatingPosition(key: string, defaults: Position, anchor: Anchor = 'right') {
  const [position, setPosition] = useState<Position>(() => read(key) ?? defaults)
  const [dragging, setDragging] = useState(false)
  const elRef = useRef<HTMLElement | null>(null)
  const drag = useRef<{ id: number; x: number; y: number; start: Position; moved: boolean } | null>(null)
  const swallowClick = useRef(false)

  const clamp = useCallback((p: Position): Position => {
    const el = elRef.current
    const w = el?.offsetWidth ?? 56
    const h = el?.offsetHeight ?? 56
    return {
      side: Math.round(Math.min(Math.max(p.side, EDGE), Math.max(EDGE, window.innerWidth - w - EDGE))),
      bottom: Math.round(Math.min(Math.max(p.bottom, EDGE), Math.max(EDGE, window.innerHeight - h - EDGE - 64))),
    }
  }, [])

  // Back on screen after a resize / rotation.
  useEffect(() => {
    const onResize = () => setPosition((p) => clamp(p))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [clamp])

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0) return
      elRef.current = e.currentTarget
      drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: position, moved: false }
      // Grab the pointer straight away: a quick flick leaves a small pill within the first
      // mouse event, and without capture the move would never reach it. Capturing on the
      // button itself still lets a plain press end in a normal click.
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [position]
  )

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      const dx = e.clientX - d.x
      const dy = e.clientY - d.y
      if (!d.moved) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return
        d.moved = true
        setDragging(true)
      }
      e.preventDefault()
      setPosition(clamp({ side: anchor === 'right' ? d.start.side - dx : d.start.side + dx, bottom: d.start.bottom - dy }))
    },
    [anchor, clamp]
  )

  const end = useCallback(
    (e: PointerEvent<HTMLElement>) => {
      const d = drag.current
      if (!d || d.id !== e.pointerId) return
      drag.current = null
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      if (!d.moved) return
      swallowClick.current = true
      setDragging(false)
      setPosition((p) => {
        write(key, p)
        return p
      })
    },
    [key]
  )

  // Capture phase, before the button's own onClick (and Radix's trigger toggle).
  const onClickCapture = useCallback((e: MouseEvent<HTMLElement>) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const reset = useCallback(() => {
    write(key, null)
    setPosition(defaults)
  }, [key, defaults])

  const style: CSSProperties = {
    position: 'fixed',
    [anchor]: position.side,
    bottom: `calc(${position.bottom}px + ${BANNERS})`,
    touchAction: 'none',
    cursor: dragging ? 'grabbing' : undefined,
  }

  return {
    style,
    position,
    dragging,
    reset,
    handlers: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, onClickCapture },
  }
}
