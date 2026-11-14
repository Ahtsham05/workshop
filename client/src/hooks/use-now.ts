import { useEffect, useState } from 'react'

/**
 * The current time, re-rendered on each wall-clock second boundary (aligned to the device
 * clock's own second tick), so a displayed clock never skips or repeats a second.
 */
export function useNow(enabled = true) {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    if (!enabled) return
    let timer: number
    const scheduleNext = () => {
      timer = window.setTimeout(() => {
        setNow(new Date())
        scheduleNext()
      }, 1000 - (Date.now() % 1000))
    }
    // Waking from sleep / a background tab throttles timers — snap back to the real time at once.
    const resync = () => {
      if (document.visibilityState === 'visible') setNow(new Date())
    }
    setNow(new Date())
    scheduleNext()
    document.addEventListener('visibilitychange', resync)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', resync)
    }
  }, [enabled])

  return now
}
