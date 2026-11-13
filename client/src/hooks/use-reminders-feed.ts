import { useEffect, useMemo, useRef } from 'react'
import { usePermissions } from '@/context/permission-context'
import { useGetRemindersQuery, type Reminder } from '@/stores/reminder.api'
import { REMINDER_FOCUS_STALE_MS, REMINDER_POLL_OPTIONS } from '@/stores/reminder-query-options'

/**
 * Single shared background subscription for active (pending/snoozed) reminders.
 * Powers both the in-app alarm watchdog and the sidebar due-count badge — both
 * must call THIS hook rather than useGetRemindersQuery directly, so the fixed,
 * identical args + REMINDER_POLL_OPTIONS let RTK Query coalesce every consumer
 * into exactly one poll timer / one in-flight request instead of one per caller.
 *
 * Polls every 5 minutes (REMINDER_POLL_MS), also while the tab is hidden. Alarm
 * timing does not depend on the poll: the watchdog arms a local timer for each
 * loaded reminder's dueAt. Coming back to the tab re-reads the list if it's over
 * a minute old, to catch reminders added or changed on another device.
 */
export function useRemindersFeed() {
  const { hasPermission } = usePermissions()
  const enabled = hasPermission('viewReminders')

  const { data, isLoading, refetch, fulfilledTimeStamp } = useGetRemindersQuery(
    { limit: 200 },
    { skip: !enabled, ...REMINDER_POLL_OPTIONS },
  )

  // Back on the tab: re-read only when the copy is over a minute old — flicking between
  // tabs used to fire a request every time. Alarms for reminders already loaded ring on
  // their own local timer (useReminderWatchdog), so this only catches outside changes.
  const lastFetchRef = useRef(fulfilledTimeStamp)
  lastFetchRef.current = fulfilledTimeStamp
  useEffect(() => {
    if (!enabled) return
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return
      const at = lastFetchRef.current
      if (!at || Date.now() - at >= REMINDER_FOCUS_STALE_MS) refetch()
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [enabled, refetch])

  // Memoized on `data` (stable across polls when content is unchanged, via RTK
  // Query's structural sharing) so consumers' own effects don't re-run every
  // render just because .filter() would otherwise return a fresh array each time.
  const active: Reminder[] = useMemo(
    () => (data?.results || []).filter((r) => r.status === 'pending' || r.status === 'snoozed'),
    [data],
  )

  return { active, isLoading, enabled }
}
