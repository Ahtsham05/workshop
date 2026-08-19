import * as React from 'react'

const MOBILE_BREAKPOINT = 1024
// Matches Tailwind's `sm` breakpoint — for call sites that need to tell phones apart
// from tablets specifically (MOBILE_BREAKPOINT above covers phones+tablets together).
const PHONE_BREAKPOINT = 640

function useMaxWidthQuery(breakpoint: number) {
  const [matches, setMatches] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const onChange = () => setMatches(window.innerWidth < breakpoint)
    mql.addEventListener('change', onChange)
    setMatches(window.innerWidth < breakpoint)
    return () => mql.removeEventListener('change', onChange)
  }, [breakpoint])

  return !!matches
}

export function useIsMobile() {
  return useMaxWidthQuery(MOBILE_BREAKPOINT)
}

export function useIsPhone() {
  return useMaxWidthQuery(PHONE_BREAKPOINT)
}
