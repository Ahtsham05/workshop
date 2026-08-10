import { forwardRef, useImperativeHandle, useState } from 'react'
import { useSelector } from 'react-redux'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import {
  Landmark,
  Wallet as WalletIcon,
  AlertTriangle,
  CheckCircle2,
  ListChecks,
  Printer,
  Loader2,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { RootState } from '@/stores/store'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import {
  useGetBankPositionReportQuery,
  useGetBankReconciliationSessionsReportQuery,
  useLazyGetBankReconciliationSessionDetailQuery,
  type BankPositionAccountRow,
} from '@/stores/reports.api'
import type { BankAccountType } from '@/stores/mobile-shop.api'
import { printBankReconciliationReport } from '../utils/print-bank-reconciliation-report'

interface BankPositionReportProps {
  startDate: string
  endDate: string
}

const fmt = (v: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0 }).format(v)

const ACCOUNT_TYPE_LABELS: Record<BankAccountType | 'other', string> = {
  cash: 'Cash',
  bank: 'Bank',
  mobile_wallet: 'Mobile Wallet',
  other: 'Other',
}

const ACCOUNT_TYPE_BADGE_CLASS: Record<BankAccountType | 'other', string> = {
  cash: 'bg-orange-100 text-orange-700 hover:bg-orange-100',
  bank: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  mobile_wallet: 'bg-purple-100 text-purple-700 hover:bg-purple-100',
  other: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
}

const fmtDate = (value: string | null) => {
  if (!value) return 'Never'
  try {
    return format(new Date(value), 'PP')
  } catch {
    return value
  }
}

function AccountAttentionBadge({ account }: { account: BankPositionAccountRow }) {
  // A cash-type account has no bank statement to reconcile against — Needs
  // Attention/Reconciled don't apply; it's reconciled by counting physical cash on the
  // Track Cash page instead, tracked separately from this Bank Reconciliation workflow.
  if (!account.reconciliationApplicable) {
    return (
      <Badge variant='secondary' className='gap-1'>
        <WalletIcon className='h-3 w-3' /> Reconciled via Track Cash
      </Badge>
    )
  }

  const needsAttention =
    account.unreconciledCount > 0 || !account.lastReconciledAt || Math.abs(account.lastDifference || 0) > 0.01

  if (!needsAttention) {
    return (
      <Badge variant='secondary' className='bg-emerald-100 text-emerald-700 hover:bg-emerald-100 gap-1'>
        <CheckCircle2 className='h-3 w-3' /> Reconciled
      </Badge>
    )
  }
  return (
    <Badge variant='secondary' className='bg-amber-100 text-amber-700 hover:bg-amber-100 gap-1'>
      <AlertTriangle className='h-3 w-3' /> Needs Attention
    </Badge>
  )
}

