import { useState } from 'react'
import { AlertTriangle, Loader2, Lock, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useCancelMaterialIssueMutation,
  useGetMaterialIssueReversalQuery,
  type MaterialIssue,
} from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import { getErrorMessage } from '@/lib/get-error-message'
import { getUnitLabel } from '@/lib/units'
import { useLanguage } from '@/context/language-context'
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
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { fmtQty } from '../lib/constants'

/**
 * "Delete" a posted Material Issue Voucher = cancel it: its material goes back from the
 * order's WIP into stock and the voucher stays on record, marked cancelled, with the reason.
 * Shows exactly what goes back first; refuses (and says why) when some of it was already
 * used in output, scrapped or returned.
 */
export function DeleteIssueDialog({
  issue,
  open,
  onOpenChange,
  onDone,
}: {
  issue: Pick<MaterialIssue, 'id' | 'issueNumber' | 'orderNumber' | 'revision'>
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: (cancelled: MaterialIssue) => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data: preview, isFetching } = useGetMaterialIssueReversalQuery(
    issue.id,
    { skip: !open, refetchOnMountOrArgChange: true }
  )
  const [cancel, { isLoading }] = useCancelMaterialIssueMutation()
  const [reason, setReason] = useState('')
  const [cancelOrder, setCancelOrder] = useState(false)
  const reasonOk = reason.trim().length >= 3
  const locked = preview && !preview.canReverse

  const submit = async () => {
    if (!preview || !reasonOk) return
    try {
      const done = await cancel({
        issueId: issue.id,
        reason: reason.trim(),
        revision: preview.revision,
        cancelOrder: cancelOrder && preview.order.canCancel,
      }).unwrap()
      toast.success(
        `${issue.issueNumber} ${t('deleted — its material is back in stock')}${
          cancelOrder && preview.order.canCancel
            ? ` · ${preview.order.orderNumber} ${t('cancelled')}`
            : ''
        }`
      )
      onOpenChange(false)
      setReason('')
      setCancelOrder(false)
      onDone?.(done)
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not delete the voucher')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !isLoading && onOpenChange(o)}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            {locked ? (
              <Lock className='h-5 w-5 text-amber-500' />
            ) : (
              <Undo2 className='h-5 w-5 text-rose-600' />
            )}
            {locked
              ? t('This voucher can’t be deleted')
              : `${t('Delete')} ${issue.issueNumber}?`}
          </DialogTitle>
          <DialogDescription>
            {locked
              ? t(
                  'Some of its material was already used in output, scrapped or returned. Return what is still on the floor from the order instead — you can still edit the date, reference, notes and people.'
                )
              : t(
                  'Its material goes back from the production floor into stock. The voucher stays on record as cancelled, with your reason — its number is not reused.'
                )}
          </DialogDescription>
        </DialogHeader>

        {!preview || isFetching ? (
          <Skeleton className='h-28 w-full rounded-lg' />
        ) : (
          <div className='space-y-3'>
            <div className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
              {locked ? t('Where its material is') : t('Goes back into stock')}
            </div>
            <ul className='max-h-56 divide-y overflow-y-auto rounded-lg border'>
              {preview.lines.map((l, i) => (
                <li
                  key={i}
                  className='flex items-start justify-between gap-3 px-3 py-2 text-sm'
                >
                  <span className='min-w-0'>
                    <span className='block truncate font-medium'>
                      {l.productName}
                    </span>
                    {l.batchNumber && (
                      <span className='text-muted-foreground text-xs'>
                        {t('Batch')} {l.batchNumber}
                      </span>
                    )}
                  </span>
                  <span className='shrink-0 text-right tabular-nums'>
                    {fmtQty(l.quantity)} {getUnitLabel(l.unit)}
                    {l.gone > 0 && (
                      <span className='block text-xs text-rose-600 dark:text-rose-400'>
                        {fmtQty(l.gone)} {t('already used')}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {!locked && (
              <>
                <div className='flex justify-between text-sm'>
                  <span className='text-muted-foreground'>
                    {t('Value back in stock')}
                  </span>
                  <span className='font-semibold tabular-nums'>
                    {formatMoney(preview.totalCost)}
                  </span>
                </div>
                <div className='space-y-1.5'>
                  <Label htmlFor='cancel-reason'>
                    {t('Reason')} <span className='text-rose-600'>*</span>
                  </Label>
                  <Textarea
                    id='cancel-reason'
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={t('e.g. Issued to the wrong order')}
                    rows={2}
                    autoFocus
                  />
                </div>
                {preview.order.canCancel && (
                  <label className='flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm'>
                    <Checkbox
                      checked={cancelOrder}
                      onCheckedChange={(v) => setCancelOrder(!!v)}
                      className='mt-0.5'
                    />
                    <span>
                      <span className='font-medium'>
                        {t('Also cancel')} {preview.order.orderNumber}
                      </span>
                      <span className='text-muted-foreground block text-xs'>
                        {t(
                          'Nothing else was issued or produced on it — e.g. it was created by this voucher.'
                        )}
                      </span>
                    </span>
                  </label>
                )}
              </>
            )}
            {locked && (
              <div className='flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs'>
                <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500' />
                {t(
                  'Stock that went into finished goods can’t be un-issued without undoing that output first.'
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {locked ? t('Close') : t('Keep it')}
          </Button>
          {!locked && (
            <Button
              variant='destructive'
              onClick={submit}
              disabled={!preview || !reasonOk || isLoading || isFetching}
            >
              {isLoading && <Loader2 className='mr-1.5 h-4 w-4 animate-spin' />}
              {t('Delete voucher')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
