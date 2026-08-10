import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { ArrowDownLeft, ArrowUpRight, BookOpen, Landmark, Printer, ReceiptText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import { useGetWalletBalanceStatementQuery, type WalletBalanceDetailItem } from '@/stores/reports.api'
import { kpiCardClass } from '@/lib/stat-card-tones'
import { getBusinessToday, shiftBusinessCalendarDate } from '@/lib/business-timezone'

const fmt = (v: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0 }).format(v)

const formatDate = (value?: string) => {
  if (!value) return '-'
  try {
    return format(new Date(value), 'dd MMM yyyy')
  } catch {
    return value
  }
}

// Backend reference values are either a raw source enum ('cash_withdrawal', 'sim_sale', ...)
// or a Mongoose model name ('SupplierLedger', 'WalletTransfer', ...) — neither is fit for
// display as-is. Handles both generically instead of hardcoding a label per value, so a
// future new source/referenceModel doesn't need a matching UI change here too.
const formatReferenceLabel = (value: string): string => {
  if (!value) return '-'
  const spaced = value.includes('_')
    ? value.split('_').filter(Boolean).join(' ')
    : value.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return spaced
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

interface LedgerRow {
  id: string
  date: string
  title: string
  detail: string
  reference: string
  debit: number
  credit: number
  balance: number
}

interface BankAccountStatementPageProps {
  initialWalletType?: string
}

export default function BankAccountStatementPage({ initialWalletType }: BankAccountStatementPageProps) {
  const today = useMemo(() => getBusinessToday(), [])
  const { data: walletsData, isLoading: walletsLoading } = useGetWalletsQuery(undefined, {
    refetchOnFocus: true,
    refetchOnReconnect: true,
  })
  const wallets = walletsData?.results ?? []

  const [selectedWallet, setSelectedWallet] = useState(initialWalletType ?? '')
  const [startDate, setStartDate] = useState(shiftBusinessCalendarDate(today, -29))
  const [endDate, setEndDate] = useState(today)

  useMemo(() => {
    if (!selectedWallet && wallets.length > 0) {
      setSelectedWallet(initialWalletType && wallets.some((w) => w.type === initialWalletType) ? initialWalletType : wallets[0].type)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets])

  const selectedWalletInfo = wallets.find((w) => w.type === selectedWallet)

  // isFetching (not isLoading) — isLoading is only true before the very first result ever
  // arrives, so changing the wallet/date filters after that would otherwise silently keep
  // showing the previous filter's stale rows while refetching in the background. isFetching
  // covers both the first load and every subsequent refetch, so the skeleton below correctly
  // reappears on every filter change too.
  const { data, isFetching: statementLoading } = useGetWalletBalanceStatementQuery(
    { walletType: selectedWallet, startDate, endDate },
    { skip: !selectedWallet, refetchOnFocus: true, refetchOnReconnect: true },
  )

  const setTodayFilter = () => {
    setStartDate(today)
    setEndDate(today)
  }
  const setLast7DaysFilter = () => {
    setStartDate(shiftBusinessCalendarDate(today, -6))
    setEndDate(today)
  }
  const setLast30DaysFilter = () => {
    setStartDate(shiftBusinessCalendarDate(today, -29))
    setEndDate(today)
  }
  const setThisMonthFilter = () => {
    const now = new Date()
    setStartDate(format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd'))
    setEndDate(today)
  }

  const ledgerRows = useMemo<LedgerRow[]>(() => {
    if (!data?.rows?.length) return []
    let runningBalance = data.rows[0].openingBalance
    const result: LedgerRow[] = []

    data.rows.forEach((row) => {
      row.detailItems.forEach((item: WalletBalanceDetailItem) => {
        runningBalance += item.walletImpact
        const detailBits = [item.customerName, item.accountNumber, item.notes].filter(
          (bit) => bit && bit !== '—' && bit.trim().length > 0,
        )
        result.push({
          id: item.id,
          date: item.date,
          title: item.title,
          detail: detailBits.join(' · '),
          reference: formatReferenceLabel(item.referenceModel || item.source),
          debit: item.walletImpact < 0 ? Math.abs(item.walletImpact) : 0,
          credit: item.walletImpact > 0 ? item.walletImpact : 0,
          balance: runningBalance,
        })
      })
    })

    return result
  }, [data])

  const totalDebit = ledgerRows.reduce((sum, row) => sum + row.debit, 0)
  const totalCredit = ledgerRows.reduce((sum, row) => sum + row.credit, 0)

  const handleExport = () => {
    if (!data) {
      toast.error('No statement data available to export')
      return
    }
    try {
      const wb = XLSX.utils.book_new()
      const summaryRows = [
        { Metric: 'Bank Account', Value: selectedWallet || '-' },
        { Metric: 'Current Balance', Value: selectedWalletInfo?.balance ?? data.walletBalance ?? 0 },
        { Metric: 'Period Opening Balance', Value: data.periodOpeningBalance ?? 0 },
        { Metric: 'Period Closing Balance', Value: data.periodClosingBalance ?? 0 },
        { Metric: 'Total Credit (In)', Value: totalCredit },
        { Metric: 'Total Debit (Out)', Value: totalDebit },
      ]
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary')

      const txRows = ledgerRows.map((row) => ({
        Date: formatDate(row.date),
        Description: row.title,
        Details: row.detail,
        Reference: row.reference,
        Debit: row.debit || '',
        Credit: row.credit || '',
        Balance: row.balance,
      }))
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), 'Statement')

      XLSX.writeFile(wb, `bank-account-statement-${selectedWallet || 'account'}-${today}.xlsx`)
      toast.success('Statement exported successfully')
    } catch {
      toast.error('Failed to export statement')
    }
  }

  const handlePrint = () => window.print()

  return (
    <div className='space-y-6 p-4 md:p-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Bank Account Statement</h1>
          <p className='text-muted-foreground'>A running-balance ledger of every transaction posted to a bank account.</p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' onClick={handleExport} disabled={!data}>
            <BookOpen className='mr-2 h-4 w-4' />
            Export
          </Button>
          <Button variant='outline' onClick={handlePrint} disabled={!data}>
            <Printer className='mr-2 h-4 w-4' />
            Print
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className='grid gap-4 pt-6 md:grid-cols-3'>
          <div className='space-y-2'>
            <p className='text-sm font-medium'>Bank Account</p>
            {walletsLoading ? (
              <Skeleton className='h-9 w-full' />
            ) : (
              <Select value={selectedWallet} onValueChange={setSelectedWallet}>
                <SelectTrigger>
                  <SelectValue placeholder='Select a bank account' />
                </SelectTrigger>
                <SelectContent>
                  {wallets.map((w) => (
                    <SelectItem key={w.id} value={w.type}>
                      {w.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className='space-y-2 md:col-span-2'>
            <p className='text-sm font-medium'>Date Range</p>
            <div className='flex flex-wrap items-center gap-2'>
              <input
                type='date'
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className='h-9 rounded-md border bg-background px-3 text-sm'
              />
              <span className='text-muted-foreground'>to</span>
              <input
                type='date'
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className='h-9 rounded-md border bg-background px-3 text-sm'
              />
              <Button type='button' variant='outline' size='sm' onClick={setTodayFilter}>Today</Button>
              <Button type='button' variant='outline' size='sm' onClick={setLast7DaysFilter}>Last 7 Days</Button>
              <Button type='button' variant='outline' size='sm' onClick={setLast30DaysFilter}>Last 30 Days</Button>
              <Button type='button' variant='outline' size='sm' onClick={setThisMonthFilter}>This Month</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!selectedWallet ? (
        <Card>
          <CardContent className='py-12 text-center text-muted-foreground'>
            No bank accounts found. Add one from the Bank Accounts page.
          </CardContent>
        </Card>
      ) : statementLoading ? (
        <Skeleton className='h-[420px] w-full' />
      ) : data ? (
        <>
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-5'>
            <Card className={kpiCardClass('slate')}>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium'>Opening Balance</CardTitle>
              </CardHeader>
              <CardContent className='flex items-center justify-between'>
                <p className='text-xl font-bold'>{fmt(data.periodOpeningBalance)}</p>
                <Landmark className='h-4 w-4 text-muted-foreground' />
              </CardContent>
            </Card>
            <Card className={kpiCardClass('emerald')}>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium'>Total Credit (In)</CardTitle>
              </CardHeader>
              <CardContent className='flex items-center justify-between'>
                <p className='text-xl font-bold text-green-600'>+{fmt(totalCredit)}</p>
                <ArrowDownLeft className='h-4 w-4 text-green-600' />
              </CardContent>
            </Card>
            <Card className={kpiCardClass('rose')}>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium'>Total Debit (Out)</CardTitle>
              </CardHeader>
              <CardContent className='flex items-center justify-between'>
                <p className='text-xl font-bold text-red-600'>-{fmt(totalDebit)}</p>
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
            <Card className={kpiCardClass('cyan')}>
              <CardHeader className='pb-2'>
                <CardTitle className='text-sm font-medium'>Closing Balance</CardTitle>
              </CardHeader>
              <CardContent className='flex items-center justify-between'>
                <p className='text-xl font-bold text-purple-600'>{fmt(data.periodClosingBalance)}</p>
                <Landmark className='h-4 w-4 text-purple-600' />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Statement — {selectedWallet}</CardTitle>
            </CardHeader>
            <CardContent>
              {ledgerRows.length === 0 ? (
                <div className='py-10 text-center text-muted-foreground'>
                  No transactions found for the selected date range.
                </div>
              ) : (
                <div className='overflow-x-auto'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead className='text-right'>Debit</TableHead>
                        <TableHead className='text-right'>Credit</TableHead>
                        <TableHead className='text-right'>Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell colSpan={5} className='text-muted-foreground'>Opening Balance</TableCell>
                        <TableCell className='text-right font-semibold'>{fmt(data.periodOpeningBalance)}</TableCell>
                      </TableRow>
                      {ledgerRows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className='whitespace-nowrap'>{formatDate(row.date)}</TableCell>
                          <TableCell className='max-w-[260px]'>
                            <span className='font-medium'>{row.title}</span>
                            {row.detail && <span className='block text-xs text-muted-foreground line-clamp-1'>{row.detail}</span>}
                          </TableCell>
                          <TableCell className='text-xs text-muted-foreground whitespace-nowrap'>{row.reference}</TableCell>
                          <TableCell className='text-right text-red-600 whitespace-nowrap'>
                            {row.debit > 0 ? fmt(row.debit) : '—'}
                          </TableCell>
                          <TableCell className='text-right text-green-600 whitespace-nowrap'>
                            {row.credit > 0 ? fmt(row.credit) : '—'}
                          </TableCell>
                          <TableCell className='text-right font-semibold whitespace-nowrap'>{fmt(row.balance)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className='py-10 text-center text-muted-foreground'>
            Select a bank account to view its statement.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
