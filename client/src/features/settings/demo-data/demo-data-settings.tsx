import { useState } from 'react'
import { Loader2, FlaskConical } from 'lucide-react'
import { toast } from 'sonner'
import ContentSection from '../components/content-section'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useGetMyOrganizationQuery, useResetDemoDataMutation } from '@/stores/organization.api'

export default function DemoDataSettings() {
  const { data: org, isLoading } = useGetMyOrganizationQuery()
  const [resetDemoData, { isLoading: resetting }] = useResetDemoDataMutation()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleReset = async () => {
    if (!org) return
    try {
      const result = await resetDemoData(org.id).unwrap()
      // The server clears and reseeds in the background (dozens of invoice/purchase
      // records through the real service layer — often a minute or two), so there's
      // nothing to reload yet. Reloading immediately would just show a half-cleared
      // account mid-reseed, which looks broken rather than in progress.
      toast.success(result.message)
      setConfirmOpen(false)
    } catch {
      toast.error('Failed to start demo data reset')
    }
  }

  if (isLoading || !org) {
    return (
      <ContentSection title='Demo Data' desc='Manage the sample data in your trial account.'>
        <div className='flex items-center justify-center py-12'>
          <Loader2 className='h-6 w-6 animate-spin' />
        </div>
      </ContentSection>
    )
  }

  const isTrial = Boolean(org.subscription?.isTrial)

  return (
    <ContentSection title='Demo Data' desc='Manage the sample data in your trial account.'>
      {isTrial ? (
        <div className='space-y-4'>
          <Alert>
            <FlaskConical className='h-4 w-4' />
            <AlertTitle>You're exploring a trial sandbox</AlertTitle>
            <AlertDescription>
              This account was pre-loaded with sample products, customers, suppliers,
              invoices, purchases, and expenses so you can try out Reports, Invoices,
              Purchases, and everything else right away. Feel free to edit or delete any
              of it while you explore — it's just for testing.
            </AlertDescription>
          </Alert>
          <div className='rounded-lg border p-4'>
            <h4 className='font-medium'>Reset Demo Data</h4>
            <p className='text-muted-foreground mt-1 text-sm'>
              Clear all sample data and load a fresh batch. This only removes the
              seeded demo records — it won't touch any real data you've added yourself.
              Runs in the background and can take a minute or two; refresh the page
              afterward to see the new data.
            </p>
            <Button
              variant='destructive'
              className='mt-4'
              onClick={() => setConfirmOpen(true)}
              disabled={resetting}
            >
              {resetting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              Reset Demo Data
            </Button>
          </div>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title='Reset demo data?'
            desc='This clears all sample products, customers, suppliers, invoices, purchases, and expenses, then loads a fresh batch. Real data you added yourself is not affected.'
            destructive
            isLoading={resetting}
            handleConfirm={handleReset}
            confirmText='Reset'
          />
        </div>
      ) : (
        <Alert>
          <AlertTitle>No demo data to manage</AlertTitle>
          <AlertDescription>
            Demo data is only available on trial accounts. Since your account is on a
            paid plan, this page doesn't apply.
          </AlertDescription>
        </Alert>
      )}
    </ContentSection>
  )
}
