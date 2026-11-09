import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useGetCustomerCreditStatusQuery } from '@/stores/creditControl.api'
import { CreditHistoryDialog } from './credit-history-dialog'
import { CreditHoldDialog } from './credit-hold-dialog'
import { CreditLimitDialog } from './credit-limit-dialog'

export type CreditQuickAction = 'increase' | 'set' | 'temporary' | 'hold' | 'history'

/** A row's quick credit action: loads the customer's credit, then opens the right dialog. */
export function CustomerCreditQuickDialog({
  customerId,
  customerName,
  action,
  onClose,
}: {
  customerId: string
  customerName: string
  action: CreditQuickAction
  onClose: () => void
}) {
  const { data: status, isLoading } = useGetCustomerCreditStatusQuery({ customerId }, { skip: action === 'history' })
  const onOpenChange = (open: boolean) => !open && onClose()

  if (action === 'history') {
    return <CreditHistoryDialog open onOpenChange={onOpenChange} customerId={customerId} customerName={customerName} />
  }
  if (isLoading || !status) {
    return (
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className='max-w-xs sm:max-w-xs'>
          <DialogTitle className='sr-only'>{customerName}</DialogTitle>
          <div className='flex justify-center py-6'>
            <Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
          </div>
        </DialogContent>
      </Dialog>
    )
  }
  if (action === 'hold') return <CreditHoldDialog open onOpenChange={onOpenChange} status={status} />
  return <CreditLimitDialog open onOpenChange={onOpenChange} status={status} initialAction={action} onSaved={onClose} />
}
