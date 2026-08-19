import { isToday, isYesterday, isValid, differenceInCalendarDays } from 'date-fns'
import type { AiConversation } from '@/stores/aiAssistant.api'

export interface ConversationGroup {
  label: string
  items: AiConversation[]
}

/** Buckets conversations into the standard "Today / Yesterday / Previous 7 days / Older" history shape. */
export function groupConversationsByDate(conversations: AiConversation[]): ConversationGroup[] {
  const buckets: Record<'today' | 'yesterday' | 'week' | 'older', AiConversation[]> = {
    today: [],
    yesterday: [],
    week: [],
    older: [],
  }

  for (const conv of conversations) {
    const date = new Date(conv.lastMessageAt)
    if (!isValid(date)) {
      buckets.older.push(conv)
      continue
    }
    if (isToday(date)) buckets.today.push(conv)
    else if (isYesterday(date)) buckets.yesterday.push(conv)
    else if (differenceInCalendarDays(new Date(), date) <= 7) buckets.week.push(conv)
    else buckets.older.push(conv)
  }

  return [
    { label: 'Today', items: buckets.today },
    { label: 'Yesterday', items: buckets.yesterday },
    { label: 'Previous 7 days', items: buckets.week },
    { label: 'Older', items: buckets.older },
  ].filter((group) => group.items.length > 0)
}
