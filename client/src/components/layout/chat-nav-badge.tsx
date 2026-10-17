import { Badge } from '@/components/ui/badge'
import { useChatUnreadTotal } from '@/features/chats/hooks/use-chat-unread'

/** Sidebar badge for Team chat — same shared cache as the header button. */
export function ChatNavBadge() {
  const unread = useChatUnreadTotal()
  if (!unread) return null
  return (
    <Badge className='ml-auto rounded-full bg-red-500 px-1.5 py-0 text-[10px] font-semibold text-white hover:bg-red-500'>
      {unread > 99 ? '99+' : unread}
    </Badge>
  )
}
