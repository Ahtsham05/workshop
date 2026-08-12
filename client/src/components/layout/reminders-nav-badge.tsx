import { isPast, isToday } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { useRemindersFeed } from '@/hooks/use-reminders-feed'

/** Live count of pending reminders due today or overdue — reads the single shared reminders poll. */
export function RemindersNavBadge() {
  const { active, enabled } = useRemindersFeed()

  if (!enabled || !active.length) return null

  const count = active.filter((r) => {
    const due = new Date(r.dueAt)
    return isToday(due) || isPast(due)
  }).length

  if (count === 0) return null

  return (
    <Badge className="ml-auto rounded-full bg-red-500 px-1.5 py-0 text-[10px] font-semibold text-white hover:bg-red-500">
      {count > 99 ? '99+' : count}
    </Badge>
  )
}
