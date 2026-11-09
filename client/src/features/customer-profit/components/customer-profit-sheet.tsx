import { Link } from '@tanstack/react-router'
import { ArrowDownRight, ArrowUpRight, BookOpen, Loader2, TrendingUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { formatAppDate } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import { useGetCustomerProfitDetailQuery, type CustomerProfitMetrics } from '@/stores/customerProfit.api'

/** Money with a proper minus sign: −Rs240.00, not Rs-240.00. */
const signed = (fmt: (n: number) => string, n: number) => (n < -0.004 ? `−${fmt(Math.abs(n))}` : fmt(n))

/** Margin as a coloured figure: red when losing, amber when thin, green when healthy. */
export function MarginText({ margin, className }: { margin: number; className?: string }) {
  const tone = margin < 0 ? 'text-red-600' : margin < 10 ? 'text-amber-600' : 'text-emerald-600'
  return <span className={cn('font-semibold tabular-nums', tone, className)}>{margin.toFixed(1)}%</span>
}

export function GrowthBadge({ growth }: { growth: number | null }) {
  const { t } = useLanguage()
  if (growth === null) return <span className='text-xs text-muted-foreground'>{t('new')}</span>
  const up = growth >= 0
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium tabular-nums', up ? 'text-emerald-600' : 'text-red-600')}>
      {up ? <ArrowUpRight className='h-3.5 w-3.5' /> : <ArrowDownRight className='h-3.5 w-3.5' />}
      {Math.abs(growth).toFixed(1)}%
    </span>
  )
}

