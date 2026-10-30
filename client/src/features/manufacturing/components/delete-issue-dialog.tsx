import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  Lock,
  PackageCheck,
  Trash2,
  Undo2,
} from 'lucide-react'
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
import { fmtDate, fmtQty } from '../lib/constants'

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
  // Ticked by default: an order nothing else touched is usually one this voucher created.
  // (Only offered — and only sent — when the server says the order can be cancelled.)
  const [cancelOrder, setCancelOrder] = useState(true)
  useEffect(() => {
    if (open) setCancelOrder(true)
  }, [open, issue.id])
  const reasonOk = reason.trim().length >= 3
  const locked = preview && !preview.canReverse
  const usedBy = preview?.usedBy || []
  const kindLabel = {
    receipt: t('Finished goods receipt'),
    return: t('Material return'),
    scrap: t('Scrap'),
  } as const

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
                  'Some of its material was already used. Reverse the documents below first, then delete this voucher — or edit its date, reference, notes and people.'
                )
              : t(
                  'Its material goes back from the production floor into stock and the voucher is removed from the list. Its number is not reused.'
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
            {locked && usedBy.length > 0 && (
              <div className='space-y-2'>
                <div className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
                  {t('Used by — undo these first')}
                </div>
                <ul className='divide-y rounded-lg border'>
                  {usedBy.map((d) => (
                    <li
                      key={`${d.kind}-${d.id}`}
                      className='flex items-center justify-between gap-3 px-3 py-2 text-sm'
                    >
                      <span className='flex min-w-0 items-start gap-2'>
                        {d.kind === 'receipt' ? (
                          <PackageCheck className='mt-0.5 h-4 w-4 shrink-0 text-emerald-600' />
                        ) : d.kind === 'return' ? (
                          <Undo2 className='mt-0.5 h-4 w-4 shrink-0 text-sky-600' />
                        ) : (
                          <Trash2 className='mt-0.5 h-4 w-4 shrink-0 text-rose-600' />
                        )}
                        <span className='min-w-0'>
                          <span className='block truncate'>
                            <span className='font-mono text-xs font-medium'>
                              {d.number}
                            </span>{' '}
                            <span className='text-muted-foreground'>
                              · {kindLabel[d.kind]}
                            </span>
                          </span>
                          <span className='text-muted-foreground block text-xs tabular-nums'>
                            {fmtDate(d.date)}
                            {d.detail && ` · ${d.detail}`}
                          </span>
                        </span>
                      </span>
                      {d.reversible ? (
                        <Button asChild size='sm' variant='outline'>
                          <Link
                            to={
                              `/manufacturing/production-orders/${preview.order.id}` as never
                            }
                            search={{ reverse: d.id } as never}
                            onClick={() => onOpenChange(false)}
                          >
                            {t('Reverse')}
                            <ArrowRight className='ml-1 h-3.5 w-3.5' />
                          </Link>
                        </Button>
                      ) : (
                        <span className='text-muted-foreground shrink-0 text-xs'>
                          {t('Can’t be undone')}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {locked && (
              <div className='flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs'>
                <AlertTriangle className='mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500' />
                {usedBy.some((d) => !d.reversible)
                  ? t(
                      'Returns and scrap can’t be undone, so this voucher has to stay. Edit it instead, or issue a correction.'
                    )
                  : t(
                      'Reverse each receipt above (its finished goods leave stock and the material goes back to the order), then come back and delete this voucher.'
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
