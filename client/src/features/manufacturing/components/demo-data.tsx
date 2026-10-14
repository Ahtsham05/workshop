import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  FlaskConical,
  Loader2,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { useDispatch } from 'react-redux'
import { toast } from 'sonner'
import {
  refreshAfterDemoData,
  useGetDemoDataStatusQuery,
  useLoadDemoDataMutation,
  useRemoveDemoDataMutation,
  type DemoDataStatus,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { ConfirmDialog } from '@/components/confirm-dialog'

/**
 * Load / reload / remove the manufacturing demo factory (server:
 * services/manufacturing/demoData.service.js) for the current branch. Loading runs in the
 * background on the server (it takes a minute or two against a remote database); the
 * status query polls while it runs and refreshes every manufacturing view when it ends.
 */

type Phase = 'none' | 'running' | 'broken' | 'loaded'

const phaseOf = (status?: DemoDataStatus): Phase => {
  if (!status) return 'none'
  const state = status.job?.state
  if (state === 'running') return 'running'
  if (state === 'failed' || state === 'interrupted') return 'broken'
  // Products without any orders: a load that stopped part-way before jobs were tracked.
  if (status.hasDemoData && status.orders === 0) return 'broken'
  return status.hasDemoData ? 'loaded' : 'none'
}

function useDemoData() {
  const { t } = useLanguage()
  const dispatch = useDispatch()
  const [running, setRunning] = useState(false)
  const { data: status, isLoading } = useGetDemoDataStatusQuery(undefined, {
    pollingInterval: running ? 2000 : 0,
  })
  const phase = phaseOf(status)
  const [load, { isLoading: starting }] = useLoadDemoDataMutation()
  const [remove, { isLoading: removing }] = useRemoveDemoDataMutation()

  useEffect(() => setRunning(phase === 'running'), [phase])

  // Announce the end of a load this page watched, and refresh everything it changed.
  const previous = useRef<Phase | null>(null)
  useEffect(() => {
    if (previous.current === 'running' && phase !== 'running') {
      dispatch(refreshAfterDemoData() as never)
      const job = status?.job
      if (job?.state === 'done') {
        toast.success(
          t(
            'Demo data loaded: {{orders}} production orders, {{boms}} BOMs, {{products}} products',
            {
              orders: job.result?.orders ?? 0,
              boms: job.result?.boms ?? 0,
              products: job.result?.products ?? 0,
            }
          )
        )
      } else if (job) {
        toast.error(job.error || t('Loading demo data did not finish'))
      }
    }
    previous.current = phase
  }, [phase, status, dispatch, t])

  const start = async (reload: boolean) => {
    try {
      await load(reload ? { reload: true } : undefined).unwrap()
      setRunning(true)
      return true
    } catch (err) {
      toast.error(getErrorMessage(err, t('Failed to load demo data')))
      return false
    }
  }

  const removeDemo = async () => {
    try {
      const result = await remove().unwrap()
      toast.success(
        result.productsKept
          ? t(
              'Demo data removed — {{kept}} demo products kept because other BOMs or orders use them',
              { kept: result.productsKept }
            )
          : t('Demo data removed')
      )
      return true
    } catch (err) {
      toast.error(getErrorMessage(err, t('Failed to remove demo data')))
      return false
    }
  }

  return { status, isLoading, phase, start, removeDemo, starting, removing }
}

type ConfirmKind = 'load' | 'reload' | 'remove'

function DemoConfirm({
  kind,
  onClose,
  onConfirm,
  isLoading,
}: {
  kind: ConfirmKind | null
  onClose: () => void
  onConfirm: (kind: ConfirmKind) => void
  isLoading: boolean
}) {
  const { t } = useLanguage()
  const copy: Record<
    ConfirmKind,
    { title: string; desc: string[]; confirm: string }
  > = {
    load: {
      title: t('Load manufacturing demo data?'),
      desc: [
        t(
          'Adds a sample fan factory to this branch: 24 products with opening stock (in the "Manufacturing Demo" category), 8 BOMs and 15 production orders exercising material issue, returns, output reporting, quality inspection, rework and scrap over the last five weeks.'
        ),
        t(
          'It runs on the server and takes a minute or two — you can keep working meanwhile. Remove it any time from Manufacturing → Settings.'
        ),
      ],
      confirm: t('Load demo data'),
    },
    reload: {
      title: t('Reload manufacturing demo data?'),
      desc: [
        t(
          'Removes the current demo data — including any BOMs or production orders you created for demo products — and loads a fresh, complete copy.'
        ),
        t('Takes a minute or two. Your other records are not touched.'),
      ],
      confirm: t('Reload demo data'),
    },
    remove: {
      title: t('Remove manufacturing demo data?'),
      desc: [
        t(
          'Deletes the demo products, BOMs and production orders from this branch — including any BOMs or orders you created for demo products — together with their material issues, receipts and scrap.'
        ),
        t('Your other records are not touched.'),
      ],
      confirm: t('Remove demo data'),
    },
  }
  const current = kind ? copy[kind] : copy.load
  return (
    <ConfirmDialog
      open={!!kind}
      onOpenChange={(open) => !open && onClose()}
      destructive={kind === 'remove'}
      title={current.title}
      desc={
        <div className='space-y-2'>
          {current.desc.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      }
      confirmText={
        isLoading ? (
          <>
            <Loader2 className='mr-2 h-4 w-4 animate-spin' />
            {current.confirm}
          </>
        ) : (
          current.confirm
        )
      }
      isLoading={isLoading}
      handleConfirm={() => kind && onConfirm(kind)}
    />
  )
}

function JobProgress({ status }: { status: DemoDataStatus }) {
  const { t } = useLanguage()
  const job = status.job
  if (!job) return null
  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between gap-3 text-sm'>
        <span className='flex min-w-0 items-center gap-2'>
          <Loader2 className='h-4 w-4 shrink-0 animate-spin' />
          <span className='truncate'>
            {job.action === 'reload'
              ? t('Reloading demo data…')
              : t('Loading demo data…')}{' '}
            <span className='text-muted-foreground'>{job.message}</span>
          </span>
        </span>
        <span className='font-medium tabular-nums'>{job.percent}%</span>
      </div>
      <Progress value={job.percent} />
      <p className='text-muted-foreground text-xs'>
        {t(
          'This takes a minute or two and keeps running on the server — you can leave this page.'
        )}
      </p>
    </div>
  )
}

function BrokenNotice({ status }: { status: DemoDataStatus }) {
  const { t } = useLanguage()
  const reason =
    status.job?.state === 'failed'
      ? status.job.error
      : status.job?.state === 'interrupted'
        ? t('The server restarted while it was running.')
        : t('Only part of it was loaded.')
  return (
    <div className='border-destructive/40 bg-destructive/5 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm'>
      <AlertTriangle className='text-destructive mt-0.5 h-4 w-4 shrink-0' />
      <span>
        <span className='font-medium'>{t('The demo data is incomplete.')}</span>{' '}
        {reason} {t('Reload it to get the full, consistent set.')}
      </span>
    </div>
  )
}

const COUNT_LABELS = [
  ['products', 'products'],
  ['boms', 'BOMs'],
  ['orders', 'orders'],
  ['issues', 'material issues'],
  ['returns', 'material returns'],
  ['outputs', 'output reports'],
  ['receipts', 'receipts'],
  ['scrap', 'scrap records'],
] as const

/** Settings card: what the demo contains, plus load / reload / remove. */
export function DemoDataCard() {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('manageManufacturingSettings')
  const { status, isLoading, phase, start, removeDemo, starting, removing } =
    useDemoData()
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null)

  const run = async (kind: ConfirmKind) => {
    const ok =
      kind === 'remove' ? await removeDemo() : await start(kind === 'reload')
    if (ok) setConfirm(null)
  }

  return (
    <Card className='lg:col-span-2'>
      <CardHeader className='flex flex-row flex-wrap items-start justify-between gap-3 space-y-0'>
        <div className='min-w-0 flex-1 space-y-1.5'>
          <CardTitle className='flex items-center gap-2 text-base'>
            <FlaskConical className='h-4 w-4' />
            {t('Demo data')}
            {phase === 'loaded' && (
              <Badge variant='secondary'>{t('Loaded')}</Badge>
            )}
          </CardTitle>
          <CardDescription>
            {t(
              'A sample ceiling-fan factory for exploring the module: a 3-level BOM (fan → motor → stator → copper wire), a batch BOM, locked and inactive versions, optional and alternative components, and orders in every status — issuing, returning, over-issuing, reporting output, inspecting at QC, reworking and scrapping material, with overdue work and material shortages.'
            )}
          </CardDescription>
        </div>
        {canManage && !isLoading && phase !== 'running' && (
          <div className='flex flex-wrap gap-2 max-sm:w-full'>
            {phase === 'none' ? (
              <Button
                className='max-sm:w-full'
                disabled={starting}
                onClick={() => setConfirm('load')}
              >
                <FlaskConical className='mr-2 h-4 w-4' />
                {t('Load demo data')}
              </Button>
            ) : (
              <>
                <Button
                  variant={phase === 'broken' ? 'default' : 'outline'}
                  className='max-sm:flex-1'
                  disabled={starting || removing}
                  onClick={() => setConfirm('reload')}
                >
                  <RotateCcw className='mr-2 h-4 w-4' />
                  {t('Reload demo data')}
                </Button>
                <Button
                  variant='outline'
                  className='text-destructive max-sm:flex-1'
                  disabled={starting || removing}
                  onClick={() => setConfirm('remove')}
                >
                  <Trash2 className='mr-2 h-4 w-4' />
                  {t('Remove')}
                </Button>
              </>
            )}
          </div>
        )}
      </CardHeader>

      {status && phase !== 'none' && (
        <CardContent className='space-y-3'>
          {phase === 'running' && <JobProgress status={status} />}
          {phase === 'broken' && <BrokenNotice status={status} />}
          {phase !== 'running' && (
            <div className='flex flex-wrap gap-2'>
              {COUNT_LABELS.map(([key, label]) => (
                <Badge key={key} variant='outline' className='font-normal'>
                  <span className='mr-1 font-semibold tabular-nums'>
                    {status[key]}
                  </span>
                  {t(label)}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      )}

      <DemoConfirm
        kind={confirm}
        onClose={() => setConfirm(null)}
        onConfirm={run}
        isLoading={starting || removing}
      />
    </Card>
  )
}

/**
 * Dashboard strip: invites loading the demo while the branch has no production orders,
 * shows progress while it loads, and flags demo data (or an incomplete load) afterwards.
 */
export function DemoDataBanner({ hasOrders }: { hasOrders: boolean }) {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('manageManufacturingSettings')
  const { status, phase, start, starting } = useDemoData()
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null)

  if (!status) return null

  const settingsLink = canManage && (
    <Link
      to={'/manufacturing/settings' as never}
      className='text-primary shrink-0 font-medium hover:underline'
    >
      {t('Manage in Settings')}
    </Link>
  )

  if (phase === 'running') {
    return (
      <div className='rounded-xl border border-dashed px-4 py-3'>
        <JobProgress status={status} />
      </div>
    )
  }

  if (phase === 'broken') {
    return (
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='min-w-0 flex-1'>
          <BrokenNotice status={status} />
        </div>
        {settingsLink}
      </div>
    )
  }

  if (phase === 'loaded') {
    return (
      <div className='flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-4 py-2.5 text-sm'>
        <span className='text-muted-foreground flex items-center gap-2'>
          <FlaskConical className='h-4 w-4 shrink-0' />
          {t('This branch includes manufacturing demo data.')}
        </span>
        {settingsLink}
      </div>
    )
  }

  if (hasOrders || !canManage) return null

  return (
    <div className='flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed px-4 py-4'>
      <div className='flex items-start gap-3'>
        <div className='bg-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-full'>
          <FlaskConical className='text-muted-foreground h-4 w-4' />
        </div>
        <div>
          <p className='font-medium'>{t('Want to see it in action first?')}</p>
          <p className='text-muted-foreground text-sm'>
            {t(
              'Load a sample fan factory with BOMs, production orders, stock moves and scrap — remove it any time from Settings.'
            )}
          </p>
        </div>
      </div>
      <Button
        className='max-sm:w-full'
        disabled={starting}
        onClick={() => setConfirm('load')}
      >
        <FlaskConical className='mr-2 h-4 w-4' />
        {t('Load demo data')}
      </Button>
      <DemoConfirm
        kind={confirm}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          if (await start(false)) setConfirm(null)
        }}
        isLoading={starting}
      />
    </div>
  )
}
