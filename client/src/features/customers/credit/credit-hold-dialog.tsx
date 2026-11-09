import { useEffect, useState } from 'react'
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useLanguage } from '@/context/language-context'
import { getErrorMessage } from '@/lib/get-error-message'
import { useSetCreditHoldMutation, type CreditStatus } from '@/stores/creditControl.api'

const HOLD_REASONS = ['Cheque bounced', 'Payment overdue', 'Dispute on account', 'Management decision']

/** Put a customer on credit hold (no new credit at all) or release them. */
export function CreditHoldDialog({
  open,
  onOpenChange,
  status,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: CreditStatus
}) {
  const { t } = useLanguage()
  const [setHold, { isLoading }] = useSetCreditHoldMutation()
  const [reason, setReason] = useState('')
  const releasing = status.onHold

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  const submit = async () => {
    if (!releasing && !reason.trim()) return
    try {
      await setHold({ customerId: status.customerId, onHold: !releasing, reason: reason.trim() || undefined }).unwrap()
      toast.success(releasing ? t('{{name}} released from credit hold', { name: status.customerName }) : t('{{name}} is on credit hold', { name: status.customerName }))
      onOpenChange(false)
    } catch (error) {
      toast.error(getErrorMessage(error, t('Could not change the credit hold')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-md sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            {releasing ? <ShieldCheck className='h-5 w-5 text-emerald-600' /> : <ShieldAlert className='h-5 w-5 text-red-600' />}
            {releasing ? t('Release from credit hold') : t('Put on credit hold')} — {status.customerName}
          </DialogTitle>
          <DialogDescription>
            {releasing
              ? t('Credit sales will be allowed again, within the credit limit.')
              : t('No new credit sales until released. Fully paid sales still go through.')}
          </DialogDescription>
        </DialogHeader>

        {releasing && status.holdReason && (
          <p className='rounded-md border bg-muted/40 px-3 py-2 text-sm'>
            <span className='text-muted-foreground'>{t('On hold because')}:</span> {status.holdReason}
          </p>
        )}

        <div className='space-y-2'>
          <Label htmlFor='credit-hold-reason'>
            {t('Reason')} {releasing && <span className='text-muted-foreground'>({t('optional')})</span>}
          </Label>
          <Textarea id='credit-hold-reason' rows={2} value={reason} onChange={(e) => setReason(e.target.value)} autoFocus />
          {!releasing && (
            <div className='flex flex-wrap gap-1.5'>
              {HOLD_REASONS.map((text) => (
                <Button key={text} type='button' size='sm' variant='outline' className='h-7 px-2.5 text-xs' onClick={() => setReason(t(text))}>
                  {t(text)}
                </Button>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button
            type='button'
            variant={releasing ? 'default' : 'destructive'}
            onClick={submit}
            disabled={isLoading || (!releasing && !reason.trim())}
          >
            {isLoading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {releasing ? t('Release') : t('Put on hold')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