export const BankPositionReport = forwardRef<{ exportToExcel: () => void }, BankPositionReportProps>(
  ({ startDate, endDate }, ref) => {
    const user = useSelector((state: RootState) => state.auth.data?.user)
    const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
    const { data: positionData, isFetching: positionLoading } = useGetBankPositionReportQuery()
    const { data: sessionsData, isFetching: sessionsLoading } = useGetBankReconciliationSessionsReportQuery({
      startDate,
      endDate,
    })
    const [fetchSessionDetail] = useLazyGetBankReconciliationSessionDetailQuery()
    const [printingId, setPrintingId] = useState<string | null>(null)

    const handlePrintSession = async (sessionId: string) => {
      setPrintingId(sessionId)
      try {
        const detail = await fetchSessionDetail(sessionId).unwrap()
        printBankReconciliationReport(detail.session, detail.entries, {
          name: org?.name || 'Logix Plus Solutions',
          address: org?.address,
          phone: org?.phone,
        })
      } catch {
        toast.error('Failed to load reconciliation report')
      } finally {
        setPrintingId(null)
      }
    }

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!positionData && !sessionsData) {
            toast.error('No data available to export')
            return
          }
          const wb = XLSX.utils.book_new()

          if (positionData?.accounts.length) {
            const rows = positionData.accounts.map((a) => ({
              'Bank Account': a.bankAccountName,
              Type: ACCOUNT_TYPE_LABELS[a.accountType],
              'Current Balance (Rs.)': a.currentBalance,
              'Unreconciled Transactions': a.reconciliationApplicable ? a.unreconciledCount : 'N/A — reconciled via Track Cash',
              'Last Reconciled': a.reconciliationApplicable ? (a.lastReconciledAt ? format(new Date(a.lastReconciledAt), 'yyyy-MM-dd') : 'Never') : 'N/A',
              'Last Statement Balance (Rs.)': a.reconciliationApplicable ? (a.lastReconciledBalance ?? '') : '',
              'Last Difference (Rs.)': a.reconciliationApplicable ? (a.lastDifference ?? '') : '',
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Bank & Cash Position')
          }

          if (sessionsData?.results.length) {
            const rows = sessionsData.results.map((s) => ({
              Date: format(new Date(s.statementEndDate), 'yyyy-MM-dd'),
              'Bank Account': s.bankAccountName,
              'Statement Balance (Rs.)': s.statementClosingBalance,
              'Book Balance (Rs.)': s.bookClosingBalance,
              'Difference (Rs.)': s.difference,
              'Matched Entries': s.matchedCount,
              'Prepared By': s.createdBy?.name || '',
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Reconciliation History')
          }

          XLSX.writeFile(wb, `bank-reconciliation-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success('Report exported successfully')
        } catch {
          toast.error('Failed to export report')
        }
      },
    }))

    if (positionLoading || sessionsLoading) {
      return (
        <div className='space-y-4'>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            {[...Array(4)].map((_, i) => <Skeleton key={i} className='h-[100px] w-full' />)}
          </div>
          <Skeleton className='h-[300px] w-full' />
          <Skeleton className='h-[300px] w-full' />
        </div>
      )
    }

    const totals = positionData?.totals ?? { totalBalance: 0, totalUnreconciled: 0, accountsNeedingAttention: 0 }
    const accounts = positionData?.accounts ?? []
    const sessions = sessionsData?.results ?? []
    const sessionSummary = sessionsData?.summary ?? { totalSessions: 0, balancedSessions: 0, totalMatchedEntries: 0 }

    return (
      <div className='space-y-6'>
        {/* ── Summary Cards ── */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <Card className={kpiCardClass('emerald')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Cash &amp; Bank Balance</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('emerald'))}>
                <Landmark className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-green-600'>{fmt(totals.totalBalance)}</div>
              <p className='text-xs text-muted-foreground mt-1'>across {accounts.length} account(s)</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('amber')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Accounts Needing Attention</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('amber'))}>
                <AlertTriangle className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-yellow-600'>{totals.accountsNeedingAttention}</div>
              <p className='text-xs text-muted-foreground mt-1'>unreconciled or never reconciled</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('cyan')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Unreconciled Transactions</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('cyan'))}>
                <WalletIcon className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{totals.totalUnreconciled}</div>
              <p className='text-xs text-muted-foreground mt-1'>book entries not yet matched</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('indigo')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Reconciliations (Period)</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('indigo'))}>
                <ListChecks className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{sessionSummary.totalSessions}</div>
              <p className='text-xs text-muted-foreground mt-1'>{sessionSummary.balancedSessions} balanced perfectly</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Bank & Cash Position ── */}
        <Card>
          <CardHeader>
            <CardTitle>Bank &amp; Cash Position</CardTitle>
            <CardDescription>Live balance and reconciliation status across every account</CardDescription>
          </CardHeader>
          <CardContent>
            {accounts.length === 0 ? (
              <p className='text-sm text-muted-foreground py-8 text-center'>No bank accounts set up yet</p>
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className='text-right'>Current Balance</TableHead>
                      <TableHead className='text-right'>Unreconciled</TableHead>
                      <TableHead>Last Reconciled</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((a) => (
                      <TableRow key={a.bankAccountId}>
                        <TableCell className='font-medium'>
                          <div>{a.bankAccountName}</div>
                          {a.bankName && (
                            <div className='text-xs text-muted-foreground'>
                              {a.bankName}{a.accountNumber ? ` · ${a.accountNumber}` : ''}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant='secondary' className={ACCOUNT_TYPE_BADGE_CLASS[a.accountType]}>
                            {ACCOUNT_TYPE_LABELS[a.accountType]}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-right font-semibold tabular-nums'>{fmt(a.currentBalance)}</TableCell>
                        <TableCell className='text-right tabular-nums'>
                          {a.reconciliationApplicable ? a.unreconciledCount : '—'}
                        </TableCell>
                        <TableCell className='text-sm'>
                          {a.reconciliationApplicable ? (
                            <>
                              {fmtDate(a.lastReconciledAt)}
                              {a.lastReconciledBalance != null && (
                                <div className='text-xs text-muted-foreground'>{fmt(a.lastReconciledBalance)}</div>
                              )}
                            </>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell><AccountAttentionBadge account={a} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Reconciliation History ── */}
        <Card>
          <CardHeader>
            <CardTitle>Reconciliation History</CardTitle>
            <CardDescription>Every reconciliation session closed in the selected period, across all accounts</CardDescription>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className='text-sm text-muted-foreground py-8 text-center'>No reconciliation sessions in the selected period</p>
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className='text-right'>Statement Balance</TableHead>
                      <TableHead className='text-right'>Book Balance</TableHead>
                      <TableHead className='text-right'>Difference</TableHead>
                      <TableHead className='text-right'>Matched</TableHead>
                      <TableHead>Prepared By</TableHead>
                      <TableHead className='text-right'>Report</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sessions.map((s) => {
                      const isBalanced = Math.abs(s.difference) < 0.01
                      return (
                        <TableRow key={s._id}>
                          <TableCell className='text-sm'>{format(new Date(s.statementEndDate), 'PP')}</TableCell>
                          <TableCell className='font-medium'>{s.bankAccountName}</TableCell>
                          <TableCell className='text-right tabular-nums'>{fmt(s.statementClosingBalance)}</TableCell>
                          <TableCell className='text-right tabular-nums'>{fmt(s.bookClosingBalance)}</TableCell>
                          <TableCell className={cn('text-right tabular-nums font-medium', isBalanced ? 'text-emerald-600' : 'text-red-600')}>
                            {isBalanced ? 'Balanced' : fmt(s.difference)}
                          </TableCell>
                          <TableCell className='text-right tabular-nums'>{s.matchedCount}</TableCell>
                          <TableCell className='text-sm text-muted-foreground'>{s.createdBy?.name || '-'}</TableCell>
                          <TableCell className='text-right'>
                            <Button
                              variant='ghost'
                              size='sm'
                              disabled={printingId === s._id}
                              onClick={() => handlePrintSession(s._id)}
                            >
                              {printingId === s._id
                                ? <Loader2 className='h-4 w-4 animate-spin' />
                                : <Printer className='h-4 w-4' />}
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }
)
