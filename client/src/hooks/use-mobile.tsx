import * as React from 'react'
import { APP_ZOOM_EVENT, appZoomFactor } from '@/lib/appearance'

const MOBILE_BREAKPOINT = 1024
// Matches Tailwind's `sm` breakpoint — for call sites that need to tell phones apart
// from tablets specifically (MOBILE_BREAKPOINT above covers phones+tablets together).
const PHONE_BREAKPOINT = 640

/**
 * True while the window is narrower than `breakpoint` (in CSS px at 100% zoom).
 * The breakpoint grows/shrinks with Settings → Appearance → Zoom, matching the CSS
 * breakpoints (container queries in rem) — so at 80% a 900px-wide window counts as
 * desktop, just like with the browser zoomed out.
 */
function useMaxWidthQuery(breakpoint: number) {
  const [matches, setMatches] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const update = () => setMatches(window.innerWidth < breakpoint * appZoomFactor())
    window.addEventListener('resize', update)
    window.addEventListener(APP_ZOOM_EVENT, update)
    update()
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener(APP_ZOOM_EVENT, update)
    }
  }, [breakpoint])

  return !!matches
}

export function useIsMobile() {
  return useMaxWidthQuery(MOBILE_BREAKPOINT)
}

export function useIsPhone() {
  return useMaxWidthQuery(PHONE_BREAKPOINT)
}

/** Below Tailwind's `xl` (1280px) — where the invoice/purchase forms stop being three columns. */
export function useIsBelowXl() {
  return useMaxWidthQuery(1280)
}
