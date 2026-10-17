import { useEffect, useRef, useState } from 'react'
import { Loader2, FlaskConical, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import ContentSection from '../components/content-section'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { usePermissions } from '@/context/permission-context'
import { useDispatch } from 'react-redux'
import type { AppDispatch } from '@/stores/store'
import { resetAllApiCaches } from '@/stores/reset-all-apis'
import {
  useGetDemoDataStatusQuery,
  useGetMyOrganizationQuery,
  useRemoveDemoDataMutation,
  useResetDemoDataMutation,
  type DemoDataStatus,
} from '@/stores/organization.api'

const COUNT_LABELS: [keyof DemoDataStatus['counts'], string][] = [
  ['products', 'Products'],
  ['categories', 'Categories'],
  ['customers', 'Customers'],
  ['suppliers', 'Suppliers'],
  ['invoices', 'Invoices'],
  ['purchases', 'Purchases'],
  ['expenses', 'Expenses'],
]

const errorMessage = (err: unknown, fallback: string) =>
  (err as { data?: { message?: string } })?.data?.message || fallback

export default function DemoDataSettings() {
  const dispatch = useDispatch<AppDispatch>()
  const { hasPermission } = usePermissions()
  const canManage = hasPermission('manageBusinessProfile')
  const { data: org, isLoading } = useGetMyOrganizationQuery()
  const [pollMs, setPollMs] = useState(0)
  const { data: status, isLoading: statusLoading } = useGetDemoDataStatusQuery(org?.id ?? '', {
    skip: !org?.id || !canManage,
    pollingInterval: pollMs,
  })
  const [resetDemoData, { isLoading: resetting }] = useResetDemoDataMutation()
  const [removeDemoData, { isLoading: removing }] = useRemoveDemoDataMutation()
  const [confirm, setConfirm] = useState<'reset' | 'remove' | null>(null)

  // Remove is a single request that returns when it's done. Only a reset (which reseeds
  // through the real create services and takes a minute or two) — or a job started from
  // another tab — runs in the background; poll gently while one is running, then drop
  // every cached list so products, invoices, reports etc. refetch.
  const job = status?.job ?? null
  const wasRunning = useRef(false)
  useEffect(() => {
    setPollMs(job ? 5000 : 0)
    if (job) {
      wasRunning.current = true
    } else if (wasRunning.current && status) {
      wasRunning.current = false
      resetAllApiCaches(dispatch)
      toast.success(status.total === 0 ? 'Demo data removed' : 'Demo data is ready')
    }
  }, [job, status, dispatch])

  const remove = async () => {
    if (!org) return
    try {
      await removeDemoData(org.id).unwrap()
      setConfirm(null)
      // Products, invoices, reports, balances… all changed — refetch everything.
      resetAllApiCaches(dispatch)
      toast.success('Demo data removed')
    } catch (err) {
      setConfirm(null)
      toast.error(errorMessage(err, 'Failed to remove demo data. Nothing was half-removed — try again.'))
    }
  }

  const reset = async () => {
    if (!org) return
    try {
      const result = await resetDemoData(org.id).unwrap()
      toast.success(result.message)
      wasRunning.current = true
      setPollMs(5000)
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to reset demo data'))
    }
    setConfirm(null)
  }

  const desc = 'Sample data that was loaded when this account was created.'

  if (isLoading || !org || (canManage && statusLoading)) {
    return (
      <ContentSection title='Demo Data' desc={desc}>
        <div className='flex items-center justify-center py-12'>
          <Loader2 className='h-6 w-6 animate-spin' />
        </div>
      </ContentSection>
    )
  }

  if (!canManage) {
    return (
      <ContentSection title='Demo Data' desc={desc}>
        <Alert>
          <AlertTitle>Owner access needed</AlertTitle>
          <AlertDescription>
            Only users who can manage the business profile can remove or reset demo data.
          </AlertDescription>
        </Alert>
      </ContentSection>
    )
  }

  const isTrial = Boolean(org.subscription?.isTrial)
  const total = status?.total ?? 0
  const busy = Boolean(job) || resetting || removing

  return (
    <ContentSection title='Demo Data' desc={desc}>
      <div className='space-y-4'>
        {removing || job?.kind === 'remove' ? (
          <Alert>
            <Loader2 className='h-4 w-4 animate-spin' />
            <AlertTitle>Removing demo data…</AlertTitle>
            <AlertDescription>
              Reversing the sample invoices, purchases and expenses (stock, cash book,
              ledgers, accounts) in one step. This takes a few seconds.
            </AlertDescription>
          </Alert>
        ) : job ? (
          <Alert>
            <Loader2 className='h-4 w-4 animate-spin' />
            <AlertTitle>Loading demo data…</AlertTitle>
            <AlertDescription>
              {job.step}. Fresh samples go through the normal invoice and purchase
              screens' logic, so this takes a minute or two. You can leave this page.
            </AlertDescription>
          </Alert>
        ) : total === 0 ? (
          <Alert>
            <CheckCircle2 className='h-4 w-4' />
            <AlertTitle>No demo data left</AlertTitle>
            <AlertDescription>
              Everything in this account is your own data.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <FlaskConical className='h-4 w-4' />
            <AlertTitle>This account still has sample data</AlertTitle>
            <AlertDescription>
              These records were added automatically so you could try the app. Removing
              them doesn't touch anything you added yourself.
            </AlertDescription>
          </Alert>
        )}

        {total > 0 && (
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
            {COUNT_LABELS.map(([key, label]) => (
              <div key={key} className='rounded-lg border px-3 py-2'>
                <div className='text-muted-foreground text-xs'>{label}</div>
                <div className='text-lg font-semibold tabular-nums'>{status?.counts[key] ?? 0}</div>
              </div>
            ))}
          </div>
        )}

        {total > 0 && (
          <div className='rounded-lg border p-4'>
            <h4 className='font-medium'>Remove Demo Data</h4>
            <p className='text-muted-foreground mt-1 text-sm'>
              Permanently delete all sample products, categories, customers, suppliers,
              invoices, purchases and expenses. Your own records stay as they are. A
              sample product, customer or supplier that one of your own records uses is
              kept.
            </p>
            <Button
              variant='destructive'
              className='mt-4'
              onClick={() => setConfirm('remove')}
              disabled={busy}
            >
              {removing && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Remove Demo Data
            </Button>
          </div>
        )}

        {isTrial && (
          <div className='rounded-lg border p-4'>
            <h4 className='font-medium'>Reset Demo Data</h4>
            <p className='text-muted-foreground mt-1 text-sm'>
              Clear the sample data and load a fresh batch. Only the sample records are
              replaced; your own data is not touched.
            </p>
            <Button
              variant='outline'
              className='mt-4'
              onClick={() => setConfirm('reset')}
              disabled={busy}
            >
              {resetting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Reset Demo Data
            </Button>
          </div>
        )}

        <ConfirmDialog
          open={confirm !== null}
          onOpenChange={(open) => !open && setConfirm(null)}
          title={confirm === 'reset' ? 'Reset demo data?' : 'Remove demo data?'}
          desc={
            confirm === 'reset'
              ? 'This clears all sample records, then loads a fresh batch. Real data you added yourself is not affected.'
              : 'This permanently deletes all sample records. Real data you added yourself is not affected. This cannot be undone.'
          }
          destructive
          isLoading={resetting || removing}
          handleConfirm={() => (confirm === 'reset' ? reset() : remove())}
          confirmText={
            confirm === 'reset' ? (resetting ? 'Resetting…' : 'Reset') : removing ? 'Removing…' : 'Remove'
          }
        />
      </div>
    </ContentSection>
  )
}
