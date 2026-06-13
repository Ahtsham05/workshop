import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ArrowDownLeft, ArrowUpRight, Wallet, TrendingUp, ReceiptText } from 'lucide-react'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import { useGetWalletBalanceStatementQuery, type WalletBalanceDetailItem } from '@/stores/reports.api'
import { filterCashWallets } from '@/features/mobile-shop/utils/wallet-utils'
import { kpiCardClass } from '@/lib/stat-card-tones'

interface MyWalletReportProps {
  startDate: string
  endDate: string
}

const fmt = (v: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0 }).format(v)

function formatReceiveSendTitle(item: WalletBalanceDetailItem) {
  if (item.transactionType === 'withdrawal') return 'Receive'
  if (item.transactionType === 'deposit') return 'Send'
  return item.title
}

export const MyWalletReport = forwardRef<{ exportToExcel: () => void }, MyWalletReportProps>(
  ({ startDate, endDate }, ref) => {
    const { data: walletsData, isLoading: walletsLoading } = useGetWalletsQuery(undefined, {
      refetchOnFocus: true,
      refetchOnReconnect: true,
      refetchOnMountOrArgChange: true,
    })
    const allWallets = walletsData?.results ?? []
    const cashWallets = useMemo(() => filterCashWallets(allWallets), [allWallets])
    const [selectedWallet, setSelectedWallet] = useState<string>('')

    useEffect(() => {
      if (cashWallets.length === 0) {
        setSelectedWallet('')
        return
      }
      const stillValid = cashWallets.some((w) => w.type === selectedWallet)
      if (!selectedWallet || !stillValid) {
        setSelectedWallet(cashWallets[0].type ?? '')
      }
    }, [selectedWallet, cashWallets])

    const { data, isLoading: statementLoading } = useGetWalletBalanceStatementQuery(
      {
        walletType: selectedWallet,
        startDate,
        endDate,
      },
      {
        skip: !selectedWallet,
        refetchOnFocus: true,
        refetchOnReconnect: true,
        refetchOnMountOrArgChange: true,
      }
    )

    const selectedWalletInfo = useMemo(
      () => cashWallets.find((w) => w.type === selectedWallet),
      [cashWallets, selectedWallet]
    )

    const ledgerRows = useMemo(() => {
      if (!data?.rows?.length) return []
      let runningBalance = data.rows[0].openingBalance
      const result: Array<{
        id: string
        date: string
        title: string
        accountNumber: string
        accountType: string
        customerName: string
        receiveAmount: number
        sendAmount: number
        profit: number
        balance: number
      }> = []

      data.rows.forEach((row) => {
        row.detailItems
          .filter((item) => item.source === 'cash_withdrawal')
          .forEach((item) => {
            runningBalance += item.walletImpact
            result.push({
              id: item.id,
              date: item.date,
              title: formatReceiveSendTitle(item),
              accountNumber: item.accountNumber || '—',
              accountType: item.customerAccountType || item.network || '—',
              customerName: item.customerName || '—',
              receiveAmount: item.transactionType === 'withdrawal' ? item.amount : 0,
              sendAmount: item.transactionType === 'deposit' ? item.amount : 0,
              profit: item.profit || 0,
              balance: runningBalance,
            })
          })
      })

      return result
    }, [data])

    const totalReceived = ledgerRows.reduce((sum, row) => sum + row.receiveAmount, 0)
    const totalSend = ledgerRows.reduce((sum, row) => sum + row.sendAmount, 0)
    const totalProfit = ledgerRows.reduce((sum, row) => sum + row.profit, 0)

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data) {
            toast.error('No wallet report data available to export')
            return
          }

          const wb = XLSX.utils.book_new()

          const summaryRows = [
            { Metric: 'Wallet', Value: selectedWallet || '-' },
            { Metric: 'Current Balance', Value: selectedWalletInfo?.balance ?? data.walletBalance ?? 0 },
            { Metric: 'Period Opening Balance', Value: data.periodOpeningBalance ?? 0 },
            { Metric: 'Period Closing Balance', Value: data.periodClosingBalance ?? 0 },
            { Metric: 'Total Received', Value: totalReceived },
            { Metric: 'Total Send', Value: totalSend },
            { Metric: 'Commission Profit', Value: totalProfit },
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary')

          const txRows = ledgerRows.map((row) => ({
            Date: format(new Date(row.date), 'dd MMM yyyy'),
            Type: row.title,
            'Number / Account': row.accountNumber,
            'Account Type': row.accountType,
            Customer: row.customerName,
            Receive: row.receiveAmount || '',
            Send: row.sendAmount || '',
            'Commission Profit': row.profit,
            Balance: row.balance,
          }))
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), 'Transactions')

          XLSX.writeFile(wb, `wallet-report-${selectedWallet || 'wallet'}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success('Wallet report exported successfully')
        } catch {
          toast.error('Failed to export wallet report')
        }
      },
    }))

    if (walletsLoading || statementLoading) return <Skeleton className='h-[420px] w-full' />

    if (cashWallets.length === 0) {
      return (
        <Card>
          <CardContent className='py-12 text-center text-muted-foreground'>
            No receive/send wallets found. Create a cash wallet in Wallet Management (do not include &quot;Load&quot; in the name).
          </CardContent>
        </Card>
      )
    }

    return (
      <div className='space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle>Receive / Send Report</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-3'>
            <div className='space-y-2'>
              <p className='text-sm font-medium'>Wallet</p>
              <Select value={selectedWallet} onValueChange={setSelectedWallet}>
                <SelectTrigger>
                  <SelectValue placeholder='Select wallet' />
                </SelectTrigger>
                <SelectContent>
                  {cashWallets.map((wallet) => (
                    <SelectItem key={wallet.id} value={wallet.type}>
                      <span className='capitalize'>{wallet.type}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='rounded-lg border p-3'>
              <p className='text-xs text-muted-foreground'>Period</p>
              <p className='font-medium'>
                {data ? `${format(new Date(data.period.startDate), 'dd MMM yyyy')} - ${format(new Date(data.period.endDate), 'dd MMM yyyy')}` : '-'}
              </p>
            </div>
            <div className='rounded-lg border p-3'>
              <p className='text-xs text-muted-foreground'>Current Balance</p>
              <p className='text-lg font-bold text-purple-600'>
                {fmt(selectedWalletInfo?.balance ?? data?.walletBalance ?? 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        {data ? (
          <>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'>
              <Card className={kpiCardClass('slate')}>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Opening Balance</CardTitle>
                </CardHeader>
                <CardContent className='flex items-center justify-between'>
                  <p className='text-xl font-bold'>{fmt(data.periodOpeningBalance)}</p>
                  <Wallet className='h-4 w-4 text-muted-foreground' />
                </CardContent>
              </Card>
              <Card className={kpiCardClass('emerald')}>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Total Received</CardTitle>
                </CardHeader>
                <CardContent className='flex items-center justify-between'>
                  <p className='text-xl font-bold text-green-600'>+{fmt(totalReceived)}</p>
                  <ArrowDownLeft className='h-4 w-4 text-green-600' />
                </CardContent>
              </Card>
              <Card className={kpiCardClass('rose')}>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Total Send</CardTitle>
                </CardHeader>
                <CardContent className='flex items-center justify-between'>
                  <p className='text-xl font-bold text-red-600'>-{fmt(totalSend)}</p>
                  <ArrowUpRight className='h-4 w-4 text-red-600' />
                </CardContent>
              </Card>
              <Card className={kpiCardClass('indigo')}>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Transactions</CardTitle>
                </CardHeader>
                <CardContent className='flex items-center justify-between'>
                  <p className='text-xl font-bold'>{ledgerRows.length}</p>
                  <ReceiptText className='h-4 w-4 text-muted-foreground' />
                </CardContent>
              </Card>
              <Card className={kpiCardClass('emerald')}>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Commission Profit</CardTitle>
                </CardHeader>
                <CardContent className='flex items-center justify-between'>
                  <p className='text-xl font-bold text-green-600'>{fmt(totalProfit)}</p>
                  <TrendingUp className='h-4 w-4 text-green-600' />
                </CardContent>
              </Card>
              <Card className={kpiCardClass('cyan')}>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Closing Balance</CardTitle>
                </CardHeader>
                <CardContent className='flex items-center justify-between'>
                  <p className='text-xl font-bold text-purple-600'>{fmt(data.periodClosingBalance)}</p>
                  <Wallet className='h-4 w-4 text-purple-600' />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Receive / Send Ledger</CardTitle>
              </CardHeader>
              <CardContent>
                {ledgerRows.length === 0 ? (
                  <div className='py-10 text-center text-muted-foreground'>
                    No receive/send transactions found for selected date range.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Number / Account</TableHead>
                        <TableHead>Account Type</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className='text-right'>Receive</TableHead>
                        <TableHead className='text-right'>Send</TableHead>
                        <TableHead className='text-right'>Commission Profit</TableHead>
                        <TableHead className='text-right'>Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledgerRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{format(new Date(row.date), 'dd MMM yyyy')}</TableCell>
                          <TableCell className='font-medium'>{row.title}</TableCell>
                          <TableCell>{row.accountNumber}</TableCell>
                          <TableCell className='capitalize'>{row.accountType}</TableCell>
                          <TableCell>{row.customerName}</TableCell>
                          <TableCell className='text-right text-green-600'>
                            {row.receiveAmount > 0 ? `+${fmt(row.receiveAmount)}` : '—'}
                          </TableCell>
                          <TableCell className='text-right text-red-600'>
                            {row.sendAmount > 0 ? `-${fmt(row.sendAmount)}` : '—'}
                          </TableCell>
                          <TableCell className='text-right'>
                            <Badge variant='secondary'>{fmt(row.profit)}</Badge>
                          </TableCell>
                          <TableCell className='text-right font-semibold'>{fmt(row.balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className='py-10 text-center text-muted-foreground'>
              Select a wallet to view report.
            </CardContent>
          </Card>
        )}
      </div>
    )
  }
)

MyWalletReport.displayName = 'MyWalletReport'
