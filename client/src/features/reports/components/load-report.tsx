import { forwardRef, useImperativeHandle, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useGetLoadReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { Wallet, TrendingUp, ShoppingCart, CircleDollarSign, ArrowDownCircle, ArrowUpCircle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { WalletBalanceStatement } from './wallet-balance-statement'

interface LoadReportProps {
  startDate: string
  endDate: string
}

export const LoadReport = forwardRef<{ exportToExcel: () => void }, LoadReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const { data, isLoading } = useGetLoadReportQuery({ startDate, endDate })
    const [selectedWallet, setSelectedWallet] = useState<string | null>(null)

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data) { toast.error(t('No data available to export')); return }
          const wb = XLSX.utils.book_new()

          const summaryData = [
            { Metric: 'Total Transactions', Value: data.summary.totalTransactions },
            { Metric: 'Total Sold', Value: data.summary.totalSold },
            { Metric: 'Total Profit', Value: data.summary.totalProfit },
            { Metric: 'Total Extra Charges', Value: data.summary.totalExtraCharges },
            { Metric: 'Total Purchased', Value: data.summary.totalPurchased },
            { Metric: 'Net Balance', Value: data.summary.netBalance },
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary')

          if (data.byWallet.length > 0) {
            const bwData = data.byWallet.map(r => ({ Wallet: r._id, Transactions: r.transactions, 'Total Sold': r.totalSold, Profit: r.totalProfit }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bwData), 'By Wallet')
          }
          if (data.datewise.length > 0) {
            const dwData = data.datewise.map(r => ({ Date: r._id, Transactions: r.transactions, 'Total Sold': r.totalSold, Profit: r.totalProfit }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dwData), 'Date-wise')
          }
          if (data.wallets.length > 0) {
            const wData = data.wallets.map(r => ({ Type: r.type, Balance: r.balance }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wData), 'Wallet Balances')
          }

          XLSX.writeFile(wb, `load-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch {
          toast.error(t('Failed to export data'))
        }
      },
    }))

    if (isLoading) return <Skeleton className='h-[400px] w-full' />

    const fmt = (v: number) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(v)
    const s = data?.summary

    return (
      <div className='space-y-6'>
        {/* Summary cards */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Transactions</CardTitle>
              <Wallet className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{s?.totalTransactions ?? 0}</div>
              <p className='text-xs text-muted-foreground'>load transactions in period</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Sold</CardTitle>
              <CircleDollarSign className='h-4 w-4 text-blue-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-blue-600'>{fmt(s?.totalSold ?? 0)}</div>
              <p className='text-xs text-muted-foreground'>load sold to customers</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Profit</CardTitle>
              <TrendingUp className='h-4 w-4 text-green-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-green-600'>{fmt(s?.totalProfit ?? 0)}</div>
              <p className='text-xs text-muted-foreground'>earned from commissions &amp; charges</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Purchased</CardTitle>
              <ShoppingCart className='h-4 w-4 text-orange-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-orange-600'>{fmt(s?.totalPurchased ?? 0)}</div>
              <p className='text-xs text-muted-foreground'>load purchased from suppliers</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Net Inventory Balance</CardTitle>
              <Wallet className='h-4 w-4 text-purple-500' />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(s?.netBalance ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(s?.netBalance ?? 0)}
              </div>
              <p className='text-xs text-muted-foreground'>purchased minus sold</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Extra Charges</CardTitle>
              <CircleDollarSign className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{fmt(s?.totalExtraCharges ?? 0)}</div>
              <p className='text-xs text-muted-foreground'>additional charges collected</p>
            </CardContent>
          </Card>
        </div>

        {/* Current Wallet Balances */}
        {(data?.wallets?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Current Wallet Balances</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
                {data!.wallets.map(w => (
                  <div
                    key={w._id}
                    className='rounded-lg border p-3 cursor-pointer hover:border-primary hover:bg-muted/30 transition-colors'
                    onClick={() => setSelectedWallet(w.type)}
                    title={`View ${w.type} balance statement`}
                  >
                    <p className='text-sm font-medium capitalize'>{w.type}</p>
                    <p className='text-xl font-bold text-blue-600'>{fmt(w.balance)}</p>
                    <p className='text-xs text-muted-foreground mt-1'>Click to view statement →</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* By Wallet type */}
        {(data?.byWallet?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Sales by Wallet / Network</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet / Network</TableHead>
                    <TableHead className='text-right'>Transactions</TableHead>
                    <TableHead className='text-right'>Total Sold</TableHead>
                    <TableHead className='text-right'>Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.byWallet.map(row => (
                    <TableRow
                      key={row._id}
                      className='cursor-pointer hover:bg-muted/50'
                      onClick={() => setSelectedWallet(row._id)}
                    >
                      <TableCell className='font-medium capitalize'>{row._id}</TableCell>
                      <TableCell className='text-right'><Badge variant='secondary'>{row.transactions}</Badge></TableCell>
                      <TableCell className='text-right text-blue-600 font-medium'>{fmt(row.totalSold)}</TableCell>
                      <TableCell className='text-right text-green-600 font-medium'>{fmt(row.totalProfit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Stock purchased by wallet */}
        {(data?.purchases?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Load Purchased — by Wallet</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet / Network</TableHead>
                    <TableHead className='text-right'>Purchases</TableHead>
                    <TableHead className='text-right'>Total Purchased</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.purchases.map(row => (
                    <TableRow key={row._id}>
                      <TableCell className='font-medium capitalize'>{row._id}</TableCell>
                      <TableCell className='text-right'><Badge variant='secondary'>{row.count}</Badge></TableCell>
                      <TableCell className='text-right text-orange-600 font-medium'>{fmt(row.totalPurchased)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Date-wise */}
        {(data?.datewise?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Date-wise Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className='text-right'>Transactions</TableHead>
                    <TableHead className='text-right'>Total Sold</TableHead>
                    <TableHead className='text-right'>Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.datewise.map(row => (
                    <TableRow key={row._id}>
                      <TableCell>{row._id}</TableCell>
                      <TableCell className='text-right'><Badge variant='secondary'>{row.transactions}</Badge></TableCell>
                      <TableCell className='text-right text-blue-600 font-medium'>{fmt(row.totalSold)}</TableCell>
                      <TableCell className='text-right text-green-600 font-medium'>{fmt(row.totalProfit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Cash Withdrawal / Deposit section */}
        {(data?.withdrawalSummary?.totalCount ?? 0) > 0 && (
          <>
            <div>
              <h3 className='mb-3 text-base font-semibold text-muted-foreground uppercase tracking-wide'>Cash Withdrawal &amp; Deposit</h3>
              <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                <Card>
                  <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                    <CardTitle className='text-sm font-medium'>Total Transactions</CardTitle>
                    <Wallet className='h-4 w-4 text-muted-foreground' />
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold'>{data!.withdrawalSummary.totalCount}</div>
                    <p className='text-xs text-muted-foreground'>
                      {data!.withdrawalSummary.totalWithdrawals} withdrawals · {data!.withdrawalSummary.totalDeposits} deposits
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                    <CardTitle className='text-sm font-medium'>Withdrawals (cash out)</CardTitle>
                    <ArrowUpCircle className='h-4 w-4 text-blue-500' />
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold text-blue-600'>{fmt(data!.withdrawalSummary.totalWithdrawalAmount)}</div>
                    <p className='text-xs text-muted-foreground'>customer digital → you give cash</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                    <CardTitle className='text-sm font-medium'>Deposits (cash in)</CardTitle>
                    <ArrowDownCircle className='h-4 w-4 text-orange-500' />
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold text-orange-600'>{fmt(data!.withdrawalSummary.totalDepositAmount)}</div>
                    <p className='text-xs text-muted-foreground'>customer gives cash → you send digital</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                    <CardTitle className='text-sm font-medium'>Commission Profit</CardTitle>
                    <TrendingUp className='h-4 w-4 text-green-500' />
                  </CardHeader>
                  <CardContent>
                    <div className='text-2xl font-bold text-green-600'>{fmt(data!.withdrawalSummary.totalProfit)}</div>
                    <p className='text-xs text-muted-foreground'>earned from withdrawal &amp; deposit commission</p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {(data?.withdrawalDatewise?.length ?? 0) > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Withdrawal / Deposit — Date-wise</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead className='text-right'>Count</TableHead>
                        <TableHead className='text-right'>Withdrawals</TableHead>
                        <TableHead className='text-right'>Deposits</TableHead>
                        <TableHead className='text-right'>Commission Profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data!.withdrawalDatewise.map(row => (
                        <TableRow key={row._id}>
                          <TableCell>{row._id}</TableCell>
                          <TableCell className='text-right'><Badge variant='secondary'>{row.count}</Badge></TableCell>
                          <TableCell className='text-right text-blue-600 font-medium'>{fmt(row.totalWithdrawalAmount)}</TableCell>
                          <TableCell className='text-right text-orange-600 font-medium'>{fmt(row.totalDepositAmount)}</TableCell>
                          <TableCell className='text-right text-green-600 font-medium'>{fmt(row.totalProfit)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {!(data?.byWallet?.length) && !(data?.datewise?.length) && !(data?.withdrawalDatewise?.length) && (
          <Card>
            <CardContent className='py-12 text-center text-muted-foreground'>
              No load transactions found for the selected date range.
            </CardContent>
          </Card>
        )}

        {/* Wallet Balance Statement Dialog */}
        <WalletBalanceStatement
          walletType={selectedWallet}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setSelectedWallet(null)}
        />
      </div>
    )
  }
)

LoadReport.displayName = 'LoadReport'
