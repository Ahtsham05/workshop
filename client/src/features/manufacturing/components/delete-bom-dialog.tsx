import { Link } from '@tanstack/react-router'
import {
  Archive,
  ArrowRight,
  Info,
  Loader2,
  Lock,
  Star,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useDeleteBomMutation,
  useGetBomDeleteImpactQuery,
  useRestoreBomMutation,
  type Bom,
  type BomOrderRef,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from './badges'

/**
 * Delete a BOM version, showing first exactly what happens:
 *  - never used → removed permanently
 *  - used by production orders → moved to Deleted: kept for those orders and their
 *    reports, hidden from lists and pickers, restorable (with Undo on the toast)
 *  - still needed (draft/planned orders, or pinned as another BOM's sub-assembly) → refused,
 *    listing what to change first
 * Deleting the default version hands the default to the newest other active version.
 */
export function DeleteBomDialog({
  bom,
  open,
  onOpenChange,
  onDeleted,
}: {
  bom: Pick<Bom, 'id' | 'bomNumber' | 'version' | 'productName'>
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const { t } = useLanguage()
  const { data: impact, isFetching } = useGetBomDeleteImpactQuery(bom.id, {
    skip: !open,
    refetchOnMountOrArgChange: true,
  })
  const [deleteBom, { isLoading }] = useDeleteBomMutation()
  const [restoreBom] = useRestoreBomMutation()
  const label = `${bom.bomNumber} v${bom.version}`
  const mode = impact?.mode
  const blocked = mode === 'blocked' || mode === 'deleted'

  const submit = async () => {
    try {
      const result = await deleteBom(bom.id).unwrap()
      const next = result.nextDefault
        ? ` · ${t('default is now')} v${result.nextDefault.version}`
        : ''
      if (result.mode === 'archive') {
        toast.success(`${label} ${t('moved to Deleted')}${next}`, {
          action: {
            label: t('Undo'),
            onClick: () =>
              restoreBom(bom.id)
                .unwrap()
                .then(() =>
                  toast.success(
                    `${label} ${t('restored — activate it to use it again')}`
                  )
                )
                .catch((err) =>
                  toast.error(getErrorMessage(err, t('Could not restore')))
                ),
          },
        })
      } else {
        toast.success(`${label} ${t('deleted')}${next}`)
      }
      onOpenChange(false)
      onDeleted?.()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not delete the BOM')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !isLoading && onOpenChange(o)}>
      <DialogContent
        className='sm:max-w-lg'
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            {blocked ? (
              <Lock className='h-5 w-5 text-amber-500' />
            ) : mode === 'archive' ? (
              <Archive className='h-5 w-5 text-rose-600' />
            ) : (
              <Trash2 className='h-5 w-5 text-rose-600' />
            )}
            {mode === 'deleted'
              ? `${label} ${t('is already deleted')}`
              : blocked
                ? `${label} ${t('can’t be deleted yet')}`
                : `${t('Delete')} ${label}?`}
          </DialogTitle>
          <DialogDescription>
            {!impact || isFetching
              ? t('Checking where this BOM is used…')
              : mode === 'delete'
                ? t(
                    'No production order has used this recipe, so it is removed permanently. This cannot be undone.'
                  )
                : mode === 'archive'
                  ? t(
                      'Production orders were made with this recipe, so it is kept on record for them and their reports. It disappears from the BOM list and pickers and can’t be used for new orders. You can restore it from the Deleted view.'
                    )
                  : mode === 'deleted'
                    ? t(
                        'Restore it from the Deleted view if you need it again.'
                      )
                    : t('Something still depends on this version:')}
          </DialogDescription>
        </DialogHeader>

        {!impact || isFetching ? (
          <Skeleton className='h-28 w-full rounded-lg' />
        ) : (
          <div className='space-y-3 text-sm'>
            <div className='bg-muted/40 flex items-center justify-between gap-3 rounded-lg border px-3 py-2'>
              <span className='min-w-0'>
                <span className='block truncate font-medium'>
                  {bom.productName}
                </span>
                <span className='text-muted-foreground font-mono text-xs'>
                  {label}
                </span>
              </span>
              {impact.bom.isDefault && (
                <span className='text-primary inline-flex shrink-0 items-center gap-1 text-xs font-medium'>
                  <Star className='h-3 w-3' />
                  {t('Default')}
                </span>
              )}
            </div>

            {mode === 'blocked' && (
              <ul className='space-y-2'>
                {impact.blockers.map((b) => (
                  <li
                    key={b}
                    className='flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 text-xs'
                  >
                    <Info className='mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500' />
                    {b}
                  </li>
                ))}
              </ul>
            )}

            {mode === 'blocked' && impact.orders.draft.length > 0 && (
              <OrderList
                title={t('Draft / planned orders using it')}
                orders={impact.orders.draft}
                onNavigate={() => onOpenChange(false)}
              />
            )}
            {mode === 'blocked' && impact.parentBoms.length > 0 && (
              <div className='space-y-1.5'>
                <div className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
                  {t('Used as a sub-assembly in')}
                </div>
                <ul className='divide-y rounded-lg border'>
                  {impact.parentBoms.map((p) => (
                    <li
                      key={p.id}
                      className='flex items-center justify-between gap-3 px-3 py-2'
                    >
                      <span className='truncate'>{p.productName}</span>
                      <span className='text-muted-foreground shrink-0 font-mono text-xs'>
                        {p.bomNumber} v{p.version}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {mode === 'archive' && impact.orders.total > 0 && (
              <OrderList
                title={
                  impact.orders.total === 1
                    ? t('Made with this recipe: 1 production order')
                    : t(
                        'Made with this recipe: {{n}} production orders'
                      ).replace('{{n}}', String(impact.orders.total))
                }
                orders={impact.orders.recent}
                more={impact.orders.total - impact.orders.recent.length}
                onNavigate={() => onOpenChange(false)}
                note={
                  impact.orders.open > 0
                    ? t(
                        'Open orders keep the materials they already copied from this recipe.'
                      )
                    : undefined
                }
              />
            )}

            {!blocked && impact.bom.isDefault && (
              <div className='flex items-start gap-2 rounded-lg border p-2.5 text-xs'>
                <Star className='text-primary mt-0.5 h-3.5 w-3.5 shrink-0' />
                <span>
                  {impact.nextDefault ? (
                    <>
                      {t('This is the default BOM for')} {bom.productName}.{' '}
                      <span className='inline-flex items-center gap-1 font-medium'>
                        <ArrowRight className='h-3 w-3' />
                        {impact.nextDefault.bomNumber} v
                        {impact.nextDefault.version} {t('becomes the default.')}
                      </span>
                    </>
                  ) : (
                    <>
                      {t('This is the only active BOM for')} {bom.productName}.{' '}
                      {t(
                        'After deleting, new production orders for it need another BOM.'
                      )}
                      {impact.componentOf > 0 &&
                        ` ${t(
                          '{{n}} other BOMs use it as a component and will treat it as a stocked item instead of building it.'
                        ).replace('{{n}}', String(impact.componentOf))}`}
                    </>
                  )}
                </span>
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
            {blocked ? t('Close') : t('Keep it')}
          </Button>
          {!blocked && (
            <Button
              variant='destructive'
              onClick={submit}
              disabled={!impact || isFetching || isLoading}
            >
              {isLoading && <Loader2 className='mr-1.5 h-4 w-4 animate-spin' />}
              {mode === 'archive'
                ? t('Move to Deleted')
                : t('Delete permanently')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OrderList({
  title,
  orders,
  more = 0,
  note,
  onNavigate,
}: {
  title: string
  orders: BomOrderRef[]
  more?: number
  note?: string
  onNavigate: () => void
}) {
  const { t } = useLanguage()
  return (
    <div className='space-y-1.5'>
      <div className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
        {title}
      </div>
      <ul className='max-h-48 divide-y overflow-y-auto rounded-lg border'>
        {orders.map((o) => (
          <li
            key={o.id}
            className='flex items-center justify-between gap-3 px-3 py-2'
          >
            <Link
              to={`/manufacturing/production-orders/${o.id}` as never}
              onClick={onNavigate}
              className='font-mono text-xs font-medium hover:underline'
            >
              {o.orderNumber}
            </Link>
            <StatusBadge status={o.status} />
          </li>
        ))}
        {more > 0 && (
          <li className='text-muted-foreground px-3 py-2 text-xs'>
            {t('and {{n}} more').replace('{{n}}', String(more))}
          </li>
        )}
      </ul>
      {note && <p className='text-muted-foreground text-xs'>{note}</p>}
    </div>
  )
}
