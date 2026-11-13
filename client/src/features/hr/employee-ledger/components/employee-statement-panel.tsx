import { useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { ArrowDownLeft, ArrowUpRight, FileSpreadsheet, Loader2, Lock, Printer } from 'lucide-react'
import type { RootState } from '@/stores/store'
import { useGetEmployeeStatementQuery, type EmployeeStatement } from '@/stores/hr.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useCurrencyMeta, useFormatMoney } from '@/lib/format-money'
import { formatAppDate } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import { LedgerPeriodSelector, formatLedgerPeriodRange } from '@/features/accounting/components/ledger-period-selector'
import { getStoredLedgerPeriod, storeLedgerPeriod, type LedgerPeriod } from '@/features/accounting/utils/ledger-period'
import {
  accountOf,
  BALANCE_SIDE_HINT,
  BALANCE_SIDE_LABEL,
  BALANCE_TONE,
  balanceSide,
  rowTypeLabel,
  sourceVoucherOf,
  TRANSACTION_BADGE,
} from '../utils/employee-ledger'
import { printEmployeeStatement } from '../utils/print-employee-statement'

const PERIOD_KEY = 'employee-ledger-period'

const safeDate = (value?: string | null) => {
  if (!value) return '-'
  try {
    return formatAppDate(new Date(value))
  } catch {
    return '-'
  }
}

function BalanceText({ value, className }: { value: number; className?: string }) {
  const formatMoney = useFormatMoney()
  const side = balanceSide(value)
  if (side === 'settled') return <span className={cn('text-muted-foreground', className)}>Settled</span>
  return (
    <span className={cn('inline-flex flex-wrap items-baseline justify-end gap-x-1 tabular-nums', BALANCE_TONE[side], className)}>
      <span className='whitespace-nowrap'>{formatMoney(Math.abs(value))}</span>
      <span className='text-[10px] font-medium uppercase tracking-wide opacity-80'>{BALANCE_SIDE_LABEL[side]}</span>
    </span>
  )
}

function Stat({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className='rounded-lg border px-3 py-2'>
      <p className='text-xs text-muted-foreground'>{label}</p>
      <div className='mt-0.5 text-base font-bold tabular-nums'>{children}</div>
      {hint && <p className='text-[11px] text-muted-foreground'>{hint}</p>}
    </div>
  )
}

interface EmployeeStatementPanelProps {
  employeeId: string
  /** Shown as soon as the panel opens, before the statement has loaded. */
  fallbackName?: string
  /** Pay / Receive buttons — the page passes them, the voucher quick view doesn't. */
  onPay?: (statement: EmployeeStatement) => void
  onReceive?: (statement: EmployeeStatement) => void
  /** Hide the employee header (the quick view's sheet title already names them). */
  hideHeader?: boolean
}

/**
 * An employee's account statement — opening balance, every entry with a running balance,
 * period totals, closing balance — with print and Excel export. Shared by the Employee Ledger
 * page and the quick view on Payment / Receipt Vouchers.
 */
export function EmployeeStatementPanel({ employeeId, fallbackName, onPay, onReceive, hideHeader }: EmployeeStatementPanelProps) {
  const formatMoney = useFormatMoney()
  const currencyMeta = useCurrencyMeta()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const [period, setPeriod] = useState<LedgerPeriod>(() => getStoredLedgerPeriod(PERIOD_KEY))
  const { currentData: statement, isFetching, isError, error } = useGetEmployeeStatementQuery(
    { employeeId, startDate: period.startDate, endDate: period.endDate },
    { refetchOnMountOrArgChange: true }
  )
  const periodLabel = formatLedgerPeriodRange(period, 'Beginning')

  const closingSide = balanceSide(statement?.closingBalance ?? 0)
  const summary = statement?.summary

  const handlePrint = () => {
    if (!statement) return
    try {
      printEmployeeStatement(
        statement,
        { name: org?.name || 'Business', address: org?.address, phone: org?.phone, currencyMeta },
        periodLabel
      )
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Could not open the print window')
    }
  }

  const handleExport = () => {
    if (!statement) return
    const sheetRows = [
      { Date: '', Type: 'Opening balance', Particulars: '', Reference: '', Account: '', 'Earned / Received': '', 'Paid / Advanced': '', Balance: statement.openingBalance, Side: BALANCE_SIDE_LABEL[balanceSide(statement.openingBalance)] },
      ...statement.rows.map((row) => ({
        Date: safeDate(row.transactionDate),
        Type: rowTypeLabel(row) + (row.memo ? ' (memo)' : ''),
        Particulars: row.description,
        Reference: row.reference,
        Account: accountOf(row),
        'Earned / Received': row.debit || '',
        'Paid / Advanced': row.credit || '',
        Balance: Math.abs(row.runningBalance),
        Side: BALANCE_SIDE_LABEL[balanceSide(row.runningBalance)],
      })),
      {
        Date: '',
        Type: 'Totals / closing',
        Particulars: '',
        Reference: '',
        Account: '',
        'Earned / Received': statement.totals.debit,
        'Paid / Advanced': statement.totals.credit,
        Balance: Math.abs(statement.closingBalance),
        Side: BALANCE_SIDE_LABEL[balanceSide(statement.closingBalance)],
      },
    ]
    const ws = XLSX.utils.json_to_sheet(sheetRows)
    ws['!cols'] = [{ wch: 12 }, { wch: 18 }, { wch: 48 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 10 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Statement')
    const safeName = statement.employee.name.replace(/[^\w-]+/g, '_')
    XLSX.writeFile(wb, `employee-statement-${safeName}-${period.startDate}-to-${period.endDate}.xlsx`)
  }

  const errorMessage = useMemo(() => {
    if (!isError) return null
    const status = (error as { status?: number } | undefined)?.status
    return status === 403 ? 'You do not have permission to view this ledger' : 'Failed to load the statement'
  }, [isError, error])

  return (
    <div className='space-y-4'>
      {!hideHeader && (
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <h2 className='truncate text-lg font-semibold'>{statement?.employee.name || fallbackName || 'Employee'}</h2>
            <p className='text-sm text-muted-foreground'>
              {[statement?.employee.employeeId, statement?.employee.designation, statement?.employee.department].filter(Boolean).join(' · ') || ' '}
              {statement?.employee.employmentStatus && statement.employee.employmentStatus !== 'Active' && (
                <Badge variant='outline' className='ml-2 align-middle'>
                  {statement.employee.employmentStatus}
                </Badge>
              )}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            {onPay && statement && (
              <Button size='sm' onClick={() => onPay(statement)}>
                <ArrowUpRight className='mr-1.5 h-4 w-4' />
                Pay
              </Button>
            )}
            {onReceive && statement && (
              <Button size='sm' variant='outline' onClick={() => onReceive(statement)}>
                <ArrowDownLeft className='mr-1.5 h-4 w-4' />
                Receive
              </Button>
            )}
            <Button size='sm' variant='outline' onClick={handlePrint} disabled={!statement}>
              <Printer className='mr-1.5 h-4 w-4' />
              Print
            </Button>
            <Button size='sm' variant='outline' onClick={handleExport} disabled={!statement}>
              <FileSpreadsheet className='mr-1.5 h-4 w-4' />
              Excel
            </Button>
          </div>
        </div>
      )}

      <div className='grid grid-cols-2 gap-3 lg:grid-cols-4'>
        <Stat label='Current balance' hint={BALANCE_SIDE_HINT[balanceSide(summary?.currentBalance ?? 0)]}>
          {summary ? <BalanceText value={summary.currentBalance} /> : '—'}
        </Stat>
        <Stat label='Salary payable now'>{summary ? formatMoney(summary.payableNow) : '—'}</Stat>
        <Stat label='Advance outstanding' hint={summary && summary.totalCashReceived > 0 ? `${formatMoney(summary.totalCashReceived)} received back` : undefined}>
          {summary ? <span className={summary.outstandingAdvance > 0 ? 'text-sky-700 dark:text-sky-400' : ''}>{formatMoney(summary.outstandingAdvance)}</span> : '—'}
        </Stat>
        <Stat label='Monthly salary'>{statement?.employee.monthlySalary ? formatMoney(statement.employee.monthlySalary) : '—'}</Stat>
      </div>

      <LedgerPeriodSelector
        period={period}
        onChange={(next) => {
          setPeriod(next)
          storeLedgerPeriod(PERIOD_KEY, next)
        }}
      />

      {hideHeader && (
        <div className='flex flex-wrap justify-end gap-2'>
          <Button size='sm' variant='outline' onClick={handlePrint} disabled={!statement}>
            <Printer className='mr-1.5 h-4 w-4' />
            Print
          </Button>
          <Button size='sm' variant='outline' onClick={handleExport} disabled={!statement}>
            <FileSpreadsheet className='mr-1.5 h-4 w-4' />
            Excel
          </Button>
        </div>
      )}

      {errorMessage ? (
        <p className='rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground'>{errorMessage}</p>
      ) : !statement ? (
        <div className='flex items-center justify-center py-16 text-muted-foreground'>
          <Loader2 className='h-5 w-5 animate-spin' />
        </div>
      ) : (
        <div className={cn('overflow-x-auto rounded-lg border transition-opacity', isFetching && 'opacity-60')}>
          <Table className='min-w-[860px]'>
            <TableHeader>
              <TableRow>
                <TableHead className='w-[100px]'>Date</TableHead>
                <TableHead className='w-[130px]'>Type</TableHead>
                <TableHead>Particulars</TableHead>
                <TableHead className='w-[130px]'>Ref / Account</TableHead>
                <TableHead className='w-[120px] text-right'>Earned / Received</TableHead>
                <TableHead className='w-[120px] text-right'>Paid / Advanced</TableHead>
                <TableHead className='w-[140px] text-right'>Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow className='bg-muted/40 font-medium'>
                <TableCell colSpan={6}>Opening balance · {periodLabel.split(' — ')[0]}</TableCell>
                <TableCell className='text-right'>
                  <BalanceText value={statement.openingBalance} />
                </TableCell>
              </TableRow>
              {statement.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className='py-8 text-center text-muted-foreground'>
                    No entries in this period
                  </TableCell>
                </TableRow>
              ) : (
                statement.rows.map((row) => {
                  const voucher = sourceVoucherOf(row)
                  const account = accountOf(row)
                  return (
                    <TableRow key={row.id} className={cn(row.memo && 'text-muted-foreground')}>
                      <TableCell className='whitespace-nowrap align-top'>{safeDate(row.transactionDate)}</TableCell>
                      <TableCell className='align-top'>
                        <Badge variant='outline' className={cn('font-medium', TRANSACTION_BADGE[row.transactionType])}>
                          {rowTypeLabel(row)}
                        </Badge>
                        {row.memo && <p className='mt-0.5 text-[10px]'>memo · balance unchanged</p>}
                      </TableCell>
                      <TableCell className='align-top'>
                        <p className='text-sm'>{row.description}</p>
                        {row.notes && !row.description?.includes(row.notes) && <p className='text-xs text-muted-foreground'>{row.notes}</p>}
                        {row.createdBy && <p className='text-[11px] text-muted-foreground'>by {row.createdBy}</p>}
                      </TableCell>
                      <TableCell className='align-top'>
                        <div className='flex items-center gap-1 text-sm'>
                          <span className='font-mono text-xs'>{row.reference || '—'}</span>
                          {voucher && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Lock className='h-3 w-3 text-muted-foreground' />
                              </TooltipTrigger>
                              <TooltipContent>
                                Posted by {voucher.kind === 'payment' ? 'Payment' : 'Receipt'} Voucher {voucher.number} — edit or delete it
                                from Payments &amp; Receipts
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                        {account && <p className='text-xs text-muted-foreground'>{account}</p>}
                      </TableCell>
                      <TableCell className='text-right align-top tabular-nums'>{row.debit ? formatMoney(row.debit) : ''}</TableCell>
                      <TableCell className='text-right align-top tabular-nums'>{row.credit ? formatMoney(row.credit) : ''}</TableCell>
                      <TableCell className='text-right align-top font-medium'>
                        <BalanceText value={row.runningBalance} />
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={4}>
                  Period totals · {statement.rows.length} {statement.rows.length === 1 ? 'entry' : 'entries'}
                </TableCell>
                <TableCell className='text-right tabular-nums'>{formatMoney(statement.totals.debit)}</TableCell>
                <TableCell className='text-right tabular-nums'>{formatMoney(statement.totals.credit)}</TableCell>
                <TableCell className='text-right'>
                  <BalanceText value={statement.closingBalance} className='font-bold' />
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      )}
      {statement && (
        <p className='text-xs text-muted-foreground'>
          Closing balance {closingSide === 'settled' ? 'is settled' : `— ${BALANCE_SIDE_HINT[closingSide].toLowerCase()}`}. Salary Earned comes from
          payroll; payments and cash received back are posted from Payroll or from Payments &amp; Receipts.
        </p>
      )}
    </div>
  )
}
