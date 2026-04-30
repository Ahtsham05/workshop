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
import { useGetWalletBalanceStatementQuery } from '@/stores/reports.api'

// ─── Props ────────────────────────────────────────────────────────────────────

interface WalletBalanceStatementProps {
  walletType: string | null
  startDate: string
  endDate: string
  onClose: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('en-PK', {
    style: 'currency',
    currency: 'PKR',
    minimumFractionDigits: 0,
  }).format(v)

// ─── Component ────────────────────────────────────────────────────────────────

export function WalletBalanceStatement({
  walletType,
  startDate,
  endDate,
  onClose,
}: WalletBalanceStatementProps) {
  const tableRef = useRef<HTMLDivElement>(null)
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})
  const [viewMode, setViewMode] = useState<'summary' | 'number-wise'>('summary')
  const skip = !walletType

  const { data, isLoading } = useGetWalletBalanceStatementQuery(
    { walletType: walletType!, startDate, endDate },
    { skip }
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
  const totalWithdrawals = data?.rows.reduce((s, r) => s + r.totalWithdrawals, 0) ?? 0
  const totalDeposits = data?.rows.reduce((s, r) => s + r.totalDeposits, 0) ?? 0
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
  const numberWiseTotalAmount = numberWiseDetailRows.reduce((sum, row) => sum + (row.item?.amount || 0), 0)
  const numberWiseWalletImpact = numberWiseDetailRows.reduce((sum, row) => sum + (row.item?.walletImpact || 0), 0)
  const numberWiseTotalProfit = numberWiseDetailRows.reduce((sum, row) => sum + (row.item?.profit || 0), 0)
  const salesDays = data?.rows.filter((r) => r.hasSales).length ?? 0
  const noSaleDays = data?.rows.filter((r) => !r.hasSales).length ?? 0
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
              {walletType} — Balance Statement
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
              <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
                <Card>
                  <CardContent className='p-3'>
                    <div className='flex items-center justify-between mb-1'>
                      <p className='text-xs text-muted-foreground'>Opening Balance</p>
                      <ArrowDownCircle className='h-3.5 w-3.5 text-muted-foreground' />
                    </div>
                    <p className='text-lg font-bold'>{fmt(data.periodOpeningBalance)}</p>
                    <p className='text-xs text-muted-foreground'>start of period</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className='p-3'>
                    <div className='flex items-center justify-between mb-1'>
                      <p className='text-xs text-muted-foreground'>Total Sold</p>
                      <ArrowUpCircle className='h-3.5 w-3.5 text-blue-500' />
                    </div>
                    <p className='text-lg font-bold text-blue-600'>{fmt(totalSold)}</p>
                    <p className='text-xs text-muted-foreground'>{salesDays} active days</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className='p-3'>
                    <div className='flex items-center justify-between mb-1'>
                      <p className='text-xs text-muted-foreground'>Withdrawals (+)</p>
                      <ArrowDownCircle className='h-3.5 w-3.5 text-green-500' />
                    </div>
                    <p className='text-lg font-bold text-green-600'>{fmt(totalWithdrawals)}</p>
                    <p className='text-xs text-muted-foreground'>cash out — balance ↑</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className='p-3'>
                    <div className='flex items-center justify-between mb-1'>
                      <p className='text-xs text-muted-foreground'>Deposits (−)</p>
                      <ArrowUpCircle className='h-3.5 w-3.5 text-orange-500' />
                    </div>
                    <p className='text-lg font-bold text-orange-600'>{fmt(totalDeposits)}</p>
                    <p className='text-xs text-muted-foreground'>cash in — balance ↓</p>
                  </CardContent>
                </Card>
                <Card>
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
                <Card>
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
                        <TableHead className='text-right text-green-600'>W.Draw (+)</TableHead>
                        <TableHead className='text-right text-orange-600'>Deposit (−)</TableHead>
                        <TableHead className='text-right'>Profit</TableHead>
                        <TableHead className='text-right'>Txns</TableHead>
                        <TableHead className='text-right'>Closing Balance</TableHead>
                        <TableHead className='text-center'>Status</TableHead>
                      </>
                    )}
                    {viewMode === 'number-wise' && (
                      <>
                        <TableHead>Type</TableHead>
                        <TableHead>Number / Account</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className='text-right'>Amount</TableHead>
                        <TableHead className='text-right'>Wallet Impact</TableHead>
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
                              <Badge variant='outline' className='text-xs text-muted-foreground'>No Sale</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                        {expandedRows[row.date] && row.detailItems.length > 0 && (
                          <TableRow className='bg-muted/20'>
                            <TableCell colSpan={9} className='py-2'>
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
                      const isFirstRowOfDate = showDate
                      if (entry.isNoDetails || !entry.item) {
                        return (
                          <TableRow key={`no-detail-${entry.date}-${idx}`}>
                            <TableCell className='font-medium'>
                              {showDate ? format(new Date(entry.date), 'dd MMM yyyy') : ''}
                            </TableCell>
                            <TableCell className='text-muted-foreground'>No details</TableCell>
                            <TableCell />
                            <TableCell />
                            <TableCell />
                            <TableCell />
                            <TableCell />
                            <TableCell className='text-xs text-muted-foreground'>
                              Before: {fmt(entry.beforeBalance)}
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
                          <TableCell>{entry.item.accountNumber || '—'}</TableCell>
                          <TableCell>{entry.item.customerName || '—'}</TableCell>
                          <TableCell className='text-right'>{fmt(entry.item.amount)}</TableCell>
                          <TableCell
                            className={`text-right font-semibold ${
                              entry.item.walletImpact >= 0
                                ? 'text-green-600'
                                : 'text-orange-600'
                            }`}
                          >
                            {entry.item.walletImpact >= 0 ? '+' : ''}
                            {fmt(entry.item.walletImpact)}
                          </TableCell>
                          <TableCell className='text-right text-green-600 font-semibold'>
                            {fmt(entry.item.profit)}
                          </TableCell>
                          <TableCell>
                            <div className='text-xs leading-tight'>
                              {isFirstRowOfDate && (
                                <p className='text-muted-foreground'>Before: {fmt(entry.beforeBalance)}</p>
                              )}
                              <p className='font-semibold'>After Txn: {fmt(entry.afterBalance)}</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  {viewMode === 'summary' && (
                    <TableRow className='border-t-2 font-bold bg-muted/50'>
                      <TableCell>Total</TableCell>
                      <TableCell className='text-right'>{fmt(data.periodOpeningBalance)}</TableCell>
                      <TableCell className='text-right text-blue-600'>{fmt(totalSold)}</TableCell>
                      <TableCell className='text-right text-green-600'>+{fmt(totalWithdrawals)}</TableCell>
                      <TableCell className='text-right text-orange-600'>−{fmt(totalDeposits)}</TableCell>
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
                      <TableCell className='text-right text-blue-600'>{fmt(numberWiseTotalAmount)}</TableCell>
                      <TableCell
                        className={`text-right ${
                          numberWiseWalletImpact >= 0 ? 'text-green-600' : 'text-orange-600'
                        }`}
                      >
                        {numberWiseWalletImpact >= 0 ? '+' : ''}
                        {fmt(numberWiseWalletImpact)}
                      </TableCell>
                      <TableCell className='text-right text-green-600'>{fmt(numberWiseTotalProfit)}</TableCell>
                      <TableCell className='text-xs text-muted-foreground'>
                        End Balance: {fmt(data.periodClosingBalance)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
