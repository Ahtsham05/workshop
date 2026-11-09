import { useNavigate } from '@tanstack/react-router'
import { AlarmClock, BellRing, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useIsPlatformAdmin } from '@/hooks/use-signup-lead-watchdog'
import { LEAD_ALERTS_POLL_OPTIONS, useAdminGetLeadAlertsQuery } from '@/stores/admin-leads.api'
import { relativeTime } from '@/features/admin/leads/lead-utils'
import { useRefetchOnFocusIfStale } from '@/hooks/use-refetch-on-focus-if-stale'

/**
 * System admins only: new trial signups + lead follow-ups that are due, with a count badge.
 * Shares the watchdog's poll (identical args/options → one request).
 */
export function AdminLeadsBell({ className }: { className?: string }) {
  const isAdmin = useIsPlatformAdmin()
  const navigate = useNavigate()
  const { data, refetch, fulfilledTimeStamp } = useAdminGetLeadAlertsQuery(undefined, { ...LEAD_ALERTS_POLL_OPTIONS, skip: !isAdmin })
  // Back on the tab after a while → fresh signups at once; not on every focus flicker.
  useRefetchOnFocusIfStale(refetch, fulfilledTimeStamp, { enabled: isAdmin })
  if (!isAdmin) return null

  const fresh = data?.newSignups ?? []
  const freshIds = new Set(fresh.map((s) => s.organizationId))
  const due = (data?.dueFollowUps ?? []).filter((f) => !freshIds.has(f.organizationId))
  const count = fresh.length + due.length
  const open = (orgId?: string) => navigate({ to: '/admin', search: orgId ? { tab: 'leads', lead: orgId } : { tab: 'leads' } })

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant='ghost' size='icon' className={cn('relative rounded-full', className)} title='Signups & follow-ups' aria-label='Signups and follow-ups'>
          <BellRing className={cn('size-[1.2rem]', count > 0 && 'text-orange-600 dark:text-orange-400')} />
          {count > 0 && (
            <span className='absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white'>
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align='end' className='w-[min(22rem,calc(100vw-2rem))] p-0'>
        <div className='border-b px-3 py-2'>
          <p className='text-sm font-semibold'>Sales alerts</p>
          <p className='text-xs text-muted-foreground'>New trial signups and follow-ups due now</p>
        </div>
        <div className='max-h-80 overflow-y-auto'>
          {count === 0 && <p className='px-3 py-6 text-center text-sm text-muted-foreground'>All caught up 🎉</p>}
          {fresh.map((s) => (
            <button key={`s-${s.organizationId}`} type='button' onClick={() => open(s.organizationId)} className='flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted'>
              <Sparkles className='mt-0.5 size-4 shrink-0 text-sky-600' />
              <span className='min-w-0'>
                <span className='block truncate text-sm font-medium'>New signup: {s.name}</span>
                <span className='block truncate text-xs text-muted-foreground'>
                  {[s.ownerName, s.phone].filter(Boolean).join(' · ')} · {relativeTime(s.createdAt)}
                </span>
              </span>
            </button>
          ))}
          {due.map((f) => (
            <button key={`d-${f.organizationId}`} type='button' onClick={() => open(f.organizationId)} className='flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted'>
              <AlarmClock className='mt-0.5 size-4 shrink-0 text-orange-600' />
              <span className='min-w-0'>
                <span className='block truncate text-sm font-medium'>{f.name}</span>
                <span className='block truncate text-xs text-muted-foreground'>
                  {f.note || 'Follow-up due'} · due {relativeTime(f.dueAt)}
                </span>
              </span>
            </button>
          ))}
        </div>
        <div className='border-t p-2'>
          <Button variant='secondary' size='sm' className='w-full' onClick={() => open()}>Open follow-up queue</Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
