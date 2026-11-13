import { useMemo, useState } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, BookOpen, Search, Users, Wallet, HandCoins, Scale } from 'lucide-react'
import { useGetEmployeesWithLedgerBalancesQuery, type EmployeeStatement, type EmployeeWithBalance } from '@/stores/hr.api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePermissions } from '@/context/permission-context'
import { useFormatMoney } from '@/lib/format-money'
import { formatAppDate } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import { PaymentVoucherDialog, type InitialPaymentLine } from '@/features/payment-vouchers/components/payment-voucher-dialog'
import { ReceiptVoucherDialog, type InitialReceiptLine } from '@/features/payment-vouchers/components/receipt-voucher-dialog'
import { EmployeeStatementPanel } from './components/employee-statement-panel'
import { BALANCE_SIDE_LABEL, BALANCE_TONE, balanceSide } from './utils/employee-ledger'

type BalanceFilter = 'all' | 'payable' | 'advance' | 'settled'
type StatusFilter = 'active' | 'former' | 'all'
type SortKey = 'balance' | 'name' | 'activity'

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

/** What "Pay" should start with: the salary due, or an advance when nothing is due. */
const payLineFor = (employee: { id: string; payableNow: number }): InitialPaymentLine => ({
  payeeType: 'employee',
  employeeId: employee.id,
  employeePurpose: employee.payableNow > 0 ? 'salary' : 'advance',
  amount: employee.payableNow > 0 ? round2(employee.payableNow) : 0,
})

/** What "Receive" should start with: whatever the employee owes. */
const receiveLineFor = (employee: { id: string; receivableNow: number }): InitialReceiptLine => ({
  sourceType: 'employee',
  employeeId: employee.id,
  amount: employee.receivableNow > 0 ? round2(employee.receivableNow) : 0,
  description: employee.receivableNow > 0 ? 'Advance returned' : '',
})

function KpiCard({ title, value, hint, icon: Icon, tone }: { title: string; value: string; hint: string; icon: React.ElementType; tone: string }) {
  return (
    <Card>
      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>{title}</CardTitle>
        <Icon className={cn('h-4 w-4', tone)} />
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold tabular-nums', tone)}>{value}</div>
        <p className='mt-1 text-xs text-muted-foreground'>{hint}</p>
      </CardContent>
    </Card>
  )
}

function BalanceCell({ value }: { value: number }) {
  const formatMoney = useFormatMoney()
  const side = balanceSide(value)
  if (side === 'settled') return <span className='text-muted-foreground'>Settled</span>
  return (
    <span className={cn('whitespace-nowrap font-semibold tabular-nums', BALANCE_TONE[side])}>
      {formatMoney(Math.abs(value))}
      <span className='ml-1 text-[10px] font-medium uppercase tracking-wide opacity-80'>{BALANCE_SIDE_LABEL[side]}</span>
    </span>
  )
}

/**
 * Employee Ledger — every employee's running account in one place: salary earned (payroll),
 * salary paid, advances given, cash received back, and what is due either way. Payments and
 * receipts are recorded as Payment / Receipt Vouchers (so the bank, Cash Book and expenses move
 * with them), straight from here.
 */
