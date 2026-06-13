import { Fragment, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Download, Wallet, TrendingUp, ArrowDownCircle, ArrowUpCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { useGetWalletBalanceStatementQuery, type WalletBalanceStatement as WalletBalanceStatementData } from '@/stores/reports.api'
import { kpiCardClass } from '@/lib/stat-card-tones'

// ─── Props ────────────────────────────────────────────────────────────────────

interface WalletBalanceStatementProps {
  walletType: string | null
  startDate: string
  endDate: string
  onClose: () => void
  /** When true, hide cash withdrawal/deposit and show only load sales, purchases, and sim-sale load. */
  loadOnly?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 0,
  }).format(v)

const getFlowBadgeStyles = (impact: number) =>
  impact >= 0 ? 'bg-green-100 text-green-700 border-green-200' : 'bg-orange-100 text-orange-700 border-orange-200'

const getFlowLabel = (impact: number) => (impact >= 0 ? 'IN' : 'OUT')
const getPurchaseAmount = (amount: number, walletImpact: number) => (walletImpact >= 0 ? amount : 0)
const getSellAmount = (amount: number, walletImpact: number) => (walletImpact < 0 ? amount : 0)

const LOAD_SOURCES = new Set(['load', 'sim_sale', 'load_purchase'])

type LoadOnlyRow = WalletBalanceStatementData['rows'][number] & { totalPurchased: number }