/** Gross profit → − returns → − discounts = net profit, the way an accountant reads it. */
export function ProfitWaterfall({ m, compact }: { m: CustomerProfitMetrics; compact?: boolean }) {
  const { t } = useLanguage()
  const fmt = useFormatMoney()
  const rows: { label: string; value: number; sign?: '−'; strong?: boolean; muted?: boolean }[] = [
    { label: t('Net sales'), value: m.netRevenue, muted: true },
    { label: t('Cost of goods'), value: m.cost, sign: '−', muted: true },
    { label: t('Gross profit on sales'), value: m.grossProfit },
    ...(m.returnsProfit ? [{ label: t('Profit reversed by returns'), value: m.returnsProfit, sign: '−' as const }] : []),
    ...(m.ledgerDiscount ? [{ label: t('Ledger discounts allowed'), value: m.ledgerDiscount, sign: '−' as const }] : []),
    { label: t('Net profit'), value: m.netProfit, strong: true },
  ]
  return (
    <div className={cn('divide-y rounded-lg border', compact && 'text-sm')}>
      {rows.map((r) => (
        <div key={r.label} className={cn('flex items-center justify-between px-3', compact ? 'py-1.5' : 'py-2', r.strong && 'bg-muted/40 font-semibold')}>
          <span className={cn(r.muted && 'text-muted-foreground')}>{r.label}</span>
          <span className={cn('tabular-nums', r.strong && (r.value < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'))}>
            {r.sign ? `${r.sign} ` : ''}
            {fmt(Math.abs(r.value))}
            {r.value < 0 && !r.sign ? ` (${t('loss')})` : ''}
          </span>
        </div>
      ))}
    </div>
  )
}

const monthLabel = (ym: string) => {
  const [y, mo] = ym.split('-').map(Number)
  return new Date(y, (mo || 1) - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
}

interface Props {
  customerId: string | null
  customerName?: string
  startDate: string
  endDate: string
  onClose: () => void
}

/** One customer's profitability: figures, previous period, lifetime, trend, products, invoices. */
export function CustomerProfitSheet({ customerId, customerName, startDate, endDate, onClose }: Props) {
  const { t } = useLanguage()
  const fmt = useFormatMoney()
  const { data, isFetching, error } = useGetCustomerProfitDetailQuery(
    { customerId: customerId || '', startDate, endDate },
    { skip: !customerId }
  )
  const m = data?.metrics
  const maxMonthly = Math.max(1, ...(data?.monthly ?? []).map((r) => Math.abs(r.profit)))

  return (
    <Sheet open={Boolean(customerId)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side='right' className='flex w-full flex-col gap-0 p-0 sm:max-w-3xl'>
        <SheetHeader className='shrink-0 border-b px-5 py-4'>
          <SheetTitle className='flex items-center gap-2'>
            <TrendingUp className='h-5 w-5 text-emerald-600' />
            {data?.customer.name || customerName} — {t('Profitability')}
          </SheetTitle>
          <SheetDescription>
            {formatAppDate(new Date(`${startDate}T00:00:00`))} — {formatAppDate(new Date(`${endDate}T00:00:00`))}
            {data?.customer.phone ? ` · ${data.customer.phone}` : ''}
          </SheetDescription>
        </SheetHeader>

        <div className='min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4'>
          {isFetching && !data ? (
            <div className='flex justify-center py-16 text-muted-foreground'>
              <Loader2 className='h-5 w-5 animate-spin' />
            </div>
          ) : error ? (
            <p className='rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground'>
              {(error as { status?: number }).status === 403 ? t('You do not have permission to see customer profit') : t('Could not load profitability')}
            </p>
          ) : m && data ? (
            <>
              <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
                <Kpi label={t('Net profit')} value={signed(fmt, m.netProfit)} tone={m.netProfit < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400'}>
                  <GrowthBadge growth={data.growth} />
                  <span className='ml-1 text-[11px] text-muted-foreground'>
                    {t('prev')} {signed(fmt, data.previous.netProfit)}
                  </span>
                </Kpi>
                <Kpi label={t('Margin')} value={<MarginText margin={m.margin} />}>
                  <span className='text-[11px] text-muted-foreground'>
                    {t('on')} {fmt(m.netRevenue)} {t('sales')}
                  </span>
                </Kpi>
                <Kpi label={t('Invoices')} value={String(m.invoices)}>
                  <span className='text-[11px] text-muted-foreground'>
                    {signed(fmt, m.avgProfitPerInvoice)} {t('profit / invoice')}
                  </span>
                </Kpi>
                <Kpi label={t('Lifetime profit')} value={signed(fmt, data.lifetime.netProfit)}>
                  <span className='text-[11px] text-muted-foreground'>
                    {t('Balance')} {fmt(data.customer.balance)}
                  </span>
                </Kpi>
              </div>

              <section className='space-y-2'>
                <h3 className='text-sm font-semibold'>{t('How the profit adds up')}</h3>
                <ProfitWaterfall m={m} />
                {m.billDiscounts > 0 && (
                  <p className='text-xs text-muted-foreground'>
                    {t('Discounts given on the bills themselves')} ({fmt(m.billDiscounts)}) {t('are already taken out of net sales.')}
                  </p>
                )}
              </section>

              {data.monthly.length > 1 && (
                <section className='space-y-2'>
                  <h3 className='text-sm font-semibold'>{t('Gross profit by month')}</h3>
                  <div className='space-y-1.5'>
                    {data.monthly.map((row) => (
                      <div key={row.month} className='grid grid-cols-[72px_1fr_96px] items-center gap-2 text-xs'>
                        <span className='text-muted-foreground'>{monthLabel(row.month)}</span>
                        <div className='h-2 overflow-hidden rounded-full bg-muted'>
                          <div
                            className={cn('h-full rounded-full', row.profit < 0 ? 'bg-red-500' : 'bg-emerald-500')}
                            style={{ width: `${Math.max(2, (Math.abs(row.profit) / maxMonthly) * 100)}%` }}
                          />
                        </div>
                        <span className='text-right font-medium tabular-nums'>{signed(fmt, row.profit)}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              <section className='space-y-2'>
                <h3 className='text-sm font-semibold'>{t('Products they buy')}</h3>
                <div className='overflow-x-auto rounded-lg border'>
                  <Table>
                    <TableHeader>
                      <TableRow className='bg-muted/40'>
                        <TableHead>{t('Product')}</TableHead>
                        <TableHead className='text-right'>{t('Qty')}</TableHead>
                        <TableHead className='text-right'>{t('Sales')}</TableHead>
                        <TableHead className='text-right'>{t('Profit')}</TableHead>
                        <TableHead className='text-right'>{t('Margin')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.products.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className='py-6 text-center text-sm text-muted-foreground'>
                            {t('No sales in this period')}
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.products.slice(0, 15).map((p) => (
                          <TableRow key={p.productId || p.name}>
                            <TableCell className='text-sm font-medium'>{p.name}</TableCell>
                            <TableCell className='text-right text-sm tabular-nums'>{p.units}</TableCell>
                            <TableCell className='text-right text-sm tabular-nums'>{fmt(p.revenue)}</TableCell>
                            <TableCell className={cn('text-right text-sm font-medium tabular-nums', p.profit < 0 && 'text-red-600')}>{signed(fmt, p.profit)}</TableCell>
                            <TableCell className='text-right text-sm'>
                              <MarginText margin={p.margin} />
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </section>

              {data.lowMarginInvoices.length > 0 && (
                <section className='space-y-2'>
                  <h3 className='text-sm font-semibold'>{t('Weakest invoices (lowest margin)')}</h3>
                  <div className='flex flex-wrap gap-2'>
                    {data.lowMarginInvoices.map((inv) => (
                      <Badge key={inv.id} variant='outline' className='gap-1.5 font-normal'>
                        <span className='font-medium'>#{inv.invoiceNumber}</span>
                        <span className='text-muted-foreground'>{formatAppDate(new Date(inv.date))}</span>
                        <span className='tabular-nums'>{signed(fmt, inv.profit)}</span>
                        <MarginText margin={inv.margin} className='text-xs' />
                      </Badge>
                    ))}
                  </div>
                </section>
              )}
            </>
          ) : null}
        </div>

        {customerId && (
          <div className='flex shrink-0 justify-end border-t px-5 py-3'>
            <Button asChild variant='outline' size='sm'>
              <Link to='/accounting' search={{ tab: 'customer-ledger', customerId, customerName: data?.customer.name || customerName } as never}>
                <BookOpen className='mr-2 h-4 w-4' />
                {t('Open ledger')}
              </Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Kpi({ label, value, tone, children }: { label: string; value: React.ReactNode; tone?: string; children?: React.ReactNode }) {
  return (
    <div className='rounded-lg border px-3 py-2'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <p className={cn('mt-0.5 text-lg font-bold tabular-nums', tone)}>{value}</p>
      <div className='mt-0.5 flex flex-wrap items-center'>{children}</div>
    </div>
  )
}
