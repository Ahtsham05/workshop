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
import { useGetWalletBalanceStatementQuery } from '@/stores/reports.api'

interface MyWalletReportProps {
  startDate: string
  endDate: string
}

const fmt = (v: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0 }).format(v)

export const MyWalletReport = forwardRef<{ exportToExcel: () => void }, MyWalletReportProps>(
  ({ startDate, endDate }, ref) => {
    const { data: walletsData, isLoading: walletsLoading } = useGetWalletsQuery()
    const wallets = walletsData?.results ?? []
    const [selectedWallet, setSelectedWallet] = useState<string>('')

    useEffect(() => {
      if (!selectedWallet && wallets.length > 0) {
        setSelectedWallet(wallets[0].type)
      }
    }, [selectedWallet, wallets])

    const { data, isLoading: statementLoading } = useGetWalletBalanceStatementQuery(
      {
        walletType: selectedWallet,
        startDate,
        endDate,
      },
      { skip: !selectedWallet }
    )

    const selectedWalletInfo = useMemo(
      () => wallets.find((w) => w.type === selectedWallet),
      [wallets, selectedWallet]
    )

    const ledgerRows = useMemo(() => {
      if (!data?.rows?.length) return []
      let runningBalance = data.rows[0].openingBalance
      const result: Array<{
        id: string
        date: string
        title: string
        accountNumber: string
        customerName: string
        inAmount: number
        outAmount: number
        profit: number
        balance: number
      }> = []

      data.rows.forEach((row) => {
        row.detailItems.forEach((item) => {
          runningBalance += item.walletImpact
          result.push({
            id: item.id,
            date: item.date,
            title: item.title,
            accountNumber: item.accountNumber || '—',
            customerName: item.customerName || '—',
            inAmount: item.walletImpact > 0 ? item.amount : 0,
            outAmount: item.walletImpact < 0 ? item.amount : 0,
            profit: item.profit || 0,
            balance: runningBalance,
          })
        })
      })

      return result
    }, [data])

    const totalIn = ledgerRows.reduce((sum, row) => sum + row.inAmount, 0)
    const totalOut = ledgerRows.reduce((sum, row) => sum + row.outAmount, 0)
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
            { Metric: 'Total Inflow', Value: totalIn },
            { Metric: 'Total Outflow', Value: totalOut },
            { Metric: 'Total Profit', Value: totalProfit },
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary')

          const txRows = ledgerRows.map((row) => ({
            Date: format(new Date(row.date), 'dd MMM yyyy'),
            Type: row.title,
            'Number / Account': row.accountNumber,
            Customer: row.customerName,
            'In (+)': row.inAmount || '',
            'Out (-)': row.outAmount || '',
            Profit: row.profit,
            Balance: row.balance,
          }))
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), 'Transactions')

          XLSX.writeFile(wb, `my-wallet-report-${selectedWallet || 'wallet'}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success('Wallet report exported successfully')
        } catch {
          toast.error('Failed to export wallet report')
        }
      },
    }))

    if (walletsLoading || statementLoading) return <Skeleton className='h-[420px] w-full' />

    return (
      <div className='space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle>My Wallet Report</CardTitle>
          </CardHeader>
          <CardContent className='grid gap-4 md:grid-cols-3'>
            <div className='space-y-2'>
              <p className='text-sm font-medium'>Wallet</p>
              <Select value={selectedWallet} onValueChange={setSelectedWallet}>
                <SelectTrigger>
                  <SelectValue placeholder='Select wallet' />
                </SelectTrigger>
                <SelectContent>
                  {wallets.map((wallet) => (
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
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-5'>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Opening Balance</CardTitle>
                </CardHeader>
                <CardContent className='flex items-center justify-between'>
                  <p className='text-xl font-bold'>{fmt(data.periodOpeningBalance)}</p>
                  <Wallet className='h-4 w-4 text-muted-foreground' />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Total Inflow</CardTitle>
                </CardHeader>
                <CardContent className='flex items-center justify-between'>
                  <p className='text-xl font-bold text-green-600'>+{fmt(totalIn)}</p>
                  <ArrowDownLeft className='h-4 w-4 text-green-600' />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Total Outflow</CardTitle>
                </CardHeader>
                <CardContent className='flex items-center justify-between'>
                  <p className='text-xl font-bold text-red-600'>-{fmt(totalOut)}</p>
                  <ArrowUpRight className='h-4 w-4 text-red-600' />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Transactions</CardTitle>
                </CardHeader>
                <CardContent className='flex items-center justify-between'>
                  <p className='text-xl font-bold'>{ledgerRows.length}</p>
                  <ReceiptText className='h-4 w-4 text-muted-foreground' />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm font-medium'>Closing Balance</CardTitle>
                </CardHeader>
                <CardContent className='flex items-center justify-between'>
                  <p className='text-xl font-bold text-purple-600'>{fmt(data.periodClosingBalance)}</p>
                  <TrendingUp className='h-4 w-4 text-purple-600' />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Wallet Transaction Ledger</CardTitle>
              </CardHeader>
              <CardContent>
                {ledgerRows.length === 0 ? (
                  <div className='py-10 text-center text-muted-foreground'>
                    No wallet transactions found for selected date range.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Number / Account</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className='text-right'>In (+)</TableHead>
                        <TableHead className='text-right'>Out (-)</TableHead>
                        <TableHead className='text-right'>Profit</TableHead>
                        <TableHead className='text-right'>Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ledgerRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell>{format(new Date(row.date), 'dd MMM yyyy')}</TableCell>
                          <TableCell className='font-medium'>{row.title}</TableCell>
                          <TableCell>{row.accountNumber}</TableCell>
                          <TableCell>{row.customerName}</TableCell>
                          <TableCell className='text-right text-green-600'>
                            {row.inAmount > 0 ? `+${fmt(row.inAmount)}` : '—'}
                          </TableCell>
                          <TableCell className='text-right text-red-600'>
                            {row.outAmount > 0 ? `-${fmt(row.outAmount)}` : '—'}
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
