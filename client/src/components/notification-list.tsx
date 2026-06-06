/**
 * Shared notification list — used by NotificationBell popover and portal tabs.
 */
import { useGetMyNotificationsQuery, useMarkAllNotificationsReadMutation } from '@/stores/school.api'
import { Bell, AlertTriangle, CalendarDays, GraduationCap, Wallet, Megaphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function timeAgo(date?: string): string {
  if (!date) return ''
  const d = new Date(date).getTime()
  const diff = Math.max(0, Date.now() - d)
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(date).toLocaleDateString()
}

export const TYPE_META: Record<string, { icon: typeof Bell; color: string }> = {
  general: { icon: Megaphone, color: 'bg-blue-100 text-blue-600' },
  fee: { icon: Wallet, color: 'bg-emerald-100 text-emerald-600' },
  exam: { icon: GraduationCap, color: 'bg-violet-100 text-violet-600' },
  event: { icon: CalendarDays, color: 'bg-amber-100 text-amber-600' },
  urgent: { icon: AlertTriangle, color: 'bg-red-100 text-red-600' },
}

const EMPTY_NOTIFICATIONS: never[] = []

type NotificationListProps = {
  limit?: number
  className?: string
  showHeader?: boolean
  unreadCount?: number
  onMarkAllRead?: () => void
}

export function NotificationList({
  limit = 30,
  className,
  showHeader = true,
  unreadCount = 0,
  onMarkAllRead,
}: NotificationListProps) {
  const { data: items, isFetching } = useGetMyNotificationsQuery(
    { limit },
    { refetchOnFocus: false, refetchOnReconnect: false },
  )
  const [markAllRead] = useMarkAllNotificationsReadMutation()
  const list = (items ?? EMPTY_NOTIFICATIONS) as any[]

  const handleMarkAll = () => {
    markAllRead()
    onMarkAllRead?.()
  }

  return (
    <div className={cn('flex flex-col', className)}>
      {showHeader && (
        <div className="flex items-center justify-between border-b px-4 py-2.5">
          <p className="text-sm font-semibold">Notifications</p>
          {unreadCount > 0 && (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={handleMarkAll}>
              Mark all read
            </Button>
          )}
        </div>
      )}
      {isFetching && list.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : list.length === 0 ? (
        <div className="py-10 text-center">
          <Bell className="mx-auto mb-2 h-8 w-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">No notifications yet</p>
        </div>
      ) : (
        <ul className="divide-y">
          {list.map((n: any) => {
            const meta = TYPE_META[n.type] || TYPE_META.general
            const Icon = meta.icon
            return (
              <li key={n._id || n.id} className={cn('flex gap-3 px-4 py-3', !n.read && 'bg-blue-50/60 dark:bg-blue-950/20')}>
                <div className={cn('mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full', meta.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium leading-snug">{n.title}</p>
                    {!n.read && <span className="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" />}
                  </div>
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">{n.message}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/70">{timeAgo(n.createdAt)}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
