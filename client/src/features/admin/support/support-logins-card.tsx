import { History, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatAppDateTime } from '@/lib/date-format'
import { useAdminEndImpersonationMutation, useAdminListImpersonationsQuery } from '@/stores/admin-impersonation.api'

const ENDED_LABEL = { admin: 'Returned', expired: 'Expired', admin_panel: 'Ended from admin' } as const

/** Audit trail of "Login as user" sessions for one organization. */
export function SupportLoginsCard({ organizationId }: { organizationId: string }) {
  const { data, isLoading } = useAdminListImpersonationsQuery({ organizationId, limit: 20 })
  const [endSession, { isLoading: isEnding }] = useAdminEndImpersonationMutation()
  const rows = data?.results ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2 text-base'>
          <History className='size-4' /> Support logins
        </CardTitle>
        <CardDescription>Every time a platform admin opened an account in this organization</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className='size-4 animate-spin text-muted-foreground' />
        ) : rows.length === 0 ? (
          <p className='py-2 text-sm text-muted-foreground'>No support logins yet.</p>
        ) : (
          <ul className='divide-y'>
            {rows.map((s) => (
              <li key={s.id} className='flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm'>
                <span className='font-medium'>{s.adminName || 'Admin'}</span>
                <span className='text-muted-foreground'>as {s.targetName}</span>
                {s.reason && <span className='text-muted-foreground'>· {s.reason}</span>}
                <span className='text-xs text-muted-foreground'>· {formatAppDateTime(new Date(s.startedAt))}</span>
                <span className='text-xs text-muted-foreground'>· {s.writeCount} change{s.writeCount === 1 ? '' : 's'}</span>
                <span className='ml-auto flex items-center gap-2'>
                  {s.active ? (
                    <>
                      <Badge className='bg-amber-500 text-amber-950'>Active</Badge>
                      <Button
                        size='sm'
                        variant='outline'
                        className='h-7 text-xs'
                        disabled={isEnding}
                        onClick={() => endSession(s.id).unwrap().then(() => toast.success('Session ended'))}
                      >
                        End now
                      </Button>
                    </>
                  ) : (
                    <Badge variant='outline'>{s.endedBy ? ENDED_LABEL[s.endedBy] : 'Ended'}</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
