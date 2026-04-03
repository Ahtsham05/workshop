import { useRef } from 'react'
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
import { Download, Wallet, TrendingUp, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
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
  const salesDays = data?.rows.filter((r) => r.hasSales).length ?? 0
  const noSaleDays = data?.rows.filter((r) => !r.hasSales).length ?? 0

  return (
    <Dialog open={!!walletType} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-4xl'>
        <DialogHeader>
          <div className='flex items-center justify-between pr-6'>
            <DialogTitle className='flex items-center gap-2 capitalize'>
              <Wallet className='h-5 w-5' />
              {walletType} — Balance Statement
            </DialogTitle>
            <Button size='sm' variant='outline' onClick={handleExport} disabled={!data}>
              <Download className='mr-1.5 h-4 w-4' />
              Export
            </Button>
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
            {/* Summary cards */}
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

            {/* Day-by-day table */}
            <div ref={tableRef}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-[130px]'>Date</TableHead>
                    <TableHead className='text-right'>Opening Balance</TableHead>
                    <TableHead className='text-right'>Load Sold</TableHead>
                    <TableHead className='text-right text-green-600'>W.Draw (+)</TableHead>
                    <TableHead className='text-right text-orange-600'>Deposit (−)</TableHead>
                    <TableHead className='text-right'>Profit</TableHead>
                    <TableHead className='text-right'>Txns</TableHead>
                    <TableHead className='text-right'>Closing Balance</TableHead>
                    <TableHead className='text-center'>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((row) => (
                    <TableRow
                      key={row.date}
                      className={!row.hasSales ? 'bg-muted/30 text-muted-foreground' : ''}
                    >
                      <TableCell className='font-medium'>
                        {format(new Date(row.date), 'dd MMM yyyy')}
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
                  ))}
                  {/* Totals row */}
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
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
