import { useEffect, useState } from 'react'
import { Clock, Loader2, LogIn, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { getImpersonation, startImpersonation } from '@/lib/impersonation'
import { useAdminImpersonateUserMutation } from '@/stores/admin-impersonation.api'

export type LoginAsTarget = { id: string; name: string; email?: string; organizationName?: string }

const REASONS = ['Setup help', 'Fixing a problem they reported', 'Live demo', 'Checking their data']
const DURATIONS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
]

/** Confirm + start a time-limited, logged support session as `target`. */
export function LoginAsDialog({ target, onOpenChange }: { target: LoginAsTarget | null; onOpenChange: (open: boolean) => void }) {
  const [reason, setReason] = useState('')
  const [minutes, setMinutes] = useState(60)
  const [impersonate, { isLoading }] = useAdminImpersonateUserMutation()

  useEffect(() => {
    if (target) {
      setReason('')
      setMinutes(60)
    }
  }, [target])

  const start = async () => {
    if (!target) return
    if (getImpersonation()) {
      toast.error('You are already in a support session. Return to your admin account first.')
      return
    }
    try {
      const result = await impersonate({ userId: target.id, minutes, reason: reason.trim() }).unwrap()
      toast.success(`Opening ${target.name}'s account…`)
      startImpersonation(result, `${window.location.pathname}${window.location.search}`)
    } catch (e) {
      toast.error((e as { data?: { message?: string } })?.data?.message ?? 'Could not open this account')
    }
  }

  return (
    <Dialog open={!!target} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <LogIn className='size-5' /> Login as {target?.name}
          </DialogTitle>
          <DialogDescription>
            {target?.email}
            {target?.organizationName ? ` · ${target.organizationName}` : ''}
          </DialogDescription>
        </DialogHeader>

        <ul className='space-y-1.5 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground'>
          <li className='flex gap-2'><ShieldCheck className='size-3.5 shrink-0 text-emerald-600' /> You see exactly what they see — no password needed or revealed.</li>
          <li className='flex gap-2'><Clock className='size-3.5 shrink-0 text-amber-600' /> The session ends on its own after the time you pick; you can return any moment.</li>
          <li className='flex gap-2'><ShieldCheck className='size-3.5 shrink-0 text-emerald-600' /> Logged with your name and reason. Their password, login email and team chat stay off-limits.</li>
        </ul>

        <div className='space-y-2'>
          <Label className='text-xs'>Reason</Label>
          <div className='flex flex-wrap gap-1.5'>
            {REASONS.map((r) => (
              <button
                key={r}
                type='button'
                onClick={() => setReason(r)}
                className={cn('rounded-full border px-2.5 py-1 text-xs', reason === r ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}
              >
                {r}
              </button>
            ))}
          </div>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder='Or type a reason' maxLength={300} />
        </div>

        <div className='space-y-2'>
          <Label className='text-xs'>Session length</Label>
          <div className='grid grid-cols-3 gap-2'>
            {DURATIONS.map((d) => (
              <button
                key={d.minutes}
                type='button'
                onClick={() => setMinutes(d.minutes)}
                className={cn('rounded-md border py-1.5 text-sm', minutes === d.minutes ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={start} disabled={isLoading}>
            {isLoading ? <Loader2 className='mr-2 size-4 animate-spin' /> : <LogIn className='mr-2 size-4' />}
            Open their account
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
