/**
 * NotificationBell — bell icon with unseen-count badge (WhatsApp-style).
 */
import { useGetNotificationUnreadCountQuery, useMarkAllNotificationsReadMutation } from '@/stores/school.api'
import { NOTIFICATION_UNREAD_POLL_OPTIONS, PORTAL_NOTIFICATION_POLL_OPTIONS } from '@/stores/notification-query-options'
import { Bell, BellRing } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { NotificationList } from '@/components/notification-list'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

type PollOptions = typeof NOTIFICATION_UNREAD_POLL_OPTIONS | typeof PORTAL_NOTIFICATION_POLL_OPTIONS;

export function NotificationBell({ className, pollOptions }: { className?: string; pollOptions?: PollOptions }) {
  const [open, setOpen] = useState(false)
  const { data: unread, refetch } = useGetNotificationUnreadCountQuery(undefined, pollOptions || NOTIFICATION_UNREAD_POLL_OPTIONS)
  const [markAllRead] = useMarkAllNotificationsReadMutation()

  const count = unread?.count || 0

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RECEIVED') refetch();
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [refetch]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next && count > 0) markAllRead()
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className={cn('relative h-9 w-9', className)} aria-label="Notifications">
          {count > 0 ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
          {count > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <ScrollArea className="max-h-[360px]">
          <NotificationList unreadCount={count} />
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
