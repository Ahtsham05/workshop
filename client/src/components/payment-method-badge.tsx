import { cn } from '@/lib/utils'
import {
  PAYMENT_MODE_BADGE,
  formatPaymentMethod,
  resolvePaymentMode,
  type PaymentModeSource,
} from '@/lib/payment-modes'

/**
 * How a sale was paid — "Cash", "Check #10234", "Credit Card · Card 4242", "ACH + Cash" —
 * as a colour-coded pill. Renders an em dash for quotations / pending (nothing collected yet).
 */
export function PaymentMethodBadge({
  source,
  withReference = true,
  withAccount = false,
  className,
}: {
  source: PaymentModeSource
  withReference?: boolean
  /** Purchases: add the account a check / ACH / card payment was drawn from to the tooltip. */
  withAccount?: boolean
  className?: string
}) {
  const mode = resolvePaymentMode(source)
  if (!mode) return <span className='text-xs text-muted-foreground'>—</span>
  const label = formatPaymentMethod(source, { withReference })
  const title = withAccount ? formatPaymentMethod(source, { withReference, withAccount }) : label
  return (
    <span
      title={title}
      className={cn(
        'inline-flex max-w-[12rem] items-center truncate rounded-full border px-2 py-0.5 text-xs font-medium',
        PAYMENT_MODE_BADGE[mode],
        className,
      )}
    >
      {label}
    </span>
  )
}
