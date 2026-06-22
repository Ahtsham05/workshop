import { useMemo, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, NotebookText, Wallet, BookOpen, Pencil, Check, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { MobilePageShell } from '../components/mobile-page-shell'
import {
  useGetCashBookEntriesQuery,
  useGetCashBookSummaryQuery,
  useGetOpeningBalanceQuery,
  useSetOpeningBalanceMutation,
} from '@/stores/mobile-shop.api'
import {
  formatBusinessDateTime,
  getBusinessToday,
  shiftBusinessCalendarDate,
} from '@/lib/business-timezone'

export default function CashBookPage() {
  const today = useMemo(() => getBusinessToday(), [])
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
  const [cashBookPage, setCashBookPage] = useState(1)
  const [cashBookLimit, setCashBookLimit] = useState(10)

  const queryParams = useMemo(() => {
    if (!startDate || !endDate) {
      return undefined
    }
    // Send calendar dates only; server applies Pakistan (PKT) day boundaries.
    return {
      startDate,
      endDate,
      page: cashBookPage,
      limit: cashBookLimit,
      paymentMethod: 'cash' as const,
    }
  }, [startDate, endDate, cashBookPage, cashBookLimit])

  const { data: summary } = useGetCashBookSummaryQuery(queryParams)
  const { data: entries } = useGetCashBookEntriesQuery(queryParams)
  const { data: openingBalanceData } = useGetOpeningBalanceQuery()
  const [setOpeningBalance, { isLoading: savingOpeningBalance }] = useSetOpeningBalanceMutation()

  const [editingOpeningBalance, setEditingOpeningBalance] = useState(false)
  const [openingBalanceInput, setOpeningBalanceInput] = useState('')

  const handleEditOpeningBalance = () => {
    setOpeningBalanceInput(String(openingBalanceData?.amount ?? 0))
    setEditingOpeningBalance(true)
  }

  const handleSaveOpeningBalance = async () => {
    const amount = parseFloat(openingBalanceInput) || 0
    await setOpeningBalance({ amount })
    setEditingOpeningBalance(false)
  }

  const handleCancelOpeningBalance = () => {
    setEditingOpeningBalance(false)
  }

  const setTodayFilter = () => {
    const value = getBusinessToday()
    setStartDate(value)
    setEndDate(value)
    setCashBookPage(1)
  }

  const setYesterdayFilter = () => {
    const value = shiftBusinessCalendarDate(getBusinessToday(), -1)
    setStartDate(value)
    setEndDate(value)
    setCashBookPage(1)
  }

  const setLast7DaysFilter = () => {
    const end = getBusinessToday()
    const start = shiftBusinessCalendarDate(end, -6)
    setStartDate(start)
    setEndDate(end)
    setCashBookPage(1)
  }

  const clearDateFilter = () => {
    setStartDate('')
    setEndDate('')
    setCashBookPage(1)
  }

  return (
    <MobilePageShell
      title='Cash Book'
      description='Cash payments only — matches Track Cash expected balance. Credit, bank, and wallet payments are tracked in their own modules.'
    >
      {/* Opening Balance Setup */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='flex items-center justify-between text-base'>
            <span className='flex items-center gap-2'>
              <BookOpen className='h-4 w-4' />
              Manual Opening Balance
            </span>
            {!editingOpeningBalance && (
              <Button variant='ghost' size='sm' onClick={handleEditOpeningBalance}>
                <Pencil className='h-3.5 w-3.5 mr-1' /> Edit
              </Button>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {editingOpeningBalance ? (
            <div className='flex items-center gap-2'>
              <span className='text-sm text-muted-foreground'>Rs</span>
              <Input
                type='number'
                min='0'
                value={openingBalanceInput}
                onChange={(e) => setOpeningBalanceInput(e.target.value)}
                className='w-40'
                autoFocus
              />
              <Button size='sm' onClick={handleSaveOpeningBalance} disabled={savingOpeningBalance}>
                <Check className='h-3.5 w-3.5 mr-1' /> Save
              </Button>
              <Button size='sm' variant='ghost' onClick={handleCancelOpeningBalance}>
                <X className='h-3.5 w-3.5 mr-1' /> Cancel
              </Button>
            </div>
          ) : (
            <p className='text-2xl font-semibold'>
              Rs {(openingBalanceData?.amount ?? 0).toLocaleString()}
            </p>
          )}
          <p className='text-xs text-muted-foreground mt-1'>
            This is a standalone balance that reflects cash you had before using this system. It does not affect sales, purchases, or any other module.
          </p>
        </CardContent>
      </Card>
      <Card className='my-4'>
        <CardHeader className='pt-5'>
          <CardTitle>Date Filter</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4 pb-5'>
          <div className='grid gap-4 md:grid-cols-2'>
            <div className='space-y-2'>
              <Label htmlFor='cashbook-start-date'>Start Date</Label>
              <Input
                id='cashbook-start-date'
                type='date'
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='cashbook-end-date'>End Date</Label>
              <Input
                id='cashbook-end-date'
                type='date'
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </div>
          </div>

          <div className='flex flex-wrap gap-2'>
            <Button type='button' variant='outline' size='sm' onClick={setTodayFilter}>Today</Button>
            <Button type='button' variant='outline' size='sm' onClick={setYesterdayFilter}>Yesterday</Button>
            <Button type='button' variant='outline' size='sm' onClick={setLast7DaysFilter}>Last 7 Days</Button>
            <Button type='button' variant='ghost' size='sm' onClick={clearDateFilter}>All Time</Button>
          </div>
        </CardContent>
      </Card>

      <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>
        <StatCard
          title='Opening Balance'
          value={summary?.openingBalance || 0}
          icon={<BookOpen className='h-4 w-4' />}
          valuePrefix='Rs '
          description='Balance before selected period'
          tone='slate'
        />
        <StatCard
          title='Total Income'
          value={summary?.totalIncome || 0}
          icon={<ArrowUpCircle className='h-4 w-4' />}
          valuePrefix='Rs '
          description='Cash income in selected period'
          tone='emerald'
        />
        <StatCard
          title='Total Expense'
          value={summary?.totalExpense || 0}
          icon={<ArrowDownCircle className='h-4 w-4' />}
          valuePrefix='Rs '
          description='Cash book expense entries'
          tone='rose'
        />
        <StatCard
          title='Cash in Hand'
          value={summary?.closingBalance || 0}
          icon={<Wallet className='h-4 w-4' />}
          valuePrefix='Rs '
          description='Same as Track Cash expected balance'
          tone='cyan'
        />
      </div>

      <Card className='mt-6'>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <NotebookText className='h-5 w-5' />
            Cash Book Entries
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className='text-red-600'>Debit (Expense)</TableHead>
                <TableHead className='text-green-600'>Credit (Income)</TableHead>
                <TableHead className='text-right'>Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(entries?.results ?? []).filter((e) => e.source !== 'opening_balance').map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatBusinessDateTime(entry.date)}</TableCell>
                  <TableCell>{entry.source ? entry.source.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '-'}</TableCell>
                  <TableCell className='capitalize'>{entry.paymentMethod}</TableCell>
                  <TableCell>{entry.description || 'No description'}</TableCell>
                  <TableCell className='text-red-600'>
                    {entry.type === 'expense' ? `Rs ${entry.amount.toLocaleString()}` : '-'}
                  </TableCell>
                  <TableCell className='text-green-600'>
                    {entry.type === 'income' ? `Rs ${entry.amount.toLocaleString()}` : '-'}
                  </TableCell>
                  <TableCell className='text-right font-medium'>Rs {entry.balance.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <SimplePagination
            currentPage={cashBookPage}
            totalPages={entries?.totalPages ?? 1}
            totalResults={entries?.totalResults}
            limit={cashBookLimit}
            onPageChange={setCashBookPage}
            onLimitChange={(l) => { setCashBookLimit(l); setCashBookPage(1) }}
            className='mt-3'
          />
        </CardContent>
      </Card>
    </MobilePageShell>
  )
}