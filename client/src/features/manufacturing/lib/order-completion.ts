import { toast } from 'sonner'

/**
 * The server completes an order on its own once every planned unit has been received
 * (setting "Complete orders automatically"); receipts, inspections and rework results then
 * come back with `orderCompleted`. Says so, so the status change isn't a surprise.
 */
export function announceAutoCompletion(
  result: { orderCompleted?: boolean } | null | undefined,
  orderNumber: string,
  t: (key: string) => string
) {
  if (!result?.orderCompleted) return
  toast.success(`${orderNumber} ${t('completed')}`, {
    description: t(
      'Every planned unit is in finished stock, so the order was completed automatically.'
    ),
  })
}
