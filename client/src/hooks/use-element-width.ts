import * as React from 'react'

/**
 * Tracks whether a ref'd element's own rendered width is below `threshold`, via
 * ResizeObserver. Unlike a viewport media query (see use-mobile.tsx), this reacts to the
 * element's actual box — which can get squeezed by a sidebar, a docked devtools panel, or a
 * multi-column grid layout well before the viewport itself counts as "mobile". Useful for
 * switching a data table to a stacked-card layout once its column content stops fitting,
 * regardless of why the container got narrow.
 */
export function useIsNarrower(ref: React.RefObject<HTMLElement | null>, threshold: number) {
  const [isNarrow, setIsNarrow] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width
      if (width !== undefined) setIsNarrow(width < threshold)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, threshold])

  return isNarrow
}
