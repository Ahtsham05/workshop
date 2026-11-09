import { useState } from 'react'
import { ChevronRight, Loader2, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useGetCustomerProfitDetailQuery } from '@/stores/customerProfit.api'
import { CustomerProfitSheet, GrowthBadge, MarginText } from './customer-profit-sheet'

/** Money with a proper minus sign: −Rs240.00, not Rs-240.00. */
const signed = (fmt: (n: number) => string, n: number) => (n < -0.004 ? `−${fmt(Math.abs(n))}` : fmt(n))

/**
 * Profitability strip on the customer ledger, for the ledger's own statement period.
 * Only for roles with viewCustomerProfit (it reveals cost) — renders nothing otherwise.
 */
export function CustomerProfitCard({
  customerId,
  customerName,
  startDate,
  endDate,
  className,
}: {
  customerId: string
  customerName?: string
  startDate: string
  endDate: string
  className?: string
}) {
  const { hasPermission } = usePermissions()
  const allowed = hasPermission('viewCustomerProfit')
  const { t } = useLanguage()
  const fmt = useFormatMoney()
  const [open, setOpen] = useState(false)
  const { data, isFetching, isError } = useGetCustomerProfitDetailQuery(
    { customerId, startDate, endDate },
    { skip: !allowed || !customerId }
  )
  if (!allowed || isError) return null
  const m = data?.metrics

  return (
    <div className={cn('rounded-lg border bg-gradient-to-r from-emerald-50/70 to-transparent px-4 py-3 dark:from-emerald-950/20', className)}>
      <div className='flex flex-wrap items-center gap-x-6 gap-y-2'>
        <div className='flex items-center gap-2'>
          <span className='rounded-md bg-emerald-100 p-1.5 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'>
            <TrendingUp className='h-4 w-4' />
          </span>
          <div>
            <p className='text-xs text-muted-foreground'>{t('Profit from this customer')}</p>
            {isFetching && !m ? (
              <Loader2 className='mt-1 h-4 w-4 animate-spin text-muted-foreground' />
            ) : (
              <p className={cn('text-lg font-bold tabular-nums', (m?.netProfit ?? 0) < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400')}>
                {signed(fmt, m?.netProfit ?? 0)}
              </p>
            )}
          </div>
        </div>
        {m && (
          <>
            <Figure label={t('Margin')}>
              <MarginText margin={m.margin} />
            </Figure>
            <Figure label={t('Net sales')}>{fmt(m.netRevenue)}</Figure>
            <Figure label={t('Gross profit')}>{signed(fmt, m.grossProfit)}</Figure>
            {m.returnsProfit !== 0 && <Figure label={t('Returns')}>−{fmt(Math.abs(m.returnsProfit))}</Figure>}
            {m.ledgerDiscount > 0 && <Figure label={t('Discounts')}>−{fmt(m.ledgerDiscount)}</Figure>}
            <Figure label={t('vs previous')}>
              <GrowthBadge growth={data?.growth ?? null} />
            </Figure>
          </>
        )}
        <Button type='button' variant='ghost' size='sm' className='ml-auto' onClick={() => setOpen(true)}>
          {t('Details')}
          <ChevronRight className='ml-1 h-4 w-4' />
        </Button>
      </div>
      <CustomerProfitSheet
        customerId={open ? customerId : null}
        customerName={customerName}
        startDate={startDate}
        endDate={endDate}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className='text-sm font-semibold tabular-nums'>{children}</p>
    </div>
  )
}
