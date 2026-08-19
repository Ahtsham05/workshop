import { useState } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, FileText, Loader2, XCircle } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useConfirmActionMutation, useCancelActionMutation, type AiPendingAction } from '@/stores/aiAssistant.api'
import { formatMoney } from '../../lib/format'

const CARD_TITLE: Record<AiPendingAction['kind'], string> = {
  create_invoice: 'Create Invoice',
  record_payment: 'Record Payment',
}
const CONFIRM_LABEL: Record<AiPendingAction['kind'], string> = {
  create_invoice: 'Create Invoice',
  record_payment: 'Record Payment',
}
const CANCELLED_TEXT: Record<AiPendingAction['kind'], string> = {
  create_invoice: 'Invoice creation cancelled.',
  record_payment: 'Payment recording cancelled.',
}
const FAILED_TITLE: Record<AiPendingAction['kind'], string> = {
  create_invoice: "Couldn't create the invoice",
  record_payment: "Couldn't record the payment",
}

/**
 * Renders a create_invoice or record_payment preview as a bound Cancel/Confirm card. Nothing is
 * written to the database until Confirm is clicked — see aiAssistant.service.js#confirmAction,
 * which re-validates permission and re-resolves the customer (and product, for an invoice)
 * server-side before calling the real invoiceService/customerLedgerService. `status` comes
 * straight from the persisted message, so a page reload shows the same executed/cancelled/failed
 * state instead of resetting to pending.
 */
export function ActionConfirmationCard({
  conversationId,
  messageId,
  action,
}: {
  conversationId: string
  messageId: string
  action: AiPendingAction
}) {
  const [confirmAction, { isLoading: isConfirming }] = useConfirmActionMutation()
  const [cancelAction, { isLoading: isCancelling }] = useCancelActionMutation()
  const [localError, setLocalError] = useState<string | null>(null)
  const busy = isConfirming || isCancelling
  // Deliberately NOT destructured to a top-level `preview` const — TypeScript can only narrow
  // AiPendingAction's discriminated union (on `action.kind`) through `action` itself, not through
  // a value already pulled off it before the narrowing check, so every access below goes through
  // `action.preview` inside a branch that's already checked `action.kind`.

  const handleConfirm = async () => {
    setLocalError(null)
    try {
      await confirmAction({ conversationId, messageId }).unwrap()
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message || 'Something went wrong.'
      setLocalError(message)
      toast.error(message)
    }
  }

  const handleCancel = async () => {
    setLocalError(null)
    try {
      await cancelAction({ conversationId, messageId }).unwrap()
    } catch {
      toast.error('Failed to cancel.')
    }
  }

  if (action.status === 'executed') {
    return (
      <div className='mt-2 w-full max-w-sm rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm'>
        <p className='flex items-center gap-1.5 text-sm font-medium text-emerald-600 dark:text-emerald-400'>
          <CheckCircle2 className='h-4 w-4' />
          {action.kind === 'create_invoice' ? 'Invoice created' : 'Payment recorded'}
        </p>
        {action.kind === 'create_invoice' ? (
          <>
            <p className='mt-1 text-sm text-foreground'>
              {action.result?.invoiceNumber} — {formatMoney(action.preview.total)} for {action.preview.customerName}
            </p>
            <Button asChild size='sm' variant='outline' className='mt-3 h-8 gap-1.5 text-xs'>
              {/* No per-invoice deep link exists in this app yet — invoices are only browsable via
                  the list view, not addressable by id in the URL — so this opens the list rather
                  than the specific invoice. */}
              <Link to='/invoice' search={{ view: 'list' }}>
                <FileText className='h-3.5 w-3.5' />
                View Invoices
              </Link>
            </Button>
          </>
        ) : (
          <p className='mt-1 text-sm text-foreground'>
            {formatMoney(action.preview.amount)} from {action.preview.customerName} — new balance:{' '}
            {formatMoney(action.result?.newBalance ?? 0)}
          </p>
        )}
      </div>
    )
  }

  if (action.status === 'cancelled') {
    return (
      <div className='mt-2 w-full max-w-sm rounded-2xl border bg-muted/40 p-4 text-sm text-muted-foreground shadow-sm'>
        {CANCELLED_TEXT[action.kind]}
      </div>
    )
  }

  if (action.status === 'failed') {
    return (
      <div className='mt-2 w-full max-w-sm rounded-2xl border border-destructive/30 bg-destructive/5 p-4 shadow-sm'>
        <p className='flex items-center gap-1.5 text-sm font-medium text-destructive'>
          <XCircle className='h-4 w-4' />
          {FAILED_TITLE[action.kind]}
        </p>
        <p className='mt-1 text-sm text-muted-foreground'>{action.error || 'Something went wrong.'}</p>
      </div>
    )
  }

  return (
    <div data-testid='action-confirmation-card' className='mt-2 w-full max-w-sm rounded-2xl border bg-card p-4 shadow-sm'>
      <p className='text-xs font-medium text-muted-foreground'>{CARD_TITLE[action.kind]}</p>
      <dl className='mt-2 space-y-1.5 text-sm'>
        <div className='flex justify-between gap-3'>
          <dt className='text-muted-foreground'>Customer</dt>
          <dd className='truncate font-medium'>{action.preview.customerName}</dd>
        </div>
        {action.kind === 'create_invoice' ? (
          <>
            <div className='flex justify-between gap-3'>
              <dt className='text-muted-foreground'>Product</dt>
              <dd className='truncate font-medium'>{action.preview.productName}</dd>
            </div>
            <div className='flex justify-between gap-3'>
              <dt className='text-muted-foreground'>Quantity</dt>
              <dd className='font-medium'>{action.preview.quantity}</dd>
            </div>
            <div className='flex justify-between gap-3 border-t pt-1.5'>
              <dt className='text-muted-foreground'>Total</dt>
              <dd className='font-semibold tabular-nums'>{formatMoney(action.preview.total)}</dd>
            </div>
          </>
        ) : (
          <>
            <div className='flex justify-between gap-3'>
              <dt className='text-muted-foreground'>Current balance</dt>
              <dd className='font-medium tabular-nums'>{formatMoney(action.preview.customerBalance)}</dd>
            </div>
            <div className='flex justify-between gap-3 border-t pt-1.5'>
              <dt className='text-muted-foreground'>Amount received</dt>
              <dd className='font-semibold tabular-nums'>{formatMoney(action.preview.amount)}</dd>
            </div>
          </>
        )}
      </dl>

      {localError && <p className='mt-2 text-xs text-destructive'>{localError}</p>}

      <div className='mt-3 flex gap-2'>
        <Button size='sm' variant='outline' className='h-8 flex-1 text-xs' onClick={handleCancel} disabled={busy}>
          Cancel
        </Button>
        <Button size='sm' className='h-8 flex-1 text-xs' onClick={handleConfirm} disabled={busy}>
          {isConfirming ? <Loader2 className='h-3.5 w-3.5 animate-spin' /> : CONFIRM_LABEL[action.kind]}
        </Button>
      </div>
    </div>
  )
}
