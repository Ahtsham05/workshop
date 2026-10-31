import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

/**
 * A bar pinned to the bottom of the screen, lined up with the column it is placed in.
 *
 * Why not `position: sticky`: the app shell's <main> is `overflow-auto` but not height-capped,
 * so it never scrolls itself — the document does — and a sticky child of it never sticks.
 * This renders the bar `fixed` on <body> instead (no transformed ancestor can trap it) and
 * copies the placeholder column's left/width, re-measured when the window or the column
 * resizes (sidebar open/close). The placeholder keeps the bar's height free at the end of
 * the page so the last fields can still be scrolled clear of it.
 */
export function DockedFooter({
  children,
  className,
  label,
}: {
  children: React.ReactNode
  className?: string
  /** Accessible name of the bar's region. */
  label: string
}) {
  const placeholderRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ left: number; width: number } | null>(null)
  const [height, setHeight] = useState(0)
  const shown = box !== null

  useLayoutEffect(() => {
    const column = placeholderRef.current?.parentElement
    if (!column) return
    const measure = () => {
      const r = column.getBoundingClientRect()
      setBox((prev) =>
        prev && prev.left === r.left && prev.width === r.width ? prev : { left: r.left, width: r.width }
      )
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(column)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  useLayoutEffect(() => {
    const bar = barRef.current
    if (!bar) return
    const ro = new ResizeObserver(() => setHeight(bar.offsetHeight))
    ro.observe(bar)
    setHeight(bar.offsetHeight)
    return () => ro.disconnect()
  }, [shown])

  return (
    <>
      {/* bottom-4 offset + a 16px gap above the bar */}
      <div ref={placeholderRef} style={{ height: height + 32 }} aria-hidden />
      {box &&
        createPortal(
          <div
            ref={barRef}
            role='region'
            aria-label={label}
            className={cn(
              'bg-background/95 supports-[backdrop-filter]:bg-background/80 fixed bottom-4 z-30 rounded-xl border px-4 py-3 shadow-lg backdrop-blur',
              className
            )}
            style={{ left: box.left, width: box.width }}
          >
            {children}
          </div>,
          document.body
        )}
    </>
  )
}
