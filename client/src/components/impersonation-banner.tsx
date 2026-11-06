import { useEffect, useState } from 'react'
import { LifeBuoy, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { endImpersonation, getImpersonation } from '@/lib/impersonation'

/**
 * Shown on every screen while a platform admin is inside a customer's account: an amber
 * frame around the whole window plus a floating card with who/what/time left and a one-click
 * way back. Returns to the admin automatically when the session runs out.
 */
export function ImpersonationBanner() {
  const [session] = useState(getImpersonation)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!session) return
    const id = window.setInterval(() => setNow(Date.now()), 15_000)
    const msLeft = new Date(session.expiresAt).getTime() - Date.now()
    const timeout = window.setTimeout(() => endImpersonation({ notifyServer: false }), Math.max(msLeft, 0))
    return () => {
      window.clearInterval(id)
      window.clearTimeout(timeout)
    }
  }, [session])

  if (!session) return null
  const minsLeft = Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - now) / 60_000))
  const left = minsLeft >= 60 ? `${Math.floor(minsLeft / 60)}h ${minsLeft % 60}m` : `${minsLeft}m`

  return (
    <>
      <div aria-hidden className='pointer-events-none fixed inset-0 z-[110] border-4 border-amber-500' />
      <div
        role='status'
        className='fixed bottom-24 left-3 right-3 z-[111] flex items-center gap-3 rounded-xl border border-amber-500 bg-amber-950 px-3 py-2.5 text-amber-50 shadow-2xl sm:bottom-4 sm:left-4 sm:right-auto sm:max-w-md'
      >
        <LifeBuoy className='size-5 shrink-0 text-amber-400' />
        <div className='min-w-0 flex-1'>
          <p className='text-[11px] font-medium uppercase tracking-wide text-amber-300'>Support session · ends in {left}</p>
          <p className='truncate text-sm font-semibold'>
            {session.targetName}
            {session.organizationName ? ` · ${session.organizationName}` : ''}
          </p>
        </div>
        <Button size='sm' className='shrink-0 bg-amber-500 text-amber-950 hover:bg-amber-400' onClick={() => endImpersonation()}>
          <LogOut className='mr-1 size-3.5' /> Return to admin
        </Button>
      </div>
    </>
  )
}
