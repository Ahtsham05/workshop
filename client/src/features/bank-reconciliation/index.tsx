import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Link } from '@tanstack/react-router'
import { CheckCircle2, History, Upload, AlertTriangle, Wallet as WalletIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
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
import {
  useGetReconciliationSummaryQuery,
  useGetUnreconciledEntriesQuery,
  useGetReconciliationHistoryQuery,
  useMatchStatementMutation,
  useConfirmReconciliationMutation,
  type MatchResult,
  type StatementLineInput,
} from '@/stores/bankReconciliation.api'
import { getBusinessToday } from '@/lib/business-timezone'
import { StatementUploadDialog } from './components/statement-upload-dialog'

const fmt = (v: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 2 }).format(v)

const formatDate = (value?: string) => {
  if (!value) return '-'
  try {
    return format(new Date(value), 'dd MMM yyyy')
  } catch {
    return value
  }
}

const walletImpact = (entry: { type: 'in' | 'out'; amount: number }) =>
  entry.type === 'in' ? entry.amount : -entry.amount

interface BankReconciliationPageProps {
  initialWalletType?: string
}

export default function BankReconciliationPage({ initialWalletType }: BankReconciliationPageProps) {
  const today = useMemo(() => getBusinessToday(), [])
  const { data: walletsData, isLoading: walletsLoading } = useGetWalletsQuery()
  // Depend on walletsData (a stable RTK Query reference), not `walletsData?.results ?? []`
  // directly — the `?? []` fallback mints a new array every render, which would otherwise
  // make `wallets` below recompute (and re-trigger the default-selection effect) every render.
  const allWallets = useMemo(() => walletsData?.results ?? [], [walletsData])
  // Statement-matching only makes sense against an account with an independent external
  // record to upload/match against — a cash-type account (e.g. "Cash in Hand") has no bank
  // statement, so it's excluded here entirely. It's reconciled by counting physical cash
  // against Cash Book instead, via the existing Track Cash page (linked below when this
  // list is empty). See [[bank-accounts-payments-roadmap]] module 10 follow-up.
  const wallets = useMemo(() => allWallets.filter((w) => w.accountType !== 'cash'), [allWallets])

  const [selectedWallet, setSelectedWallet] = useState(initialWalletType ?? '')
  useMemo(() => {
    if ((!selectedWallet || !wallets.some((w) => w.type === selectedWallet)) && wallets.length > 0) {
      setSelectedWallet(initialWalletType && wallets.some((w) => w.type === initialWalletType) ? initialWalletType : wallets[0].type)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets])

  const selectedWalletInfo = wallets.find((w) => w.type === selectedWallet)
  const walletId = selectedWalletInfo?.id ?? ''

  const { data: summary, isLoading: summaryLoading } = useGetReconciliationSummaryQuery(walletId, { skip: !walletId })
  const { data: unreconciled = [], isLoading: entriesLoading } = useGetUnreconciledEntriesQuery(
    { walletId },
    { skip: !walletId },
  )
  const { data: history = [] } = useGetReconciliationHistoryQuery(walletId, { skip: !walletId })

  const [statementStartDate, setStatementStartDate] = useState('')
  const [statementEndDate, setStatementEndDate] = useState(today)
  const [statementClosingBalance, setStatementClosingBalance] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)

  const [matchStatementMutation, { isLoading: matching }] = useMatchStatementMutation()
  const [confirmReconciliation, { isLoading: confirming }] = useConfirmReconciliationMutation()

  const matchedIdSet = useMemo(
    () => new Set((matchResult?.matches ?? []).map((m) => m.walletEntry.id)),
    [matchResult],
  )
  const matchedDescriptionById = useMemo(() => {
    const map = new Map<string, string>()
    ;(matchResult?.matches ?? []).forEach((m) => {
      map.set(m.walletEntry.id, m.statementLine.description || 'Bank statement line')
    })
    return map
  }, [matchResult])

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleParsed = async (lines: StatementLineInput[]) => {
    if (!walletId) return
    try {
      const result = await matchStatementMutation({ walletId, statementLines: lines }).unwrap()
      setMatchResult(result)
      setSelectedIds(new Set(result.matches.map((m) => m.walletEntry.id)))
      toast.success(
        `${result.matches.length} matched · ${result.unmatchedStatementLines.length} unmatched bank line(s) · ${result.unmatchedBookEntries.length} still outstanding`,
      )
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to match statement')
    }
  }

  const currentBookBalance = summary?.currentBookBalance ?? 0
  const allUnreconciledImpact = unreconciled.reduce((sum, e) => sum + walletImpact(e), 0)
  const selectedImpact = unreconciled
    .filter((e) => selectedIds.has(e.id))
    .reduce((sum, e) => sum + walletImpact(e), 0)
  const stillOutstandingImpact = allUnreconciledImpact - selectedImpact
  const expectedStatementBalance = currentBookBalance - stillOutstandingImpact
  const closingBalanceNum = parseFloat(statementClosingBalance)
  const hasClosingBalance = statementClosingBalance.trim() !== '' && Number.isFinite(closingBalanceNum)
  const difference = hasClosingBalance ? closingBalanceNum - expectedStatementBalance : null
  const isBalanced = difference !== null && Math.abs(difference) < 0.01

  const handleConfirm = async () => {
    if (!walletId) return
    if (selectedIds.size === 0) {
      toast.error('Select at least one transaction to reconcile')
      return
    }
    if (!hasClosingBalance) {
      toast.error('Enter the statement closing balance')
      return
    }
    try {
      const session = await confirmReconciliation({
        walletId,
        walletEntryIds: Array.from(selectedIds),
        statementStartDate: statementStartDate || undefined,
        statementEndDate,
        statementClosingBalance: closingBalanceNum,
      }).unwrap()
      toast.success(`Reconciliation completed — ${session.matchedCount} transaction(s) reconciled`)
      setSelectedIds(new Set())
      setMatchResult(null)
      setStatementClosingBalance('')
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to complete reconciliation')
    }
  }

  return (
    <div className='space-y-6 p-4 md:p-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Bank Reconciliation</h1>
        <p className='text-muted-foreground'>
          Match your books against a real bank statement — manually, or by uploading a statement file.
        </p>
      </div>

      <Card>
        <CardContent className='grid gap-4 pt-6 md:grid-cols-4'>
          <div className='space-y-2 md:col-span-2'>
            <p className='text-sm font-medium'>Bank Account</p>
            {walletsLoading ? (
              <Skeleton className='h-9 w-full' />
            ) : (
              <Select value={selectedWallet} onValueChange={(v) => { setSelectedWallet(v); setSelectedIds(new Set()); setMatchResult(null) }}>
                <SelectTrigger>
                  <SelectValue placeholder='Select a bank account' />
                </SelectTrigger>
                <SelectContent>
                  {wallets.map((w) => (
                    <SelectItem key={w.id} value={w.type}>{w.type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {allWallets.some((w) => w.accountType === 'cash') && (
              <p className='text-xs text-muted-foreground'>
                Cash in Hand isn't listed here — reconcile it by counting physical cash on the{' '}
                <Link to='/cash-register' className='underline underline-offset-2'>Track Cash</Link> page instead.
              </p>
            )}
          </div>
          <div className='rounded-lg border p-3'>
            <p className='text-xs text-muted-foreground'>Current Book Balance</p>
            <p className='text-lg font-bold'>{summaryLoading ? '...' : fmt(currentBookBalance)}</p>
          </div>
          <div className='rounded-lg border p-3'>
            <p className='text-xs text-muted-foreground'>Last Reconciled</p>
            <p className='text-sm font-medium'>
              {summary?.lastReconciledAt ? `${formatDate(summary.lastReconciledAt)} · ${fmt(summary.lastReconciledBalance ?? 0)}` : 'Never'}
            </p>
          </div>
        </CardContent>
      </Card>

      {!walletId ? (
        <Card>
          <CardContent className='flex flex-col items-center gap-3 py-12 text-center text-muted-foreground'>
            {allWallets.length > 0 ? (
              <>
                <WalletIcon className='h-8 w-8 text-muted-foreground/50' />
                <p>
                  Cash in Hand has no bank statement to reconcile against — count physical cash against
                  Cash Book on the Track Cash page instead.
                </p>
                <Button asChild variant='outline' size='sm'>
                  <Link to='/cash-register'>Go to Track Cash</Link>
                </Button>
              </>
            ) : (
              'No bank accounts found. Add one from the Bank Accounts page.'
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Statement Details</CardTitle>
            </CardHeader>
            <CardContent className='grid gap-4 md:grid-cols-4'>
              <div className='space-y-2'>
                <Label>Statement Start Date</Label>
                <input
                  type='date'
                  value={statementStartDate}
                  onChange={(e) => setStatementStartDate(e.target.value)}
                  className='h-9 w-full rounded-md border bg-background px-3 text-sm'
                />
              </div>
              <div className='space-y-2'>
                <Label>Statement End Date</Label>
                <input
                  type='date'
                  value={statementEndDate}
                  onChange={(e) => setStatementEndDate(e.target.value)}
                  className='h-9 w-full rounded-md border bg-background px-3 text-sm'
                />
              </div>
              <div className='space-y-2'>
                <Label>Statement Closing Balance (Rs)</Label>
                <Input
                  type='number'
                  step='0.01'
                  placeholder='0.00'
                  value={statementClosingBalance}
                  onChange={(e) => setStatementClosingBalance(e.target.value)}
                />
              </div>
              <div className='flex items-end'>
                <Button type='button' variant='outline' className='w-full' onClick={() => setUploadOpen(true)} disabled={matching}>
                  <Upload className='mr-2 h-4 w-4' />
                  {matching ? 'Matching...' : 'Upload Bank Statement'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className={isBalanced ? 'border-emerald-400' : difference !== null ? 'border-amber-400' : undefined}>
            <CardContent className='flex flex-wrap items-center justify-between gap-4 pt-6'>
              <div className='flex items-center gap-3'>
                {isBalanced ? (
                  <CheckCircle2 className='h-8 w-8 text-emerald-600' />
                ) : (
                  <AlertTriangle className='h-8 w-8 text-amber-500' />
                )}
                <div>
                  <p className='text-sm text-muted-foreground'>
                    {selectedIds.size} of {unreconciled.length} transaction(s) selected
                  </p>
                  <p className='text-xl font-bold'>
                    {difference === null ? 'Enter statement closing balance' : isBalanced ? 'Balanced ✓' : `Difference: ${fmt(Math.abs(difference))}`}
                  </p>
                </div>
              </div>
              <Button onClick={handleConfirm} disabled={confirming || selectedIds.size === 0 || !hasClosingBalance}>
                {confirming ? 'Saving...' : 'Complete Reconciliation'}
              </Button>
            </CardContent>
          </Card>

          {matchResult && matchResult.unmatchedStatementLines.length > 0 && (
            <Card className='border-amber-300'>
              <CardHeader>
                <CardTitle className='text-base'>
                  Unmatched Bank Lines ({matchResult.unmatchedStatementLines.length})
                </CardTitle>
                <p className='text-sm text-muted-foreground'>
                  These appear on the bank statement but have no matching entry in your books yet. Record them from
                  Payments &amp; Receipts, then re-upload to match.
                </p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className='text-right'>Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {matchResult.unmatchedStatementLines.map((line) => (
                      <TableRow key={line.statementLineIndex}>
                        <TableCell>{formatDate(line.statementLine.date)}</TableCell>
                        <TableCell>{line.statementLine.description || '-'}</TableCell>
                        <TableCell className={`text-right font-medium ${line.statementLine.direction === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                          {line.statementLine.direction === 'in' ? '+' : '-'}{fmt(line.statementLine.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Book Transactions ({unreconciled.length} unreconciled)</CardTitle>
            </CardHeader>
            <CardContent>
              {entriesLoading ? (
                <Skeleton className='h-40 w-full' />
              ) : unreconciled.length === 0 ? (
                <div className='py-10 text-center text-muted-foreground'>
                  Everything is reconciled for this account. Nothing outstanding.
                </div>
              ) : (
                <div className='overflow-x-auto'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className='w-[44px]' />
                        <TableHead>Date</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className='text-right'>Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unreconciled.map((entry) => (
                        <TableRow key={entry.id} className={selectedIds.has(entry.id) ? 'bg-muted/40' : undefined}>
                          <TableCell>
                            <Checkbox checked={selectedIds.has(entry.id)} onCheckedChange={() => toggleSelected(entry.id)} />
                          </TableCell>
                          <TableCell className='whitespace-nowrap'>{formatDate(entry.date)}</TableCell>
                          <TableCell className='max-w-[320px]'>
                            <span>{entry.description || entry.referenceModel}</span>
                            {matchedIdSet.has(entry.id) && (
                              <Badge variant='secondary' className='ml-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-100'>
                                Matched: {matchedDescriptionById.get(entry.id)}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className={`text-right font-medium whitespace-nowrap ${entry.type === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                            {entry.type === 'in' ? '+' : '-'}{fmt(entry.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {history.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2 text-base'>
                  <History className='h-4 w-4' />
                  Reconciliation History
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Statement End Date</TableHead>
                      <TableHead className='text-right'>Statement Balance</TableHead>
                      <TableHead className='text-right'>Book Balance</TableHead>
                      <TableHead className='text-right'>Difference</TableHead>
                      <TableHead className='text-right'>Matched</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((session) => (
                      <TableRow key={session.id}>
                        <TableCell>{formatDate(session.statementEndDate)}</TableCell>
                        <TableCell className='text-right'>{fmt(session.statementClosingBalance)}</TableCell>
                        <TableCell className='text-right'>{fmt(session.bookClosingBalance)}</TableCell>
                        <TableCell className={`text-right ${Math.abs(session.difference) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {fmt(session.difference)}
                        </TableCell>
                        <TableCell className='text-right'>{session.matchedCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <StatementUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onParsed={handleParsed} />
    </div>
  )
}
