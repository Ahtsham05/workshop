import { useEffect, useMemo } from 'react'
import { usePermissions } from '@/context/permission-context'
import { useGetRemindersQuery, type Reminder } from '@/stores/reminder.api'
import { REMINDER_POLL_OPTIONS } from '@/stores/reminder-query-options'

/**
 * Single shared background subscription for active (pending/snoozed) reminders.
 * Powers both the in-app alarm watchdog and the sidebar due-count badge — both
 * must call THIS hook rather than useGetRemindersQuery directly, so the fixed,
 * identical args + REMINDER_POLL_OPTIONS let RTK Query coalesce every consumer
 * into exactly one poll timer / one in-flight request instead of one per caller.
 *
 * Deliberately keeps polling even while the tab is hidden/backgrounded — this
 * used to pause on hidden, which meant an alarm that came due while the user
 * was away sat silently until the next 60s tick *after* they came back (or
 * longer, if the un-pause briefly served a stale cache entry instead of
 * refetching). A reminder alarm has to actually catch you when you're away,
 * so instead: keep the 60s poll running in the background regardless of
 * visibility, and additionally force an immediate refetch the moment the tab
 * regains focus, so anything that fired while you were gone is already
 * showing (or shows within a second) rather than up to a minute later.
 */
export function useRemindersFeed() {
  const { hasPermission } = usePermissions()
  const enabled = hasPermission('viewReminders')

  const { data, isLoading, refetch } = useGetRemindersQuery(
    { limit: 200 },
    { skip: !enabled, ...REMINDER_POLL_OPTIONS },
  )

  useEffect(() => {
    if (!enabled) return
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refetch()
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
