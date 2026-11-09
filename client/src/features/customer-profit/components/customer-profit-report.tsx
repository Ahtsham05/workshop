import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, Crown, Percent, Printer, Search, TrendingUp, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney, useCurrencyMeta } from '@/lib/format-money'
import { formatAppDate } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import type { RootState } from '@/stores/store'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
import { openPrintWindowForFormat } from '@/features/invoice/utils/print-utils'
import { generateReportHTML } from '@/features/manufacturing/lib/report-print'
import { useGetCustomerProfitRankingQuery, type CustomerProfitRow, type CustomerProfitSort } from '@/stores/customerProfit.api'
import { CustomerProfitSheet, GrowthBadge, MarginText } from './customer-profit-sheet'

/** Money with a proper minus sign: −Rs240.00, not Rs-240.00. */
const signed = (fmt: (n: number) => string, n: number) => (n < -0.004 ? `−${fmt(Math.abs(n))}` : fmt(n))

interface Props {
  startDate: string
  endDate: string
}

type Filter = 'all' | 'loss' | 'discounted'

/**
 * Reports → Customer Profit: every customer ranked by the profit they actually leave the
 * business (sales profit − returns − ledger discounts). Server: customerProfit.service getRanking.
 */
export const CustomerProfitReport = forwardRef<{ exportToExcel: () => void }, Props>(({ startDate, endDate }, ref) => {
  const { t } = useLanguage()
  const fmt = useFormatMoney()
  const currency = useCurrencyMeta().symbol
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<CustomerProfitSort>('netProfit')
  const [order, setOrder] = useState<'asc' | 'desc'>('desc')
  const [selected, setSelected] = useState<CustomerProfitRow | null>(null)

  const { data, isFetching } = useGetCustomerProfitRankingQuery({ startDate, endDate, filter, sort, order }, { refetchOnMountOrArgChange: 60 })

  const activeBranchId = useSelector((s: RootState) => s.auth.activeBranchId)
  const user = useSelector((s: RootState) => s.auth.data?.user)
  const { data: branch } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: org } = useGetMyOrganizationQuery(undefined)

  // Typing filters on screen; it never refetches.
  const rows = useMemo(() => {
    const all = data?.rows ?? []
    const q = search.trim().toLowerCase()
    return q ? all.filter((r) => [r.name, r.nameUrdu, r.phone].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))) : all
  }, [data, search])
  const totals = useMemo(
    () =>
      rows.reduce(
        (s, r) => ({
          invoices: s.invoices + r.invoices,
          netRevenue: s.netRevenue + r.netRevenue,
          cost: s.cost + r.cost,
          grossProfit: s.grossProfit + r.grossProfit,
          returnsProfit: s.returnsProfit + r.returnsProfit,
          ledgerDiscount: s.ledgerDiscount + r.ledgerDiscount,
          netProfit: s.netProfit + r.netProfit,
        }),
        { invoices: 0, netRevenue: 0, cost: 0, grossProfit: 0, returnsProfit: 0, ledgerDiscount: 0, netProfit: 0 }
      ),
    [rows]
  )
  const totalMargin = totals.netRevenue > 0 ? (totals.netProfit / totals.netRevenue) * 100 : 0
  const s = data?.summary
  const summaryGrowth = s && Math.abs(s.previousNetProfit) > 0.005 ? ((s.netProfit - s.previousNetProfit) / Math.abs(s.previousNetProfit)) * 100 : null
  const figure = (n: number) => Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const toggleSort = (key: CustomerProfitSort) => {
    if (sort === key) setOrder(order === 'desc' ? 'asc' : 'desc')
    else {
      setSort(key)
      setOrder('desc')
    }
  }
  const SortHead = ({ k, children, className }: { k: CustomerProfitSort; children: React.ReactNode; className?: string }) => (
    <TableHead className={cn('text-right', className)}>
      <button type='button' onClick={() => toggleSort(k)} className='inline-flex items-center gap-1 hover:text-foreground'>
        {children}
        {sort === k ? order === 'desc' ? <ArrowDown className='h-3 w-3' /> : <ArrowUp className='h-3 w-3' /> : <ArrowUpDown className='h-3 w-3 opacity-40' />}
      </button>
    </TableHead>
  )

  const exportToExcel = () => {
    if (!rows.length) {
      toast.error(t('No data available to export'))
      return
    }
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        rows.map((r) => ({
          Rank: r.rank,
          Customer: r.name,
          Phone: r.phone || '',
          Invoices: r.invoices,
          [`Net sales (${currency})`]: r.netRevenue,
          [`Cost (${currency})`]: r.cost,
          [`Gross profit (${currency})`]: r.grossProfit,
          [`Returns reversed (${currency})`]: r.returnsProfit,
          [`Ledger discounts (${currency})`]: r.ledgerDiscount,
          [`Net profit (${currency})`]: r.netProfit,
          'Margin %': r.margin,
          [`Profit / invoice (${currency})`]: r.avgProfitPerInvoice,
          [`Previous period (${currency})`]: r.previousNetProfit,
          'Growth %': r.growth ?? '',
          [`Balance (${currency})`]: r.balance,
          'Last sale': r.lastSaleAt ? formatAppDate(new Date(r.lastSaleAt)) : '',
        }))
      ),
      'Customer Profit'
    )
    XLSX.writeFile(wb, `customer-profit-${startDate}-to-${endDate}.xlsx`)
    toast.success(t('Data exported successfully'))
  }
  useImperativeHandle(ref, () => ({ exportToExcel }))

  const print = () => {
    if (!data) return
    try {
      openPrintWindowForFormat(
        generateReportHTML(
          {
            title: t('Customer Profitability'),
            subtitle: filter === 'loss' ? t('Loss-making customers') : filter === 'discounted' ? t('Customers given ledger discounts') : undefined,
            periodStart: startDate,
            periodEnd: endDate,
            orientation: 'landscape',
            info: [{ label: t('Customers'), value: String(rows.length) }],
            summary: [
              { label: `${t('Net sales')} (${currency})`, value: figure(totals.netRevenue) },
              { label: `${t('Net profit')} (${currency})`, value: figure(totals.netProfit), emphasis: true },
              { label: t('Margin'), value: `${totalMargin.toFixed(1)}%` },
              { label: t('Loss-making'), value: String(rows.filter((r) => r.netProfit < 0).length) },
            ],
            sections: [
              {
                id: 'ranking',
                columns: [
                  { key: 'rank', label: '#', align: 'right', width: '4%' },
                  { key: 'name', label: t('Customer'), width: '18%' },
                  { key: 'inv', label: t('Invoices'), align: 'right' },
                  { key: 'sales', label: `${t('Net sales')} (${currency})`, align: 'right' },
                  { key: 'cost', label: `${t('Cost')} (${currency})`, align: 'right' },
                  { key: 'gross', label: `${t('Gross profit')} (${currency})`, align: 'right' },
                  { key: 'ret', label: `${t('Returns')} (${currency})`, align: 'right' },
                  { key: 'disc', label: `${t('Discounts')} (${currency})`, align: 'right' },
                  { key: 'net', label: `${t('Net profit')} (${currency})`, align: 'right' },
                  { key: 'margin', label: t('Margin'), align: 'right' },
                ],
                rows: [
                  ...rows.map((r) => ({
                    cells: {
                      rank: String(r.rank),
                      name: { text: r.name, sub: r.phone || undefined },
                      inv: String(r.invoices),
                      sales: figure(r.netRevenue),
                      cost: figure(r.cost),
                      gross: figure(r.grossProfit),
                      ret: r.returnsProfit ? figure(r.returnsProfit) : '',
                      disc: r.ledgerDiscount ? figure(r.ledgerDiscount) : '',
                      net: { text: figure(r.netProfit), strong: true },
                      margin: `${r.margin.toFixed(1)}%`,
                    },
                  })),
                  {
                    kind: 'total' as const,
                    label: t('Total'),
                    labelSpan: 2,
                    cells: {
                      inv: String(totals.invoices),
                      sales: figure(totals.netRevenue),
                      cost: figure(totals.cost),
                      gross: figure(totals.grossProfit),
                      ret: figure(totals.returnsProfit),
                      disc: figure(totals.ledgerDiscount),
                      net: { text: figure(totals.netProfit), strong: true },
                      margin: `${totalMargin.toFixed(1)}%`,
                    },
                  },
                ],
                empty: t('No customer sales in this period.'),
              },
            ],
            footnotes: [
              t('Net profit = profit on sales (after bill discounts) − profit reversed by returns − ledger discounts allowed. Walk-in sales are not included.'),
            ],
          },
          {
            companyName: resolveBranchCompanyName(org?.name, branch?.name) || org?.name,
            companyAddress: [branch?.location?.address, branch?.location?.city].filter(Boolean).join(', '),
            companyPhone: branch?.phone,
            companyLogo: org?.logo?.url,
            branchName: branch?.name,
            preparedBy: user?.name,
          },
          t
        ),
        'a4'
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Could not open the print window'))
    }
  }

  const maxProfit = Math.max(1, ...rows.map((r) => Math.abs(r.netProfit)))

  return (
    <div className='space-y-6'>
      {isFetching && !data ? (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className='h-28' />
          ))}
        </div>
      ) : s ? (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4'>
          <Kpi tone='emerald' icon={<TrendingUp className='h-5 w-5' />} label={t('Net profit from customers')} value={signed(fmt, s.netProfit)}>
            <GrowthBadge growth={summaryGrowth} />
            <span className='ml-1'>
              {t('vs')} {signed(fmt, s.previousNetProfit)}
            </span>
          </Kpi>
          <Kpi tone='sky' icon={<Percent className='h-5 w-5' />} label={t('Overall margin')} value={<MarginText margin={s.margin} className='text-xl' />}>
            {t('on')} {fmt(s.netRevenue)} {t('net sales')}
          </Kpi>
          <Kpi tone='violet' icon={<Crown className='h-5 w-5' />} label={t('Share of profit from top 20%')} value={`${s.topShare.toFixed(0)}%`}>
            {t('top')} {s.topCount} {s.topCount === 1 ? t('customer') : t('customers')}
          </Kpi>
          <Kpi tone={s.lossMaking ? 'rose' : 'slate'} icon={<AlertTriangle className='h-5 w-5' />} label={t('Loss-making customers')} value={String(s.lossMaking)}>
            {s.customers} {t('customers with sales')}
          </Kpi>
        </div>
      ) : null}

      <Card>
        <CardHeader className='gap-3 pb-3'>
          <div className='flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <CardTitle className='flex items-center gap-2 text-base'>
                <Users className='h-4 w-4' />
                {t('Customer Profitability')}
              </CardTitle>
              <CardDescription>{t('Profit on sales − returns − ledger discounts. Click a customer for the full breakdown.')}</CardDescription>
            </div>
            <Button variant='outline' size='sm' onClick={print} disabled={!data}>
              <Printer className='mr-2 h-4 w-4' />
              {t('Print')}
            </Button>
          </div>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
            <div className='flex overflow-hidden rounded-md border'>
              {(
                [
                  ['all', t('All')],
                  ['loss', t('Loss-making')],
                  ['discounted', t('Given discounts')],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type='button'
                  onClick={() => setFilter(v)}
                  className={cn('px-3 py-1.5 text-sm', filter === v ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className='relative sm:ml-auto sm:w-64'>
              <Search className='absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('Search customer or phone…')} className='pl-8' />
            </div>
          </div>
        </CardHeader>
        <CardContent className='px-0 sm:px-6'>
          <div className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  <TableHead className='w-10 text-right'>#</TableHead>
                  <TableHead className='min-w-[170px]'>{t('Customer')}</TableHead>
                  <SortHead k='invoices'>{t('Invoices')}</SortHead>
                  <SortHead k='netRevenue'>{t('Net sales')}</SortHead>
                  <TableHead className='text-right'>{t('Cost')}</TableHead>
                  <SortHead k='grossProfit'>{t('Gross profit')}</SortHead>
                  <TableHead className='text-right'>{t('Returns')}</TableHead>
                  <SortHead k='ledgerDiscount'>{t('Discounts')}</SortHead>
                  <SortHead k='netProfit' className='min-w-[150px]'>
                    {t('Net profit')}
                  </SortHead>
                  <SortHead k='margin'>{t('Margin')}</SortHead>
                  <SortHead k='avgProfitPerInvoice'>{t('Per invoice')}</SortHead>
                  <SortHead k='growth'>{t('Growth')}</SortHead>
                  <SortHead k='lastSaleAt'>{t('Last sale')}</SortHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={13} className='py-10 text-center text-sm text-muted-foreground'>
                      {isFetching ? t('Loading...') : t('No customer sales in this period.')}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.customerId} className={cn('cursor-pointer', r.netProfit < 0 && 'bg-red-50/50 dark:bg-red-950/20')} onClick={() => setSelected(r)}>
                      <TableCell className='text-right text-xs text-muted-foreground tabular-nums'>{r.rank}</TableCell>
                      <TableCell>
                        <div className='font-medium'>{r.name}</div>
                        {r.phone && <div className='text-xs text-muted-foreground'>{r.phone}</div>}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>{r.invoices}</TableCell>
                      <TableCell className='text-right tabular-nums'>{fmt(r.netRevenue)}</TableCell>
                      <TableCell className='text-right text-sm text-muted-foreground tabular-nums'>{fmt(r.cost)}</TableCell>
                      <TableCell className='text-right tabular-nums'>{signed(fmt, r.grossProfit)}</TableCell>
                      <TableCell className='text-right text-sm tabular-nums'>{r.returnsProfit ? `−${fmt(Math.abs(r.returnsProfit))}` : '—'}</TableCell>
                      <TableCell className='text-right text-sm tabular-nums text-amber-700 dark:text-amber-400'>{r.ledgerDiscount ? `−${fmt(r.ledgerDiscount)}` : '—'}</TableCell>
                      <TableCell className='text-right'>
                        <div className={cn('font-semibold tabular-nums', r.netProfit < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400')}>{signed(fmt, r.netProfit)}</div>
                        <div className='mt-1 ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-muted'>
                          <div
                            className={cn('ml-auto h-full rounded-full', r.netProfit < 0 ? 'bg-red-500' : 'bg-emerald-500')}
                            style={{ width: `${Math.max(3, (Math.abs(r.netProfit) / maxProfit) * 100)}%` }}
                          />
                        </div>
                      </TableCell>
                      <TableCell className='text-right'>
                        <MarginText margin={r.margin} />
                      </TableCell>
                      <TableCell className='text-right text-sm tabular-nums'>{signed(fmt, r.avgProfitPerInvoice)}</TableCell>
                      <TableCell className='text-right'>
                        <GrowthBadge growth={r.growth} />
                      </TableCell>
                      <TableCell className='text-right text-xs whitespace-nowrap text-muted-foreground'>
                        {r.lastSaleAt ? formatAppDate(new Date(r.lastSaleAt)) : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
              {rows.length > 0 && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={2} className='font-semibold'>
                      {t('Total')} ({rows.length})
                    </TableCell>
                    <TableCell className='text-right font-semibold tabular-nums'>{totals.invoices}</TableCell>
                    <TableCell className='text-right font-semibold tabular-nums'>{fmt(totals.netRevenue)}</TableCell>
                    <TableCell className='text-right tabular-nums'>{fmt(totals.cost)}</TableCell>
                    <TableCell className='text-right font-semibold tabular-nums'>{signed(fmt, totals.grossProfit)}</TableCell>
                    <TableCell className='text-right tabular-nums'>{totals.returnsProfit ? `−${fmt(Math.abs(totals.returnsProfit))}` : '—'}</TableCell>
                    <TableCell className='text-right tabular-nums'>{totals.ledgerDiscount ? `−${fmt(totals.ledgerDiscount)}` : '—'}</TableCell>
                    <TableCell className={cn('text-right font-bold tabular-nums', totals.netProfit < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400')}>
                      {signed(fmt, totals.netProfit)}
                    </TableCell>
                    <TableCell className='text-right'>
                      <MarginText margin={totalMargin} />
                    </TableCell>
                    <TableCell colSpan={3} />
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>

      <CustomerProfitSheet customerId={selected?.customerId ?? null} customerName={selected?.name} startDate={startDate} endDate={endDate} onClose={() => setSelected(null)} />
    </div>
  )
})
CustomerProfitReport.displayName = 'CustomerProfitReport'

function Kpi({
  tone,
  icon,
  label,
  value,
  children,
}: {
  tone: 'emerald' | 'sky' | 'violet' | 'rose' | 'slate'
  icon: React.ReactNode
  label: string
  value: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <Card className={kpiCardClass(tone)}>
      <CardContent className='flex items-center gap-3 p-4'>
        <div className={toneIconWrapClass(tone)}>{icon}</div>
        <div className='min-w-0'>
          <p className='text-xs text-muted-foreground'>{label}</p>
          <p className='text-xl font-bold tabular-nums'>{value}</p>
          <div className='flex flex-wrap items-center text-xs text-muted-foreground'>{children}</div>
        </div>
      </CardContent>
    </Card>
  )
}
