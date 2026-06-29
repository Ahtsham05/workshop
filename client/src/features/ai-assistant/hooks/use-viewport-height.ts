import { useLayoutEffect, useRef, useState } from 'react'

/**
 * The shared page shell only sets `min-height` (never a hard `height`) all the way up to
 * `<body>`, so CSS percentage heights resolve to `auto` and a tall page just grows instead of
 * scrolling internally — there's no way to know in plain CSS how much space the header and any
 * conditional banners above this page actually consume. Measuring it directly with
 * `getBoundingClientRect` and re-checking on every commit (cheap — `setState` with an unchanged
 * value is a no-op) keeps this correct even when a banner mounts/unmounts later.
 */
export function useViewportHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [height, setHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    const measure = () => {
      if (!ref.current) return
      const top = ref.current.getBoundingClientRect().top
      const next = Math.max(window.innerHeight - top, 320)
      setHeight((prev) => (prev === next ? prev : next))
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  })

  return { ref, height }
}