function applyLoadOnlyFilter(statement: WalletBalanceStatementData): WalletBalanceStatementData & { rows: LoadOnlyRow[] } {
  const rows: LoadOnlyRow[] = statement.rows.map((row) => {
    const detailItems = row.detailItems.filter((item) => LOAD_SOURCES.has(item.source))
    const totalSold = detailItems
      .filter((item) => item.source === 'load' || item.source === 'sim_sale')
      .reduce((sum, item) => sum + item.amount, 0)
    const totalPurchased = detailItems
      .filter((item) => item.source === 'load_purchase')
      .reduce((sum, item) => sum + item.amount, 0)
    const totalProfit = detailItems.reduce((sum, item) => sum + item.profit, 0)

    return {
      ...row,
      detailItems,
      totalSold,
      totalPurchased,
      totalWithdrawals: 0,
      totalDeposits: 0,
      totalProfit,
      transactions: detailItems.length,
      hasSales: detailItems.length > 0,
    }
  })

  return { ...statement, rows }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WalletBalanceStatement({
  walletType,
  startDate,
  endDate,
  onClose,
  loadOnly = false,
}: WalletBalanceStatementProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})
  const [viewMode, setViewMode] = useState<'summary' | 'number-wise'>('summary')
  const skip = !walletType

  const { data: rawData, isLoading } = useGetWalletBalanceStatementQuery(
    { walletType: walletType!, startDate, endDate },
    { skip }
  )

  const data = useMemo(
    () => (rawData && loadOnly ? applyLoadOnlyFilter(rawData) : rawData),
    [rawData, loadOnly],
  )

  const handleExport = () => {
    try {
      if (!data) { toast.error('No data to export'); return }
      const wb = XLSX.utils.book_new()

      // Summary sheet
      const summary = [
        { Metric: 'Wallet', Value: data.walletType },
        { Metric: 'Current Balance', Value: data.walletBalance },
        { Metric: 'Period Opening Balance', Value: data.periodOpeningBalance },
        { Metric: 'Period Closing Balance', Value: data.periodClosingBalance },
        { Metric: '', Value: '' },
        { Metric: 'Period Start', Value: format(new Date(data.period.startDate), 'dd MMM yyyy') },
        { Metric: 'Period End', Value: format(new Date(data.period.endDate), 'dd MMM yyyy') },
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'Summary')

      // Daily rows
      const rows = data.rows.map((r) => ({
        Date: format(new Date(r.date), 'dd MMM yyyy'),
        'Opening Balance (Rs.)': r.openingBalance,
        'Sold (Rs.)': r.hasSales ? r.totalSold : '',
        'Profit (Rs.)': r.hasSales ? r.totalProfit : '',
        Transactions: r.hasSales ? r.transactions : '',
        'Closing Balance (Rs.)': r.closingBalance,
        Note: r.hasSales ? '' : 'No Sale',
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Daily Statement')

      const detailRows = data.rows.flatMap((r) =>
        r.detailItems.map((item) => ({
          Date: format(new Date(item.date), 'dd MMM yyyy'),
          Type: item.title,
          'Account / Number': item.accountNumber || '',
          Customer: item.customerName || '',
          Network: item.network || '',
          'Amount (Rs.)': item.amount,
          'Wallet Impact (Rs.)': item.walletImpact,
          'Cash Amount (Rs.)': item.cashAmount,
          'Extra Charge (Rs.)': item.extraCharge,
          'Profit (Rs.)': item.profit,
          'Payment Method': item.paymentMethod || '',
          Notes: item.notes || '',
        }))
      )
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'Transaction Details')

      XLSX.writeFile(wb, `${data.walletType}-balance-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
      toast.success('Statement exported')
    } catch {
      toast.error('Export failed')
    }
  }

  const totalSold = data?.rows.reduce((s, r) => s + r.totalSold, 0) ?? 0
  const totalPurchased = loadOnly
    ? (data?.rows as LoadOnlyRow[] | undefined)?.reduce((s, r) => s + r.totalPurchased, 0) ?? 0
    : 0
  const totalWithdrawals = loadOnly ? 0 : data?.rows.reduce((s, r) => s + r.totalWithdrawals, 0) ?? 0
  const totalDeposits = loadOnly ? 0 : data?.rows.reduce((s, r) => s + r.totalDeposits, 0) ?? 0
  const totalProfit = data?.rows.reduce((s, r) => s + r.totalProfit, 0) ?? 0
  const numberWiseRows = useMemo(() => {
    if (!data) return []
    let runningBalance = data.rows.length > 0 ? data.rows[0].openingBalance : data.periodOpeningBalance
    const result: Array<{
      date: string
      isNoDetails: boolean
      item?: (typeof data.rows)[number]['detailItems'][number]
      beforeBalance: number
      afterBalance: number
    }> = []

    data.rows.forEach((row) => {
      if (row.detailItems.length === 0) {
        result.push({
          date: row.date,
          isNoDetails: true,
          beforeBalance: runningBalance,
          afterBalance: runningBalance,
        })
        return
      }

      row.detailItems.forEach((item) => {
        const beforeBalance = runningBalance
        const afterBalance = beforeBalance + item.walletImpact
        result.push({
          date: row.date,
          isNoDetails: false,
          item,
          beforeBalance,
          afterBalance,
        })
        runningBalance = afterBalance
      })
    })

    return result
  }, [data])
  const numberWiseDetailRows = numberWiseRows.filter((r) => !r.isNoDetails && r.item)
  const numberWisePurchaseAmount = numberWiseDetailRows.reduce(
    (sum, row) => sum + (row.item ? getPurchaseAmount(row.item.amount, row.item.walletImpact) : 0),
    0
  )
  const numberWiseSellAmount = numberWiseDetailRows.reduce(
    (sum, row) => sum + (row.item ? getSellAmount(row.item.amount, row.item.walletImpact) : 0),
    0
  )
  const numberWiseTotalProfit = numberWiseDetailRows.reduce((sum, row) => sum + (row.item?.profit || 0), 0)
  const salesDays = data?.rows.filter((r) => r.hasSales).length ?? 0
  const noSaleDays = data?.rows.filter((r) => !r.hasSales).length ?? 0
  const summaryColSpan = loadOnly ? 8 : 9
  const toggleRow = (date: string) => {
    setExpandedRows((prev) => ({ ...prev, [date]: !prev[date] }))
  }

  return (
    <Dialog open={!!walletType} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-6xl'>
        <DialogHeader>
          <div className='flex items-center justify-between pr-6'>
            <DialogTitle className='flex items-center gap-2 capitalize'>
              <Wallet className='h-5 w-5' />
              {walletType} — {loadOnly ? 'Load Report' : 'Balance Statement'}
            </DialogTitle>
            <div className='flex items-center gap-2'>
              <Button
                size='sm'
                variant={viewMode === 'summary' ? 'default' : 'outline'}
                onClick={() => setViewMode('summary')}
              >
                Summary
              </Button>
              <Button
                size='sm'
                variant={viewMode === 'number-wise' ? 'default' : 'outline'}
                onClick={() => setViewMode('number-wise')}
              >
                Number Wise
              </Button>
              <Button size='sm' variant='outline' onClick={handleExport} disabled={!data}>
                <Download className='mr-1.5 h-4 w-4' />
                Export
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Period info */}
        {data && (
          <p className='text-xs text-muted-foreground -mt-2'>
            {format(new Date(data.period.startDate), 'dd MMM yyyy')}
            {' — '}
            {format(new Date(data.period.endDate), 'dd MMM yyyy')}
          </p>
        )}

        {isLoading ? (
          <div className='space-y-3'>
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
              {[...Array(4)].map((_, i) => <Skeleton key={i} className='h-20 w-full' />)}
            </div>
            <Skeleton className='h-[350px] w-full' />
          </div>
        ) : !data ? null : (
          <div className='space-y-4'>
            {viewMode === 'summary' && (
              <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${loadOnly ? 'lg:grid-cols-5' : 'lg:grid-cols-6'}`}>
                <Card className={kpiCardClass('slate')}>
                  <CardContent className='p-3'>
                    <div className='flex items-center justify-between mb-1'>
                      <p className='text-xs text-muted-foreground'>Opening Balance</p>
                      <ArrowDownCircle className='h-3.5 w-3.5 text-muted-foreground' />
                    </div>
                    <p className='text-lg font-bold'>{fmt(data.periodOpeningBalance)}</p>
                    <p className='text-xs text-muted-foreground'>start of period</p>
                  </CardContent>
                </Card>
                <Card className={kpiCardClass('sky')}>
                  <CardContent className='p-3'>
                    <div className='flex items-center justify-between mb-1'>
                      <p className='text-xs text-muted-foreground'>Load Sold</p>
                      <ArrowUpCircle className='h-3.5 w-3.5 text-blue-500' />
                    </div>
                    <p className='text-lg font-bold text-blue-600'>{fmt(totalSold)}</p>
                    <p className='text-xs text-muted-foreground'>{salesDays} active days</p>
                  </CardContent>
                </Card>
                {loadOnly ? (
                  <Card className={kpiCardClass('orange')}>
                    <CardContent className='p-3'>
                      <div className='flex items-center justify-between mb-1'>
                        <p className='text-xs text-muted-foreground'>Load Purchased</p>
                        <ArrowDownCircle className='h-3.5 w-3.5 text-orange-500' />
                      </div>
                      <p className='text-lg font-bold text-orange-600'>{fmt(totalPurchased)}</p>
                      <p className='text-xs text-muted-foreground'>stock added to wallet</p>
                    </CardContent>
                  </Card>
                ) : (
                  <>
                    <Card className={kpiCardClass('emerald')}>
                      <CardContent className='p-3'>
                        <div className='flex items-center justify-between mb-1'>
                          <p className='text-xs text-muted-foreground'>Received (+)</p>
                          <ArrowDownCircle className='h-3.5 w-3.5 text-green-500' />
                        </div>
                        <p className='text-lg font-bold text-green-600'>{fmt(totalWithdrawals)}</p>
                        <p className='text-xs text-muted-foreground'>cash out — balance ↑</p>
                      </CardContent>
                    </Card>
                    <Card className={kpiCardClass('orange')}>
                      <CardContent className='p-3'>
                        <div className='flex items-center justify-between mb-1'>
                          <p className='text-xs text-muted-foreground'>Send (−)</p>
                          <ArrowUpCircle className='h-3.5 w-3.5 text-orange-500' />
                        </div>
                        <p className='text-lg font-bold text-orange-600'>{fmt(totalDeposits)}</p>
                        <p className='text-xs text-muted-foreground'>cash in — balance ↓</p>
                      </CardContent>
                    </Card>
                  </>
                )}
                <Card className={kpiCardClass('emerald')}>
                  <CardContent className='p-3'>
                    <div className='flex items-center justify-between mb-1'>
                      <p className='text-xs text-muted-foreground'>Total Profit</p>
                      <TrendingUp className='h-3.5 w-3.5 text-green-500' />
                    </div>
                    <p className='text-lg font-bold text-green-600'>{fmt(totalProfit)}</p>
                    <p className='text-xs text-muted-foreground'>
                      {totalSold > 0 ? ((totalProfit / totalSold) * 100).toFixed(1) : '0'}% margin
                    </p>
                  </CardContent>
                </Card>
                <Card className={kpiCardClass('violet')}>
                  <CardContent className='p-3'>
                    <div className='flex items-center justify-between mb-1'>
                      <p className='text-xs text-muted-foreground'>Closing Balance</p>
                      <Wallet className='h-3.5 w-3.5 text-purple-500' />
                    </div>
                    <p className='text-lg font-bold text-purple-600'>{fmt(data.periodClosingBalance)}</p>
                    <p className='text-xs text-muted-foreground'>{noSaleDays} idle days</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Day-by-day table */}
            <div ref={tableRef}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-[160px]'>Date</TableHead>
                    {viewMode === 'summary' && (
                      <>
                        <TableHead className='text-right'>Opening Balance</TableHead>
                        <TableHead className='text-right'>Load Sold</TableHead>
                        {loadOnly ? (
                          <TableHead className='text-right text-orange-600'>Load Purchased</TableHead>
                        ) : (
                          <>
                            <TableHead className='text-right text-green-600'>Received (+)</TableHead>
                            <TableHead className='text-right text-orange-600'>Send (−)</TableHead>
                          </>
                        )}
                        <TableHead className='text-right'>Profit</TableHead>
                        <TableHead className='text-right'>Txns</TableHead>
                        <TableHead className='text-right'>Closing Balance</TableHead>
                        <TableHead className='text-center'>Status</TableHead>
                      </>
                    )}
                    {viewMode === 'number-wise' && (
                      <>
                        <TableHead>Type</TableHead>
                        <TableHead>Flow</TableHead>
                        <TableHead>Number / Account</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className='text-right'>Purchase</TableHead>
                        <TableHead className='text-right'>Sell</TableHead>
                        <TableHead className='text-right'>Profit</TableHead>
                        <TableHead>Balance</TableHead>
                      </>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewMode === 'summary' &&
                    data.rows.map((row) => (
                      <Fragment key={row.date}>
                        <TableRow className={!row.hasSales ? 'bg-muted/30 text-muted-foreground' : ''}>
                          <TableCell className='font-medium'>
                            <button
                              type='button'
                              className='inline-flex items-center gap-1.5 hover:text-foreground'
                              onClick={() => toggleRow(row.date)}
                              disabled={row.detailItems.length === 0}
                            >
                              {row.detailItems.length > 0 ? (
                                expandedRows[row.date] ? (
                                  <ChevronDown className='h-4 w-4' />
                                ) : (
                                  <ChevronRight className='h-4 w-4' />
                                )
                              ) : (
                                <span className='w-4' />
                              )}
                              {format(new Date(row.date), 'dd MMM yyyy')}
                            </button>
                          </TableCell>
                          <TableCell className='text-right'>{fmt(row.openingBalance)}</TableCell>
                          <TableCell className='text-right'>
                            {row.totalSold > 0 ? (
                              <span className='font-medium text-blue-600'>{fmt(row.totalSold)}</span>
                            ) : (
                              <span className='text-muted-foreground'>—</span>
                            )}
                          </TableCell>
                          {loadOnly ? (
                            <TableCell className='text-right'>
                              {(row as LoadOnlyRow).totalPurchased > 0 ? (
                                <span className='font-medium text-orange-600'>{fmt((row as LoadOnlyRow).totalPurchased)}</span>
                              ) : (
                                <span className='text-muted-foreground'>—</span>
                              )}
                            </TableCell>
                          ) : (
                            <>
                              <TableCell className='text-right'>
                                {row.totalWithdrawals > 0 ? (
                                  <span className='font-medium text-green-600'>+{fmt(row.totalWithdrawals)}</span>
                                ) : (
                                  <span className='text-muted-foreground'>—</span>
                                )}
                              </TableCell>
                              <TableCell className='text-right'>
                                {row.totalDeposits > 0 ? (
                                  <span className='font-medium text-orange-600'>−{fmt(row.totalDeposits)}</span>
                                ) : (
                                  <span className='text-muted-foreground'>—</span>
                                )}
                              </TableCell>
                            </>
                          )}
                          <TableCell className='text-right'>
                            {row.hasSales ? (
                              <span className='font-medium text-green-600'>{fmt(row.totalProfit)}</span>
                            ) : (
                              <span className='text-muted-foreground'>—</span>
                            )}
                          </TableCell>
                          <TableCell className='text-right'>
                            {row.hasSales ? (
                              <Badge variant='secondary'>{row.transactions}</Badge>
                            ) : (
                              <span className='text-muted-foreground'>—</span>
                            )}
                          </TableCell>
                          <TableCell className='text-right font-semibold'>
                            {fmt(row.closingBalance)}
                          </TableCell>
                          <TableCell className='text-center'>
                            {row.hasSales ? (
                              <Badge variant='default' className='bg-green-600 hover:bg-green-700 text-xs'>Active</Badge>
                            ) : (
                              <Badge variant='outline' className='text-xs text-muted-foreground'>{loadOnly ? 'No Load' : 'No Sale'}</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                        {expandedRows[row.date] && row.detailItems.length > 0 && (
                          <TableRow className='bg-muted/20'>
                            <TableCell colSpan={summaryColSpan} className='py-2'>
                              <div className='space-y-2'>
                                {row.detailItems.map((item) => (
                                  <div
                                    key={item.id}
                                    className='grid grid-cols-1 gap-2 rounded-md border bg-background p-3 text-xs sm:grid-cols-6'
                                  >
                                    <div>
                                      <p className='text-muted-foreground'>Type</p>
                                      <p className='font-semibold'>{item.title}</p>
                                    </div>
                                    <div>
                                      <p className='text-muted-foreground'>Number / Account</p>
                                      <p className='font-semibold'>{item.accountNumber || '—'}</p>
                                    </div>
                                    <div>
                                      <p className='text-muted-foreground'>Customer</p>
                                      <p className='font-semibold'>{item.customerName || '—'}</p>
                                    </div>
                                    <div>
                                      <p className='text-muted-foreground'>Amount / Profit</p>
                                      <p className='font-semibold'>
                                        {fmt(item.amount)} · <span className='text-green-600'>{fmt(item.profit)}</span>
                                      </p>
                                    </div>
                                    <div>
                                      <p className='text-muted-foreground'>Wallet Impact</p>
                                      <p className={item.walletImpact >= 0 ? 'font-semibold text-green-600' : 'font-semibold text-orange-600'}>
                                        {item.walletImpact >= 0 ? '+' : ''}
                                        {fmt(item.walletImpact)}
                                      </p>
                                    </div>
                                    <div>
                                      <p className='text-muted-foreground'>Notes</p>
                                      <p className='font-semibold'>{item.notes || item.network || '—'}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    ))}
                  {viewMode === 'number-wise' &&
                    numberWiseRows.map((entry, idx) => {
                      const showDate =
                        idx === 0 || numberWiseRows[idx - 1].date !== entry.date
                      if (entry.isNoDetails || !entry.item) {
                        return (
                          <TableRow key={`no-detail-${entry.date}-${idx}`}>
                            <TableCell className='font-medium'>
                              {showDate ? format(new Date(entry.date), 'dd MMM yyyy') : ''}
                            </TableCell>
                            <TableCell className='text-muted-foreground'>{loadOnly ? 'No load activity' : 'No details'}</TableCell>
                            <TableCell />
                            <TableCell />
                            <TableCell />
                            <TableCell />
                            <TableCell />
                            <TableCell />
                            <TableCell className='text-right text-xs text-muted-foreground'>
                              {fmt(entry.afterBalance)}
                            </TableCell>
                          </TableRow>
                        )
                      }

                      return (
                        <TableRow key={`${entry.date}-${entry.item.id}-${idx}`}>
                          <TableCell className='font-medium'>
                            {showDate ? format(new Date(entry.date), 'dd MMM yyyy') : ''}
                          </TableCell>
                          <TableCell>{entry.item.title}</TableCell>
                          <TableCell>
                            <Badge variant='outline' className={getFlowBadgeStyles(entry.item.walletImpact)}>
                              {getFlowLabel(entry.item.walletImpact)}
                            </Badge>
                          </TableCell>
                          <TableCell>{entry.item.accountNumber || '—'}</TableCell>
                          <TableCell>{entry.item.customerName || '—'}</TableCell>
                          <TableCell className='text-right'>
                            {entry.item.walletImpact >= 0 ? (
                              <span className='font-medium text-green-600'>+{fmt(entry.item.amount)}</span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className='text-right'>
                            {entry.item.walletImpact < 0 ? (
                              <span className='font-medium text-red-600'>-{fmt(entry.item.amount)}</span>
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className='text-right text-green-600 font-semibold'>
                            {fmt(entry.item.profit)}
                          </TableCell>
                          <TableCell className='text-right font-semibold'>{fmt(entry.afterBalance)}</TableCell>
                        </TableRow>
                      )
                    })}
                  {viewMode === 'summary' && (
                    <TableRow className='border-t-2 font-bold bg-muted/50'>
                      <TableCell>Total</TableCell>
                      <TableCell className='text-right'>{fmt(data.periodOpeningBalance)}</TableCell>
                      <TableCell className='text-right text-blue-600'>{fmt(totalSold)}</TableCell>
                      {loadOnly ? (
                        <TableCell className='text-right text-orange-600'>{fmt(totalPurchased)}</TableCell>
                      ) : (
                        <>
                          <TableCell className='text-right text-green-600'>+{fmt(totalWithdrawals)}</TableCell>
                          <TableCell className='text-right text-orange-600'>−{fmt(totalDeposits)}</TableCell>
                        </>
                      )}
                      <TableCell className='text-right text-green-600'>{fmt(totalProfit)}</TableCell>
                      <TableCell className='text-right'>
                        <Badge>{data.rows.reduce((s, r) => s + r.transactions, 0)}</Badge>
                      </TableCell>
                      <TableCell className='text-right text-purple-600'>{fmt(data.periodClosingBalance)}</TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                  {viewMode === 'number-wise' && (
                    <TableRow className='border-t-2 font-bold bg-muted/50'>
                      <TableCell>Total</TableCell>
                      <TableCell>{numberWiseDetailRows.length} entries</TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell className='text-right text-green-600'>+{fmt(numberWisePurchaseAmount)}</TableCell>
                      <TableCell className='text-right text-red-600'>-{fmt(numberWiseSellAmount)}</TableCell>
                      <TableCell className='text-right text-green-600'>{fmt(numberWiseTotalProfit)}</TableCell>
                      <TableCell className='text-right text-xs text-muted-foreground'>
                        {fmt(data.periodClosingBalance)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            {viewMode === 'number-wise' && (
              <p className='text-xs text-muted-foreground'>
                {loadOnly
                  ? 'Showing load sales, sim-sale load, and load purchases only.'
                  : 'Note: Purchase/Sell totals are based on wallet flow direction. Positive flow appears in Purchase and negative flow appears in Sell.'}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
