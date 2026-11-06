import { useEffect, useMemo, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  DatabaseBackup,
  Loader2,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { formatAppDateTime } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import {
  adminLeadsApi,
  useAdminGetPurgeCandidatesQuery,
  useAdminPurgeOrganizationMutation,
  type PurgeCandidate,
} from '@/stores/admin-leads.api'
import type { AppDispatch } from '@/stores/store'
import { businessTypeLabel, relativeTime } from '../leads/lead-utils'

type Phase = 'review' | 'confirm' | 'running' | 'done'
type RowState =
  | { status: 'pending' }
  | { status: 'running' }
  | { status: 'deleted'; records: number; users: number }
  | { status: 'failed'; error: string }

const CONFIRM_WORD = 'DELETE'

const errorText = (err: unknown) => {
  const e = err as { data?: { message?: string }; error?: string; status?: unknown }
  return e?.data?.message || e?.error || (typeof e?.status === 'string' ? e.status : 'Request failed')
}

export function PurgeExpiredDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const dispatch = useDispatch<AppDispatch>()
  const { data, isLoading, isError, refetch } = useAdminGetPurgeCandidatesQuery(
    { bucket: 'trial_expired' },
    { skip: !open, refetchOnMountOrArgChange: true },
  )
  const [purge] = useAdminPurgeOrganizationMutation()
  const candidates = useMemo(() => data?.results ?? [], [data])

  const [phase, setPhase] = useState<Phase>('review')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirmText, setConfirmText] = useState('')
  const [rows, setRows] = useState<Record<string, RowState>>({})
  const [queue, setQueue] = useState<PurgeCandidate[]>([])
  const stopRef = useRef(false)
  const [stopping, setStopping] = useState(false)

  // Fresh state each time the dialog opens; everything deletable starts ticked.
  useEffect(() => {
    if (!open) return
    setPhase('review')
    setConfirmText('')
    setRows({})
    setQueue([])
    stopRef.current = false
    setStopping(false)
  }, [open])
  useEffect(() => {
    if (open) setSelected(new Set(candidates.filter((c) => !c.blocked).map((c) => c.id)))
  }, [open, candidates])

  const selectable = candidates.filter((c) => !c.blocked)
  const chosen = candidates.filter((c) => selected.has(c.id))
  const withRealData = chosen.filter((c) => c.realInvoices > 0)
  const allChecked = selectable.length > 0 && selectable.every((c) => selected.has(c.id))

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })

  const run = async () => {
    const list = chosen
    setQueue(list)
    setRows(Object.fromEntries(list.map((c) => [c.id, { status: 'pending' } as RowState])))
    setPhase('running')
    stopRef.current = false
    // One at a time: each delete is its own server-side transaction + backup, and a
    // failure on one org never affects the others.
    for (const c of list) {
      if (stopRef.current) break
      setRows((r) => ({ ...r, [c.id]: { status: 'running' } }))
      try {
        const res = await purge({ orgId: c.id, expectBucket: 'trial_expired' }).unwrap()
        setRows((r) => ({ ...r, [c.id]: { status: 'deleted', records: res.totalDocuments, users: res.usersDeleted } }))
      } catch (err) {
        setRows((r) => ({ ...r, [c.id]: { status: 'failed', error: errorText(err) } }))
      }
    }
    dispatch(adminLeadsApi.util.invalidateTags(['AdminOrganization', 'AdminUser', 'AdminPayment', 'AdminLead']))
    setPhase('done')
  }

  const states = queue.map((c) => rows[c.id] ?? { status: 'pending' })
  const finished = states.filter((s) => s.status === 'deleted' || s.status === 'failed').length
  const deleted = states.filter((s): s is Extract<RowState, { status: 'deleted' }> => s.status === 'deleted')
  const failed = queue.filter((c) => rows[c.id]?.status === 'failed')
  const notRun = queue.filter((c) => rows[c.id]?.status === 'pending').length
  const recordsDeleted = deleted.reduce((s, r) => s + r.records, 0)
  const usersDeleted = deleted.reduce((s, r) => s + r.users, 0)
  const busy = phase === 'running'

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent
        className='flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl'
        onInteractOutside={(e) => busy && e.preventDefault()}
        onEscapeKeyDown={(e) => busy && e.preventDefault()}
      >
        <DialogHeader className='space-y-1.5 border-b px-5 py-4 pr-12 text-left'>
          <DialogTitle className='flex items-center gap-2'>
            <Trash2 className='size-4 text-destructive' /> Delete expired trial organizations
          </DialogTitle>
          <DialogDescription>
            {phase === 'done'
              ? 'Clean-up finished.'
              : 'Permanently removes each organization with all of its data (products, sales, purchases, ledgers, school, manufacturing, chat…) and its user logins.'}
          </DialogDescription>
        </DialogHeader>

        {/* ── Review / confirm: choose organizations ───────────────────────── */}
        {(phase === 'review' || phase === 'confirm') && (
          <>
            <div className='min-h-0 flex-1 overflow-y-auto'>
              {isLoading ? (
                <div className='space-y-2 p-5'>{[1, 2, 3, 4].map((i) => <Skeleton key={i} className='h-12' />)}</div>
              ) : isError ? (
                <div className='flex flex-col items-center gap-2 p-10 text-center text-sm'>
                  <XCircle className='size-8 text-destructive' />
                  Couldn&apos;t load the list.
                  <Button size='sm' variant='outline' onClick={() => refetch()}>Try again</Button>
                </div>
              ) : candidates.length === 0 ? (
                <div className='flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground'>
                  <CheckCircle2 className='size-8 text-emerald-600' />
                  No organizations with an expired trial.
                </div>
              ) : (
                <>
                  <label className='sticky top-0 z-10 flex cursor-pointer items-center gap-3 border-b bg-muted/60 px-5 py-2 text-xs font-medium backdrop-blur'>
                    <Checkbox
                      checked={allChecked ? true : selected.size > 0 ? 'indeterminate' : false}
                      onCheckedChange={(v) => setSelected(v ? new Set(selectable.map((c) => c.id)) : new Set())}
                      disabled={phase === 'confirm'}
                    />
                    {selected.size} of {candidates.length} selected
                  </label>
                  <ul className='divide-y'>
                    {candidates.map((c) => (
                      <li key={c.id}>
                        <label
                          className={cn(
                            'flex cursor-pointer items-start gap-3 px-5 py-2.5 hover:bg-muted/40',
                            (c.blocked || phase === 'confirm') && 'cursor-default',
                            c.blocked && 'opacity-60',
                          )}
                        >
                          <Checkbox
                            className='mt-0.5'
                            checked={selected.has(c.id)}
                            disabled={!!c.blocked || phase === 'confirm'}
                            onCheckedChange={(v) => toggle(c.id, !!v)}
                          />
                          <div className='min-w-0 flex-1'>
                            <div className='flex flex-wrap items-center gap-x-2 gap-y-1'>
                              <span className='truncate text-sm font-medium'>{c.name}</span>
                              {c.realInvoices > 0 && (
                                <Badge variant='outline' className='h-5 gap-1 border-amber-300 bg-amber-50 px-1.5 text-[10px] text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'>
                                  <AlertTriangle className='size-3' /> {c.realInvoices} real invoice{c.realInvoices === 1 ? '' : 's'}
                                </Badge>
                              )}
                              {c.blocked && <Badge variant='outline' className='h-5 px-1.5 text-[10px]'>{c.blocked}</Badge>}
                            </div>
                            <p className='truncate text-xs text-muted-foreground'>
                              {c.owner?.email || c.phone || '—'} · {businessTypeLabel(c.businessType)} · {c.users} user{c.users === 1 ? '' : 's'}
                            </p>
                          </div>
                          <div className='hidden shrink-0 text-right text-[11px] text-muted-foreground sm:block'>
                            <p title={formatAppDateTime(new Date(c.createdAt))}>joined {relativeTime(c.createdAt)}</p>
                            {c.periodEnd && <p>trial ended {relativeTime(c.periodEnd)}</p>}
                          </div>
                        </label>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>

            {phase === 'confirm' && (
              <div className='space-y-3 border-t bg-destructive/5 px-5 py-4'>
                <div className='flex gap-2 text-sm'>
                  <ShieldAlert className='mt-0.5 size-4 shrink-0 text-destructive' />
                  <div className='space-y-1'>
                    <p className='font-medium'>
                      {chosen.length} organization{chosen.length === 1 ? '' : 's'} and every record they own will be deleted. This cannot be undone from the app.
                    </p>
                    {withRealData.length > 0 && (
                      <p className='text-amber-700 dark:text-amber-300'>
                        {withRealData.map((c) => c.name).join(', ')} {withRealData.length === 1 ? 'has' : 'have'} real (non-sample) invoices.
                      </p>
                    )}
                    <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
                      <DatabaseBackup className='size-3.5' /> A full backup of each organization is saved on the server before it is deleted. Users who also belong to another organization, and system admins, are kept.
                    </p>
                  </div>
                </div>
                <div className='space-y-1.5'>
                  <label htmlFor='purge-confirm' className='text-xs font-medium'>
                    Type <span className='font-mono font-semibold'>{CONFIRM_WORD}</span> to confirm
                  </label>
                  <Input
                    id='purge-confirm'
                    autoFocus
                    autoComplete='off'
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && confirmText === CONFIRM_WORD && run()}
                    className='font-mono'
                  />
                </div>
              </div>
            )}

            <DialogFooter className='gap-2 border-t px-5 py-3'>
              {phase === 'review' ? (
                <>
                  <Button variant='outline' onClick={() => onOpenChange(false)}>Cancel</Button>
                  <Button variant='destructive' disabled={chosen.length === 0} onClick={() => setPhase('confirm')}>
                    <Trash2 className='mr-1.5 size-4' /> Delete {chosen.length} organization{chosen.length === 1 ? '' : 's'}…
                  </Button>
                </>
              ) : (
                <>
                  <Button variant='outline' onClick={() => { setPhase('review'); setConfirmText('') }}>Back</Button>
                  <Button variant='destructive' disabled={confirmText !== CONFIRM_WORD} onClick={run}>
                    <Trash2 className='mr-1.5 size-4' /> Permanently delete {chosen.length}
                  </Button>
                </>
              )}
            </DialogFooter>
          </>
        )}

        {/* ── Running / done: live progress + result ───────────────────────── */}
        {(phase === 'running' || phase === 'done') && (
          <>
            <div className='space-y-3 border-b px-5 py-4'>
              {phase === 'done' ? (
                <div className='grid grid-cols-3 gap-2 text-center'>
                  <div className='rounded-lg border bg-emerald-50 p-2.5 dark:bg-emerald-950/30'>
                    <p className='text-lg font-semibold tabular-nums text-emerald-700 dark:text-emerald-300'>{deleted.length}</p>
                    <p className='text-[11px] text-muted-foreground'>organizations deleted</p>
                  </div>
                  <div className='rounded-lg border p-2.5'>
                    <p className='text-lg font-semibold tabular-nums'>{recordsDeleted.toLocaleString()}</p>
                    <p className='text-[11px] text-muted-foreground'>records · {usersDeleted} user{usersDeleted === 1 ? '' : 's'}</p>
                  </div>
                  <div className={cn('rounded-lg border p-2.5', failed.length > 0 && 'bg-red-50 dark:bg-red-950/30')}>
                    <p className={cn('text-lg font-semibold tabular-nums', failed.length > 0 && 'text-red-700 dark:text-red-300')}>
                      {failed.length + notRun}
                    </p>
                    <p className='text-[11px] text-muted-foreground'>{notRun ? 'failed / stopped' : 'failed'}</p>
                  </div>
                </div>
              ) : (
                <div className='space-y-1.5'>
                  <div className='flex items-center justify-between text-xs'>
                    <span className='flex items-center gap-1.5 font-medium'>
                      <Loader2 className='size-3.5 animate-spin' />
                      {stopping ? 'Stopping after this one…' : `Deleting ${queue.find((c) => rows[c.id]?.status === 'running')?.name ?? '…'}`}
                    </span>
                    <span className='tabular-nums text-muted-foreground'>{finished} / {queue.length}</span>
                  </div>
                  <Progress value={queue.length ? (finished / queue.length) * 100 : 0} />
                  <p className='text-[11px] text-muted-foreground'>Keep this window open until it finishes.</p>
                </div>
              )}
            </div>
            <ul className='min-h-0 flex-1 divide-y overflow-y-auto'>
              {queue.map((c) => {
                const s = rows[c.id] ?? { status: 'pending' }
                return (
                  <li key={c.id} className='flex items-start gap-3 px-5 py-2'>
                    {s.status === 'pending' && <Circle className='mt-0.5 size-4 shrink-0 text-muted-foreground/40' />}
                    {s.status === 'running' && <Loader2 className='mt-0.5 size-4 shrink-0 animate-spin text-primary' />}
                    {s.status === 'deleted' && <CheckCircle2 className='mt-0.5 size-4 shrink-0 text-emerald-600' />}
                    {s.status === 'failed' && <XCircle className='mt-0.5 size-4 shrink-0 text-destructive' />}
                    <div className='min-w-0 flex-1'>
                      <p className='truncate text-sm'>{c.name}</p>
                      {s.status === 'failed' && <p className='text-xs text-destructive'>{s.error}</p>}
                      {s.status === 'pending' && phase === 'done' && <p className='text-xs text-muted-foreground'>Not deleted (stopped)</p>}
                    </div>
                    {s.status === 'deleted' && (
                      <span className='shrink-0 text-[11px] tabular-nums text-muted-foreground'>{s.records.toLocaleString()} records</span>
                    )}
                  </li>
                )
              })}
            </ul>
            <DialogFooter className='gap-2 border-t px-5 py-3'>
              {phase === 'running' ? (
                <Button variant='outline' disabled={stopping} onClick={() => { stopRef.current = true; setStopping(true) }}>
                  Stop after current
                </Button>
              ) : (
                <Button onClick={() => onOpenChange(false)}>Done</Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