export default function EmployeeLedgerPage() {
  const formatMoney = useFormatMoney()
  const navigate = useNavigate()
  const search = useSearch({ strict: false }) as { employeeId?: string }
  const selectedId = search.employeeId || ''
  const { hasExplicitPermission } = usePermissions()
  const canRecord = hasExplicitPermission('managePaymentVouchers')

  const { data, isLoading, isError } = useGetEmployeesWithLedgerBalancesQuery(undefined, { refetchOnMountOrArgChange: true })
  const employees = useMemo<EmployeeWithBalance[]>(() => (Array.isArray(data) ? data : []), [data])

  const [query, setQuery] = useState('')
  const [balanceFilter, setBalanceFilter] = useState<BalanceFilter>('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [sortKey, setSortKey] = useState<SortKey>('balance')

  const [payLines, setPayLines] = useState<InitialPaymentLine[] | null>(null)
  const [receiveLines, setReceiveLines] = useState<InitialReceiptLine[] | null>(null)

  const select = (employeeId: string | null) => {
    navigate({ to: '/hr/employee-ledger', search: (employeeId ? { employeeId } : {}) as never, replace: false })
    // The statement replaces the list — start reading it from the top (matters on a phone).
    document.querySelector('main')?.scrollTo?.({ top: 0 })
    window.scrollTo({ top: 0 })
  }

  const totals = useMemo(() => {
    const payable = employees.reduce((sum, e) => sum + (e.payableNow || 0), 0)
    const receivable = employees.reduce((sum, e) => sum + (e.receivableNow || 0), 0)
    return {
      payable: round2(payable),
      receivable: round2(receivable),
      net: round2(payable - receivable),
      payableCount: employees.filter((e) => e.payableNow > 0.005).length,
      receivableCount: employees.filter((e) => e.receivableNow > 0.005).length,
      active: employees.filter((e) => e.employmentStatus === 'Active').length,
    }
  }, [employees])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = employees.filter((e) => {
      if (statusFilter === 'active' && e.employmentStatus !== 'Active') return false
      if (statusFilter === 'former' && e.employmentStatus === 'Active') return false
      if (balanceFilter !== 'all' && balanceSide(e.currentBalance) !== balanceFilter) return false
      if (!q) return true
      return [e.name, e.employeeId, e.designation, e.department, e.phone].some((v) => String(v || '').toLowerCase().includes(q))
    })
    return rows.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name)
      if (sortKey === 'activity') return new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime()
      return Math.abs(b.currentBalance) - Math.abs(a.currentBalance) || a.name.localeCompare(b.name)
    })
  }, [employees, query, balanceFilter, statusFilter, sortKey])

  const visibleTotals = useMemo(
    () => ({
      earned: round2(visible.reduce((s, e) => s + e.totalPayable, 0)),
      paid: round2(visible.reduce((s, e) => s + e.totalSalaryPaid, 0)),
      advance: round2(visible.reduce((s, e) => s + e.outstandingAdvance, 0)),
      balance: round2(visible.reduce((s, e) => s + e.currentBalance, 0)),
    }),
    [visible]
  )

  const selectedRow = employees.find((e) => e.id === selectedId)
  const fromStatement = (statement: EmployeeStatement) => ({ id: statement.employee.id, ...statement.summary })

  return (
    <div className='space-y-6 p-4 md:p-6'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div className='min-w-0'>
          <h1 className='text-2xl font-bold tracking-tight'>Employee Ledger</h1>
          <p className='text-muted-foreground'>
            Salary earned and paid, advances given and cash received back — every employee&apos;s running account.
          </p>
        </div>
        {canRecord && (
          <div className='flex flex-wrap gap-2'>
            <Button onClick={() => setPayLines([{ payeeType: 'employee', employeePurpose: 'salary' }])}>
              <ArrowUpRight className='mr-2 h-4 w-4' />
              Pay Employee
            </Button>
            <Button variant='outline' onClick={() => setReceiveLines([{ sourceType: 'employee' }])}>
              <ArrowDownLeft className='mr-2 h-4 w-4' />
              Receive from Employee
            </Button>
          </div>
        )}
      </div>

      {/* Team-wide figures; an open statement carries the employee's own. */}
      <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4', selectedId && 'hidden')}>
        <KpiCard
          title='Salary payable'
          value={formatMoney(totals.payable)}
          hint={`${totals.payableCount} employee${totals.payableCount === 1 ? '' : 's'} to be paid`}
          icon={Wallet}
          tone='text-amber-700 dark:text-amber-400'
        />
        <KpiCard
          title='Advances to recover'
          value={formatMoney(totals.receivable)}
          hint={`${totals.receivableCount} employee${totals.receivableCount === 1 ? '' : 's'} owe the business`}
          icon={HandCoins}
          tone='text-sky-700 dark:text-sky-400'
        />
        <KpiCard
          title='Net position'
          value={formatMoney(Math.abs(totals.net))}
          hint={totals.net > 0.005 ? 'Owed to staff overall' : totals.net < -0.005 ? 'Owed by staff overall' : 'All square'}
          icon={Scale}
          tone={totals.net > 0.005 ? 'text-amber-700 dark:text-amber-400' : totals.net < -0.005 ? 'text-sky-700 dark:text-sky-400' : 'text-muted-foreground'}
        />
        <KpiCard title='Active employees' value={String(totals.active)} hint={`${employees.length} on record`} icon={Users} tone='text-foreground' />
      </div>

      {selectedId ? (
        <Card>
          <CardContent className='space-y-4 pt-6'>
            <Button variant='ghost' size='sm' className='-ml-2' onClick={() => select(null)}>
              <ArrowLeft className='mr-1.5 h-4 w-4' />
              All employees
            </Button>
            <EmployeeStatementPanel
              key={selectedId}
              employeeId={selectedId}
              fallbackName={selectedRow?.name}
              onPay={canRecord ? (statement) => setPayLines([payLineFor(fromStatement(statement))]) : undefined}
              onReceive={canRecord ? (statement) => setReceiveLines([receiveLineFor(fromStatement(statement))]) : undefined}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className='space-y-3'>
            <CardTitle className='text-base'>Employee balances</CardTitle>
            <div className='flex flex-wrap items-center gap-2'>
              <div className='relative w-full sm:w-72'>
                <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder='Search name, ID, designation…' className='pl-8' />
              </div>
              <Select value={balanceFilter} onValueChange={(v) => setBalanceFilter(v as BalanceFilter)}>
                <SelectTrigger className='w-[150px]'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All balances</SelectItem>
                  <SelectItem value='payable'>Salary payable</SelectItem>
                  <SelectItem value='advance'>Owes us (advance)</SelectItem>
                  <SelectItem value='settled'>Settled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger className='w-[140px]'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='active'>Active staff</SelectItem>
                  <SelectItem value='former'>Former staff</SelectItem>
                  <SelectItem value='all'>Everyone</SelectItem>
                </SelectContent>
              </Select>
              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className='w-[160px]'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='balance'>Largest balance</SelectItem>
                  <SelectItem value='name'>Name A–Z</SelectItem>
                  <SelectItem value='activity'>Latest activity</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className='overflow-x-auto rounded-lg border'>
              <Table className='min-w-[920px]'>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className='text-right'>Monthly salary</TableHead>
                    <TableHead className='text-right'>Salary earned</TableHead>
                    <TableHead className='text-right'>Salary paid</TableHead>
                    <TableHead className='text-right'>Advance outstanding</TableHead>
                    <TableHead className='text-right'>Balance</TableHead>
                    <TableHead>Last activity</TableHead>
                    <TableHead className='text-right'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className='py-10 text-center text-muted-foreground'>
                        Loading employees…
                      </TableCell>
                    </TableRow>
                  ) : isError ? (
                    <TableRow>
                      <TableCell colSpan={8} className='py-10 text-center text-muted-foreground'>
                        Could not load employee balances.
                      </TableCell>
                    </TableRow>
                  ) : visible.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className='py-10 text-center text-muted-foreground'>
                        {employees.length === 0 ? 'No employees yet — add them on the Employees page.' : 'No employees match these filters.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    visible.map((e) => (
                      <TableRow key={e.id} className='cursor-pointer' onClick={() => select(e.id)}>
                        <TableCell>
                          <div className='font-medium'>{e.name}</div>
                          <div className='text-xs text-muted-foreground'>
                            {[e.employeeId, e.designation].filter(Boolean).join(' · ')}
                            {e.employmentStatus !== 'Active' && (
                              <Badge variant='outline' className='ml-1.5 h-4 px-1 text-[10px]'>
                                {e.employmentStatus}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>{e.monthlySalary ? formatMoney(e.monthlySalary) : '—'}</TableCell>
                        <TableCell className='text-right tabular-nums'>{formatMoney(e.totalPayable)}</TableCell>
                        <TableCell className='text-right tabular-nums'>{formatMoney(e.totalSalaryPaid)}</TableCell>
                        <TableCell className={cn('text-right tabular-nums', e.outstandingAdvance > 0 && 'text-sky-700 dark:text-sky-400')}>
                          {formatMoney(e.outstandingAdvance)}
                        </TableCell>
                        <TableCell className='text-right'>
                          <BalanceCell value={e.currentBalance} />
                        </TableCell>
                        <TableCell className='whitespace-nowrap text-sm text-muted-foreground'>
                          {e.lastActivity ? formatAppDate(new Date(e.lastActivity)) : '—'}
                        </TableCell>
                        <TableCell className='text-right' onClick={(event) => event.stopPropagation()}>
                          <div className='flex justify-end gap-1'>
                            <Button size='sm' variant='ghost' onClick={() => select(e.id)} title='Open statement'>
                              <BookOpen className='h-4 w-4' />
                              <span className='sr-only'>Statement</span>
                            </Button>
                            {canRecord && (
                              <>
                                <Button size='sm' variant='outline' onClick={() => setPayLines([payLineFor(e)])}>
                                  Pay
                                </Button>
                                <Button size='sm' variant='outline' onClick={() => setReceiveLines([receiveLineFor(e)])}>
                                  Receive
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
                {visible.length > 0 && (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2}>Total · {visible.length} employee{visible.length === 1 ? '' : 's'}</TableCell>
                      <TableCell className='text-right tabular-nums'>{formatMoney(visibleTotals.earned)}</TableCell>
                      <TableCell className='text-right tabular-nums'>{formatMoney(visibleTotals.paid)}</TableCell>
                      <TableCell className='text-right tabular-nums'>{formatMoney(visibleTotals.advance)}</TableCell>
                      <TableCell className='text-right'>
                        <BalanceCell value={visibleTotals.balance} />
                      </TableCell>
                      <TableCell colSpan={2} />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <PaymentVoucherDialog
        open={payLines !== null}
        onOpenChange={(open) => !open && setPayLines(null)}
        initialLines={payLines ?? undefined}
        onCreated={() => setPayLines(null)}
      />
      <ReceiptVoucherDialog
        open={receiveLines !== null}
        onOpenChange={(open) => !open && setReceiveLines(null)}
        initialLines={receiveLines ?? undefined}
        onCreated={() => setReceiveLines(null)}
      />
    </div>
  )
}
