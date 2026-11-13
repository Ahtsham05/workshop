import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { PAYMENT_MODE_BADGE } from '@/lib/payment-modes'
import { cn } from '@/lib/utils'
import type { SalesPaymentMethodTotal } from '@/stores/reports.api'

/**
 * Money moved at the time of the transaction, split by tender (Cash / Credit Card / ACH /
 * Check / other accounts) — one tile per method with amount, share and document count.
 * Used by the Sales report (collected from customers) and the Purchase report (paid to suppliers).
 */
export function PaymentMethodTotalsCard({
  rows,
  title,
  description,
  countLabel,
}: {
  rows: SalesPaymentMethodTotal[]
  title: string
  description: string
  /** Singular / plural noun for the count line, e.g. ['invoice', 'invoices']. */
  countLabel: [string, string]
}) {
  const { t } = useLanguage()
  const formatCurrency = useFormatMoney()
  if (rows.length === 0) return null
  const sum = rows.reduce((total, row) => total + row.amount, 0)

  return (
    <Card>
      <CardHeader className='pb-3'>
        <CardTitle className='text-base'>{t(title)}</CardTitle>
        <CardDescription>{t(description)}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
          {rows.map((row) => {
            const share = sum > 0 ? (row.amount / sum) * 100 : 0
            return (
              <div key={row.key} className={cn('rounded-lg border p-3', PAYMENT_MODE_BADGE[row.mode])}>
                <div className='flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide'>
                  <span className='truncate'>{row.label}</span>
                  <span className='tabular-nums'>{share.toFixed(0)}%</span>
                </div>
                <div className='mt-1 text-xl font-bold tabular-nums text-foreground'>{formatCurrency(row.amount)}</div>
                <div className='text-xs text-muted-foreground'>
                  {row.invoices} {t(row.invoices === 1 ? countLabel[0] : countLabel[1])}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
