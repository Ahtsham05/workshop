import { Link } from '@tanstack/react-router'
import { MessagesSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useChatUnreadTotal } from '@/features/chats/hooks/use-chat-unread'

/** Header entry point for Team chat, with the live unread count (muted chats excluded). */
export function ChatHeaderButton({ className }: { className?: string }) {
  const unread = useChatUnreadTotal()
  return (
    <Button variant='ghost' size='icon' asChild className={cn('relative rounded-full', className)}>
      <Link to='/chats' title={unread ? `Team chat — ${unread} unread` : 'Team chat'} aria-label={unread ? `Team chat, ${unread} unread` : 'Team chat'}>
        <MessagesSquare className='size-[1.2rem]' />
        {unread > 0 && (
          <span className='absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white tabular-nums'>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </Link>
    </Button>
  )
}
