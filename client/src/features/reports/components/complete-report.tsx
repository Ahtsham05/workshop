import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'
import { Link } from '@tanstack/react-router'
import { useSelector } from 'react-redux'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import {
  ArrowRight,
  Banknote,
  ChevronDown,
  ChevronRight,
  Landmark,
  Receipt,
  ReceiptText,
  Search,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Wrench,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { RootState } from '@/stores/store'
import { Input } from '@/components/ui/input'
import {
  useGetProfitLossFullReportQuery,
  useGetWalletWiseReportQuery,
  useGetServiceReportQuery,
  useGetRepairReportQuery,
  useGetExpenseReportQuery,
  useGetSalesPurchaseSummaryReportQuery,
  useGetCustomerReportQuery,
  useGetSupplierReportQuery,
  useGetProductReportQuery,
  type WalletWiseEntry,
  type WalletWiseTransaction,
} from '@/stores/reports.api'
import { useGetBillPaymentReportQuery, useGetAgentBillReportQuery } from '@/stores/mobile-shop.api'
import { AGENT_BILL_EMAIL } from '../../mobile-shop/bill-payments'
import { useFeatureAccess } from '@/hooks/use-feature-access'
import { kpiCardClass, toneIconWrapClass, toneColor, type StatCardTone } from '@/lib/stat-card-tones'
import { cn } from '@/lib/utils'

interface CompleteReportProps {
  startDate: string
  endDate: string
}

const fmt = (v: number) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(v || 0)
const fmtDate = (v: string | undefined) => (v ? format(new Date(v), 'dd MMM yyyy') : '—')

const SECTIONS = [
  { key: 'overview', label: 'Overview', icon: TrendingUp, tone: 'emerald' as const },
  { key: 'sim-wise', label: 'Sim-wise (Sale / Cash / Load)', icon: Smartphone, tone: 'violet' as const },
  { key: 'services', label: 'Services', icon: Wrench, tone: 'sky' as const },
  { key: 'bill-payments', label: 'Bill Payments', icon: Receipt, tone: 'amber' as const },
  { key: 'agent-bills', label: 'Agent Bills', icon: ReceiptText, tone: 'indigo' as const },
  { key: 'repairing', label: 'Repairing', icon: Wrench, tone: 'orange' as const },
  { key: 'expenses', label: 'Expenses', icon: Banknote, tone: 'rose' as const },
  { key: 'accounts', label: 'My Accounts', icon: Landmark, tone: 'cyan' as const },
]

const CATEGORY_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#94a3b8',
]

const PROFIT_CENTERS: { key: 'loadProfit' | 'repairProfit' | 'serviceProfit' | 'simSaleProfit' | 'billNetProfit' | 'withdrawalProfit' | 'depositProfit'; label: string; tone: StatCardTone }[] = [
  { key: 'loadProfit', label: 'Load', tone: 'indigo' },
  { key: 'repairProfit', label: 'Repairing', tone: 'orange' },
  { key: 'serviceProfit', label: 'Services', tone: 'sky' },
  { key: 'simSaleProfit', label: 'Sim Sale', tone: 'violet' },
  { key: 'billNetProfit', label: 'Bill Payments', tone: 'amber' },
  { key: 'withdrawalProfit', label: 'Cash Withdrawals', tone: 'emerald' },
  { key: 'depositProfit', label: 'Cash Deposits', tone: 'cyan' },
]

function LockedNote({ label }: { label: string }) {
  return (
    <div className='flex items-center gap-2 rounded-md border border-dashed p-4 text-sm text-muted-foreground'>
      <ShieldCheck className='h-4 w-4' />
      {label} isn&apos;t included in your current plan.
    </div>
  )
}

function EmptyNote({ label }: { label: string }) {
  return <p className='py-6 text-center text-sm text-muted-foreground'>No {label} in the selected period.</p>
}

interface PersonalLedgerEntry {
  transactionType: string
  category?: string
  debit: number
  credit: number
  balance: number
}

const isIncomeLedgerType = (type: string) => type === 'income' || type === 'opening_balance'

function buildLedgerCategoryBreakdown(entries: PersonalLedgerEntry[], flow: 'income' | 'expense') {
  const map = new Map<string, number>()
  for (const entry of entries) {
    if (flow === 'expense') {
      if (entry.transactionType !== 'expense' || !(entry.debit > 0)) continue
    } else if (!isIncomeLedgerType(entry.transactionType) || !(entry.credit > 0)) {
      continue
    }
    const amount = flow === 'expense' ? entry.debit : entry.credit
    const cat = entry.category?.trim() || 'Uncategorized'
    map.set(cat, (map.get(cat) || 0) + amount)
  }
  return Array.from(map.entries())
    .map(([name, totalAmount]) => ({ name, totalAmount }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
}

function WalletCard({ wallet }: { wallet: WalletWiseEntry }) {
  const [open, setOpen] = useState(false)
  const hasActivity = wallet.totals.transactions > 0

  return (
    <div className={cn('rounded-xl border bg-card shadow-sm transition-all', hasActivity && 'hover:border-primary/40 hover:shadow-md')}>
      <button
        type='button'
        onClick={() => setOpen((o) => !o)}
        className='flex w-full flex-col gap-4 p-4 text-left lg:flex-row lg:items-center lg:justify-between'
      >
        <div className='flex items-center gap-3'>
          <span className={cn('inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', toneIconWrapClass(wallet.isLoadWallet ? 'indigo' : 'violet'))}>
            <Smartphone className='h-4 w-4' />
          </span>
          <div>
            <div className='flex items-center gap-2'>
              <span className='font-semibold'>{wallet.walletType}</span>
              {wallet.isLoadWallet && <Badge variant='secondary' className='text-xs'>Load</Badge>}
              {open ? <ChevronDown className='h-3.5 w-3.5 text-muted-foreground' /> : <ChevronRight className='h-3.5 w-3.5 text-muted-foreground' />}
            </div>
            <p className='text-xs text-muted-foreground'>
              Balance: {fmt(wallet.currentBalance)} · {wallet.totals.transactions} transactions
            </p>
          </div>
        </div>
        <div className='grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4'>
          <div>
            <p className='text-xs text-muted-foreground'>Cash In / Out</p>
            <p className='font-medium'>{fmt(wallet.cash.withdrawalAmount)} / {fmt(wallet.cash.depositAmount)}</p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>Load Sold / Purchased</p>
            <p className='font-medium'>{fmt(wallet.load.sold)} / {fmt(wallet.load.purchased)}</p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>Sim Sale</p>
            <p className='font-medium'>{wallet.simSale.count} ({fmt(wallet.simSale.saleAmount)})</p>
          </div>
          <div>
            <p className='text-xs text-muted-foreground'>Profit</p>
            <p className='font-semibold text-green-600 dark:text-green-400'>{fmt(wallet.totals.profit)}</p>
          </div>
        </div>
      </button>
      {open && (
        <div className='space-y-4 border-t p-4'>
          {!hasActivity && <EmptyNote label='activity for this wallet' />}
          {wallet.cash.transactions.length > 0 && (
            <div>
              <p className='mb-2 text-sm font-medium'>Cash Management</p>
              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead>Account Type</TableHead>
                      <TableHead className='text-right'>Amount</TableHead>
                      <TableHead className='text-right'>Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wallet.cash.transactions.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className='whitespace-nowrap text-sm'>{fmtDate(row.date)}</TableCell>
                        <TableCell className='text-sm capitalize'>{String(row.type)}</TableCell>
                        <TableCell className='text-sm'>{String(row.customerName || '—')}</TableCell>
                        <TableCell className='text-sm'>{String(row.customerNumber || '—')}</TableCell>
                        <TableCell className='text-sm'>{String(row.accountType || '—')}</TableCell>
                        <TableCell className='text-right text-sm'>{fmt(Number(row.amount))}</TableCell>
                        <TableCell className='text-right text-sm text-green-600'>{fmt(Number(row.profit))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          {wallet.load.transactions.length > 0 && (
            <div>
              <p className='mb-2 text-sm font-medium'>Load</p>
              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Customer/Supplier</TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead className='text-right'>Amount</TableHead>
                      <TableHead className='text-right'>Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wallet.load.transactions.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className='whitespace-nowrap text-sm'>{fmtDate(row.date)}</TableCell>
                        <TableCell className='text-sm capitalize'>{String(row.kind)}</TableCell>
                        <TableCell className='text-sm'>{String(row.customerName || '—')}</TableCell>
                        <TableCell className='text-sm'>{String(row.mobileNumber || '—')}</TableCell>
                        <TableCell className='text-right text-sm'>{fmt(Number(row.amount))}</TableCell>
                        <TableCell className='text-right text-sm text-green-600'>{fmt(Number(row.profit))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          {wallet.simSale.transactions.length > 0 && (
            <div>
              <p className='mb-2 text-sm font-medium'>Sim Sale</p>
              <div className='rounded-md border'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead>CNIC</TableHead>
                      <TableHead className='text-right'>Sale Amt</TableHead>
                      <TableHead className='text-right'>Load Amt</TableHead>
                      <TableHead className='text-right'>Commission</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {wallet.simSale.transactions.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className='whitespace-nowrap text-sm'>{fmtDate(row.date)}</TableCell>
                        <TableCell className='text-sm'>{String(row.productName || '—')}</TableCell>
                        <TableCell className='text-sm'>{String(row.customerName || '—')}</TableCell>
                        <TableCell className='text-sm'>{String(row.customerMobile || '—')}</TableCell>
                        <TableCell className='text-sm'>{String(row.customerCNIC || '—')}</TableCell>
                        <TableCell className='text-right text-sm'>{fmt(Number(row.saleAmount))}</TableCell>
                        <TableCell className='text-right text-sm'>{fmt(Number(row.loadAmount))}</TableCell>
                        <TableCell className='text-right text-sm text-green-600'>{fmt(Number(row.commission))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export const CompleteReport = forwardRef<{ exportToExcel: () => void }, CompleteReportProps>(
  ({ startDate, endDate }, ref) => {
    const user = useSelector((state: RootState) => state.auth.data?.user)
    const { canAccess } = useFeatureAccess()
    const isAgentBillUser = user?.email === AGENT_BILL_EMAIL
    const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

    const scrollToSection = (key: string) => {
      sectionRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const { data: pnl, isLoading: pnlLoading } = useGetProfitLossFullReportQuery(
      { from: startDate, to: endDate },
      { skip: !canAccess('profit_loss') },
    )
    const { data: walletWise, isLoading: walletWiseLoading } = useGetWalletWiseReportQuery({ startDate, endDate })
    const { data: services, isLoading: servicesLoading } = useGetServiceReportQuery({ startDate, endDate })
    const { data: billPayments, isLoading: billPaymentsLoading } = useGetBillPaymentReportQuery(
      { startDate, endDate },
      { skip: !canAccess('bill_payment') },
    )
    const { data: agentBills, isLoading: agentBillsLoading } = useGetAgentBillReportQuery(
      { startDate, endDate },
      { skip: !isAgentBillUser },
    )
    const { data: repair, isLoading: repairLoading } = useGetRepairReportQuery(
      { startDate, endDate },
      { skip: !canAccess('repair') },
    )
    const { data: expenses, isLoading: expensesLoading } = useGetExpenseReportQuery({ startDate, endDate })
    const { data: salesPurchase } = useGetSalesPurchaseSummaryReportQuery({ startDate, endDate })
    const { data: customers } = useGetCustomerReportQuery({ startDate, endDate })
    const { data: suppliers } = useGetSupplierReportQuery({ startDate, endDate })
    const { data: productReport, isLoading: productLoading } = useGetProductReportQuery({ startDate, endDate })

    const isLoading = pnlLoading || walletWiseLoading || servicesLoading || repairLoading || expensesLoading || productLoading

    const walletsWithActivity = useMemo(
      () => (walletWise?.wallets || []).filter((w) => w.totals.transactions > 0 || w.currentBalance > 0),
      [walletWise],
    )

    const [itemSearch, setItemSearch] = useState('')
    const itemRows = useMemo(() => {
      const rows = (productReport?.data || []).map((p) => ({
        ...p,
        purchaseAmount: p.totalRevenue - p.totalProfit,
        margin: p.totalRevenue > 0 ? (p.totalProfit / p.totalRevenue) * 100 : 0,
      }))
      const q = itemSearch.trim().toLowerCase()
      const filtered = q ? rows.filter((r) => r.productName.toLowerCase().includes(q)) : rows
      return filtered.slice().sort((a, b) => b.totalProfit - a.totalProfit)
    }, [productReport, itemSearch])
    const itemTotals = useMemo(
      () =>
        itemRows.reduce(
          (acc, r) => ({
            qty: acc.qty + (r.totalQuantitySold || 0),
            sale: acc.sale + (r.totalRevenue || 0),
            purchase: acc.purchase + (r.purchaseAmount || 0),
            profit: acc.profit + (r.totalProfit || 0),
          }),
          { qty: 0, sale: 0, purchase: 0, profit: 0 },
        ),
      [itemRows],
    )

    const [ledgerEntries, setLedgerEntries] = useState<PersonalLedgerEntry[]>([])
    const [ledgerOpeningBalance, setLedgerOpeningBalance] = useState(0)
    const [ledgerLoading, setLedgerLoading] = useState(true)

    useEffect(() => {
      let cancelled = false
      const previousDay = format(new Date(new Date(startDate).getTime() - 24 * 60 * 60 * 1000), 'yyyy-MM-dd')

      setLedgerLoading(true)
      Promise.all([
        Axios.get(summery.fetchPersonalLedgerEntries.url, {
          params: { sortBy: 'transactionDate:asc', page: 1, limit: 5000, startDate, endDate },
        }),
        Axios.get(summery.fetchPersonalLedgerEntries.url, {
          params: { sortBy: 'transactionDate:desc', page: 1, limit: 1, endDate: previousDay },
        }),
      ])
        .then(([reportRes, openingRes]) => {
          if (cancelled) return
          setLedgerEntries(reportRes.data?.results || [])
          setLedgerOpeningBalance(Number(openingRes.data?.results?.[0]?.balance || 0))
        })
        .catch(() => {
          if (cancelled) return
          setLedgerEntries([])
          setLedgerOpeningBalance(0)
        })
        .finally(() => {
          if (!cancelled) setLedgerLoading(false)
        })

      return () => {
        cancelled = true
      }
    }, [startDate, endDate])

    const ledgerSummary = useMemo(() => {
      const totalCredit = ledgerEntries.reduce((sum, e) => sum + (e.credit || 0), 0)
      const totalDebit = ledgerEntries.reduce((sum, e) => sum + (e.debit || 0), 0)
      const closingBalance = ledgerEntries.length ? ledgerEntries[ledgerEntries.length - 1].balance : ledgerOpeningBalance
      return {
        totalCredit,
        totalDebit,
        netBalance: totalCredit - totalDebit,
        openingBalance: ledgerOpeningBalance,
        closingBalance,
        avgTransaction: ledgerEntries.length ? (totalCredit + totalDebit) / ledgerEntries.length : 0,
        transactionCount: ledgerEntries.length,
      }
    }, [ledgerEntries, ledgerOpeningBalance])

    const ledgerIncomeByCategory = useMemo(() => buildLedgerCategoryBreakdown(ledgerEntries, 'income'), [ledgerEntries])
    const ledgerExpenseByCategory = useMemo(() => buildLedgerCategoryBreakdown(ledgerEntries, 'expense'), [ledgerEntries])

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          const wb = XLSX.utils.book_new()

          if (pnl) {
            const overviewRows = [
              { Metric: 'Net Revenue', Value: pnl.revenue.netRevenue },
              { Metric: 'Cost of Goods Sold', Value: pnl.revenue.costOfGoodsSold },
              { Metric: 'Gross Profit', Value: pnl.revenue.grossProfit },
              { Metric: 'Load Profit', Value: pnl.additionalProfits.loadProfit },
              { Metric: 'Repair Profit', Value: pnl.additionalProfits.repairProfit },
              { Metric: 'Service Profit', Value: pnl.additionalProfits.serviceProfit },
              { Metric: 'Sim Sale Profit', Value: pnl.additionalProfits.simSaleProfit },
              { Metric: 'Bill Net Profit', Value: pnl.additionalProfits.billNetProfit },
              { Metric: 'Withdrawal Profit', Value: pnl.additionalProfits.withdrawalProfit },
              { Metric: 'Deposit Profit', Value: pnl.additionalProfits.depositProfit },
              { Metric: 'Expenses', Value: pnl.expenses },
              { Metric: 'Net Profit', Value: pnl.netProfit },
            ]
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(overviewRows), 'Overview')
          }

          if (walletsWithActivity.length > 0) {
            const walletSummaryRows = walletsWithActivity.map((w) => ({
              Wallet: w.walletType,
              Balance: w.currentBalance,
              'Cash Withdrawals': w.cash.withdrawalAmount,
              'Cash Deposits': w.cash.depositAmount,
              'Cash Profit': w.cash.profit,
              'Load Sold': w.load.sold,
              'Load Purchased': w.load.purchased,
              'Load Profit': w.load.profit,
              'Sim Sale Count': w.simSale.count,
              'Sim Sale Amount': w.simSale.saleAmount,
              'Sim Sale Commission': w.simSale.commission,
              'Total Profit': w.totals.profit,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(walletSummaryRows), 'Wallets Summary')

            const flatten = (
              key: 'cash' | 'load' | 'simSale',
              mapRow: (w: string, r: WalletWiseTransaction) => Record<string, unknown>,
            ) =>
              walletsWithActivity.flatMap((w) => w[key].transactions.map((r) => mapRow(w.walletType, r)))

            const cashRows = flatten('cash', (wallet, r) => ({
              Wallet: wallet,
              Date: r.date,
              Type: r.type,
              Customer: r.customerName,
              Number: r.customerNumber,
              CNIC: r.customerCNIC,
              'Account Type': r.accountType,
              Amount: r.amount,
              Profit: r.profit,
            }))
            if (cashRows.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cashRows), 'Cash Transactions')

            const loadRowsFlat = flatten('load', (wallet, r) => ({
              Wallet: wallet,
              Date: r.date,
              Kind: r.kind,
              'Customer/Supplier': r.customerName,
              Number: r.mobileNumber,
              Amount: r.amount,
              Profit: r.profit,
            }))
            if (loadRowsFlat.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(loadRowsFlat), 'Load Transactions')

            const simSaleRowsFlat = flatten('simSale', (wallet, r) => ({
              Wallet: wallet,
              Date: r.date,
              Product: r.productName,
              Customer: r.customerName,
              Number: r.customerMobile,
              CNIC: r.customerCNIC,
              'Sale Amount': r.saleAmount,
              'Load Amount': r.loadAmount,
              Commission: r.commission,
            }))
            if (simSaleRowsFlat.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(simSaleRowsFlat), 'Sim Sale Transactions')
          }

          if (services && services.recentInvoices.length > 0) {
            XLSX.utils.book_append_sheet(
              wb,
              XLSX.utils.json_to_sheet(
                services.recentInvoices.map((r) => ({
                  Invoice: r.invoiceNumber,
                  Customer: r.customerName || '',
                  Phone: r.customerPhone || '',
                  Items: r.items.map((i) => `${i.serviceName} x${i.quantity}`).join(', '),
                  Total: r.totalAmount,
                  'Payment Method': r.paymentMethod,
                  Date: r.date,
                })),
              ),
              'Services',
            )
          }

          if (billPayments) {
            XLSX.utils.book_append_sheet(
              wb,
              XLSX.utils.json_to_sheet([
                { Metric: 'Total Bills', Value: billPayments.totalBills },
                { Metric: 'Total Collection', Value: billPayments.totalCollection },
                { Metric: 'Your Profit', Value: billPayments.totalNetBillProfit },
                { Metric: 'Pending', Value: billPayments.totalPending },
                { Metric: 'Overdue', Value: billPayments.totalOverdue },
              ]),
              'Bill Payments',
            )
          }

          if (agentBills && agentBills.bills.length > 0) {
            XLSX.utils.book_append_sheet(
              wb,
              XLSX.utils.json_to_sheet(
                agentBills.bills.map((b) => ({
                  Customer: b.customerName,
                  Reference: b.referenceNumber,
                  Company: b.companyName || '',
                  'Current Bill': b.currentBillAmount,
                  Overdue: b.overdueAmount,
                  Profit: b.profit,
                  Total: b.totalAmount,
                  Paid: b.isPaid ? 'Yes' : 'No',
                  Date: b.collectionDate,
                })),
              ),
              'Agent Bills',
            )
          }

          if (repair && repair.recentJobs.length > 0) {
            XLSX.utils.book_append_sheet(
              wb,
              XLSX.utils.json_to_sheet(
                repair.recentJobs.map((j) => ({
                  Customer: j.customerName,
                  Phone: j.phone || '',
                  Device: j.deviceModel,
                  Issue: j.issue,
                  Status: j.status,
                  Charges: j.charges,
                  Cost: j.cost,
                  Profit: j.charges - j.cost,
                  Technician: j.technician || '',
                  Date: j.date,
                })),
              ),
              'Repairing',
            )
          }

          if (expenses && expenses.categoryBreakdown.length > 0) {
            XLSX.utils.book_append_sheet(
              wb,
              XLSX.utils.json_to_sheet(
                expenses.categoryBreakdown.map((c) => ({
                  Category: c._id,
                  'Total Amount': c.totalAmount,
                  Count: c.expenseCount,
                  Average: c.avgAmount,
                })),
              ),
              'Expenses',
            )
          }

          XLSX.utils.book_append_sheet(
            wb,
            XLSX.utils.json_to_sheet([
              { Metric: 'Total Money In', Value: ledgerSummary.totalCredit },
              { Metric: 'Total Money Out / Expense', Value: ledgerSummary.totalDebit },
              { Metric: 'Net Balance', Value: ledgerSummary.netBalance },
              { Metric: 'Opening Balance', Value: ledgerSummary.openingBalance },
              { Metric: 'Closing Balance', Value: ledgerSummary.closingBalance },
              { Metric: 'Avg Transaction', Value: ledgerSummary.avgTransaction },
              { Metric: 'Cash In Hand', Value: salesPurchase?.summary.cashInHand ?? 0 },
              { Metric: 'Customer Receivables', Value: customers?.summary?.totalBalance ?? 0 },
              { Metric: 'Supplier Payables', Value: suppliers?.summary?.totalBalance ?? 0 },
            ]),
            'My Accounts',
          )

          if (ledgerIncomeByCategory.length > 0) {
            XLSX.utils.book_append_sheet(
              wb,
              XLSX.utils.json_to_sheet(ledgerIncomeByCategory.map((c) => ({ Category: c.name, 'Total Amount': c.totalAmount }))),
              'Income by Category',
            )
          }
          if (ledgerExpenseByCategory.length > 0) {
            XLSX.utils.book_append_sheet(
              wb,
              XLSX.utils.json_to_sheet(ledgerExpenseByCategory.map((c) => ({ Category: c.name, 'Total Amount': c.totalAmount }))),
              'My Account Expenses',
            )
          }

          if (wb.SheetNames.length === 0) {
            toast.error('No data available to export')
            return
          }

          XLSX.writeFile(wb, `complete-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success('Data exported successfully')
        } catch (error) {
          console.error('Export error:', error)
          toast.error('Failed to export data')
        }
      },
    }))

    if (isLoading) {
      return (
        <div className='space-y-4'>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className='h-[120px] w-full' />
            ))}
          </div>
          <Skeleton className='h-[500px] w-full' />
        </div>
      )
    }

    return (
      <div className='space-y-6 min-w-0 max-w-full'>
        {/* Jump-to section grid */}
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Complete Report</CardTitle>
            <CardDescription>Every module in one place — click a card to jump to its section</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
              {SECTIONS.map(({ key, label, icon: Icon, tone }) => (
                <button
                  key={key}
                  type='button'
                  onClick={() => scrollToSection(key)}
                  className='flex items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-primary/50'
                >
                  <div className={toneIconWrapClass(tone)}>
                    <Icon className='h-4 w-4' />
                  </div>
                  <span className='text-sm font-medium'>{label}</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Overview */}
        <div ref={(el) => { sectionRefs.current['overview'] = el }} className='scroll-mt-24'>
          <Card>
            <CardHeader>
              <CardTitle>Overview — Activities, Purchase/Sale &amp; Profit</CardTitle>
              <CardDescription>Revenue, cost, and profit rolled up across every module</CardDescription>
            </CardHeader>
            <CardContent>
              {!canAccess('profit_loss') ? (
                <LockedNote label='Overview' />
              ) : (
                <div className='space-y-6'>
                  <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                    <Card className={kpiCardClass('emerald')}>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                        <CardTitle className='text-sm font-medium'>Net Revenue</CardTitle>
                        <div className={toneIconWrapClass('emerald')}><TrendingUp className='h-4 w-4' /></div>
                      </CardHeader>
                      <CardContent><div className='text-2xl font-bold'>{fmt(pnl?.revenue.netRevenue ?? 0)}</div></CardContent>
                    </Card>
                    <Card className={kpiCardClass('rose')}>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                        <CardTitle className='text-sm font-medium'>Cost of Goods Sold</CardTitle>
                        <div className={toneIconWrapClass('rose')}><Receipt className='h-4 w-4' /></div>
                      </CardHeader>
                      <CardContent><div className='text-2xl font-bold'>{fmt(pnl?.revenue.costOfGoodsSold ?? 0)}</div></CardContent>
                    </Card>
                    <Card className={kpiCardClass('sky')}>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                        <CardTitle className='text-sm font-medium'>Gross Profit</CardTitle>
                        <div className={toneIconWrapClass('sky')}><Banknote className='h-4 w-4' /></div>
                      </CardHeader>
                      <CardContent><div className='text-2xl font-bold'>{fmt(pnl?.revenue.grossProfit ?? 0)}</div></CardContent>
                    </Card>
                    <Card className={kpiCardClass('violet')}>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                        <CardTitle className='text-sm font-medium'>Net Profit</CardTitle>
                        <div className={toneIconWrapClass('violet')}><Landmark className='h-4 w-4' /></div>
                      </CardHeader>
                      <CardContent>
                        <div className={cn('text-2xl font-bold', (pnl?.netProfit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600')}>
                          {fmt(pnl?.netProfit ?? 0)}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {pnl && (
                    <div>
                      <p className='mb-3 text-sm font-medium text-muted-foreground'>Profit by Center</p>
                      <div className='grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
                        {PROFIT_CENTERS.map(({ key, label, tone }) => {
                          const value = pnl.additionalProfits[key]
                          const positiveTotal = PROFIT_CENTERS.reduce(
                            (sum, c) => sum + Math.max(pnl.additionalProfits[c.key], 0),
                            0,
                          )
                          const share = positiveTotal && value > 0 ? (value / positiveTotal) * 100 : 0
                          return (
                            <div key={key} className='rounded-xl border bg-card p-4 shadow-sm'>
                              <div className='mb-2 flex items-center justify-between'>
                                <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold', toneIconWrapClass(tone))}>
                                  {label.charAt(0)}
                                </span>
                                {share > 0 && <Badge variant='secondary' className='text-xs'>{share.toFixed(1)}%</Badge>}
                              </div>
                              <p className='text-sm font-medium text-muted-foreground'>{label}</p>
                              <p className={cn('text-lg font-bold', value >= 0 ? '' : 'text-red-600')}>{fmt(value)}</p>
                              <div className='mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted'>
                                <div className='h-full rounded-full' style={{ width: `${share}%`, backgroundColor: toneColor(tone) }} />
                              </div>
                            </div>
                          )
                        })}
                        <div className='rounded-xl border bg-card p-4 shadow-sm'>
                          <div className='mb-2 flex items-center justify-between'>
                            <span className={cn('inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold', toneIconWrapClass('rose'))}>E</span>
                          </div>
                          <p className='text-sm font-medium text-muted-foreground'>Expenses</p>
                          <p className='text-lg font-bold text-red-600'>-{fmt(pnl.expenses)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div>
                    <div className='mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
                      <div>
                        <p className='text-sm font-medium'>Item-wise Sales, Purchase &amp; Profit</p>
                        <p className='text-xs text-muted-foreground'>Every product sold — purchase price, sale price and profit</p>
                      </div>
                      <div className='relative'>
                        <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
                        <Input
                          placeholder='Search product...'
                          value={itemSearch}
                          onChange={(e) => setItemSearch(e.target.value)}
                          className='w-full pl-8 sm:w-[240px]'
                        />
                      </div>
                    </div>
                    {itemRows.length === 0 ? (
                      <EmptyNote label='item sales' />
                    ) : (
                      <div className='rounded-md border'>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Product</TableHead>
                              <TableHead>Category</TableHead>
                              <TableHead className='text-right'>Qty Sold</TableHead>
                              <TableHead className='text-right'>Purchase Price</TableHead>
                              <TableHead className='text-right'>Sale Price</TableHead>
                              <TableHead className='text-right'>Profit</TableHead>
                              <TableHead className='text-right'>Margin</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {itemRows.map((row) => (
                              <TableRow key={row._id}>
                                <TableCell className='font-medium'>{row.productName}</TableCell>
                                <TableCell className='text-sm text-muted-foreground'>{row.category || '—'}</TableCell>
                                <TableCell className='text-right'>{row.totalQuantitySold}</TableCell>
                                <TableCell className='text-right'>{fmt(row.purchaseAmount)}</TableCell>
                                <TableCell className='text-right'>{fmt(row.totalRevenue)}</TableCell>
                                <TableCell className={cn('text-right font-medium', row.totalProfit >= 0 ? 'text-green-600' : 'text-red-600')}>
                                  {fmt(row.totalProfit)}
                                </TableCell>
                                <TableCell className='text-right text-sm text-muted-foreground'>{row.margin.toFixed(1)}%</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                          <TableFooter>
                            <TableRow>
                              <TableCell colSpan={2} className='font-semibold'>Total — {itemRows.length} items</TableCell>
                              <TableCell className='text-right font-semibold'>{itemTotals.qty}</TableCell>
                              <TableCell className='text-right font-semibold'>{fmt(itemTotals.purchase)}</TableCell>
                              <TableCell className='text-right font-semibold'>{fmt(itemTotals.sale)}</TableCell>
                              <TableCell className='text-right font-bold text-green-600'>{fmt(itemTotals.profit)}</TableCell>
                              <TableCell className='text-right' />
                            </TableRow>
                          </TableFooter>
                        </Table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sim-wise */}
        <div ref={(el) => { sectionRefs.current['sim-wise'] = el }} className='scroll-mt-24'>
          <Card>
            <CardHeader>
              <CardTitle>Sim-wise — Sim Sale, Cash Management &amp; Load</CardTitle>
              <CardDescription>Every wallet/account with full cash, load and sim sale transaction detail</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              {!canAccess('wallet') && !canAccess('load') ? (
                <LockedNote label='Sim-wise report' />
              ) : walletsWithActivity.length === 0 ? (
                <EmptyNote label='wallet activity' />
              ) : (
                walletsWithActivity.map((wallet) => <WalletCard key={wallet.walletType} wallet={wallet} />)
              )}
            </CardContent>
          </Card>
        </div>

        {/* Services */}
        <div ref={(el) => { sectionRefs.current['services'] = el }} className='scroll-mt-24'>
          <Card>
            <CardHeader>
              <CardTitle>Services</CardTitle>
              <CardDescription>Service-wise revenue breakdown</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid gap-4 sm:grid-cols-3'>
                <Card className={kpiCardClass('sky')}>
                  <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                    <CardTitle className='text-sm font-medium'>Total Invoices</CardTitle>
                    <div className={toneIconWrapClass('sky')}><Wrench className='h-4 w-4' /></div>
                  </CardHeader>
                  <CardContent><div className='text-2xl font-bold'>{services?.summary.totalInvoices ?? 0}</div></CardContent>
                </Card>
                <Card className={kpiCardClass('emerald')}>
                  <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                    <CardTitle className='text-sm font-medium'>Total Amount</CardTitle>
                    <div className={toneIconWrapClass('emerald')}><Banknote className='h-4 w-4' /></div>
                  </CardHeader>
                  <CardContent><div className='text-2xl font-bold text-green-600'>{fmt(services?.summary.totalAmount ?? 0)}</div></CardContent>
                </Card>
                <Card className={kpiCardClass('violet')}>
                  <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                    <CardTitle className='text-sm font-medium'>Avg Invoice</CardTitle>
                    <div className={toneIconWrapClass('violet')}><TrendingUp className='h-4 w-4' /></div>
                  </CardHeader>
                  <CardContent><div className='text-2xl font-bold'>{fmt(services?.summary.avgInvoice ?? 0)}</div></CardContent>
                </Card>
              </div>
              {!services || services.byService.length === 0 ? (
                <EmptyNote label='services' />
              ) : (
                <div>
                  <p className='mb-3 text-sm font-medium text-muted-foreground'>Service-wise Revenue</p>
                  <div className='grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
                    {services.byService.map((row, idx) => {
                      const share = services.summary.totalAmount ? (row.totalAmount / services.summary.totalAmount) * 100 : 0
                      const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
                      return (
                        <div key={row._id} className='rounded-xl border bg-card p-4 shadow-sm'>
                          <div className='mb-2 flex items-center justify-between'>
                            <span
                              className='inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white'
                              style={{ backgroundColor: color }}
                            >
                              {row._id.charAt(0).toUpperCase()}
                            </span>
                            <Badge variant='secondary' className='text-xs'>{share.toFixed(1)}%</Badge>
                          </div>
                          <p className='truncate text-sm font-semibold'>{row._id}</p>
                          <p className='text-lg font-bold' style={{ color }}>{fmt(row.totalAmount)}</p>
                          <div className='mt-2 flex items-center justify-between text-xs text-muted-foreground'>
                            <span>Qty {row.totalQuantity}</span>
                            <span>Avg {fmt(row.avgUnitPrice)}</span>
                          </div>
                          <div className='mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted'>
                            <div className='h-full rounded-full' style={{ width: `${share}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bill Payments */}
        <div ref={(el) => { sectionRefs.current['bill-payments'] = el }} className='scroll-mt-24'>
          <Card>
            <CardHeader>
              <CardTitle>Bill Payments</CardTitle>
              <CardDescription>Utility bills collected on customers&apos; behalf</CardDescription>
            </CardHeader>
            <CardContent>
              {!canAccess('bill_payment') ? (
                <LockedNote label='Bill Payments' />
              ) : billPaymentsLoading || !billPayments ? (
                <EmptyNote label='bill payments' />
              ) : (
                <div className='space-y-4'>
                  <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                    <Card className={kpiCardClass('amber')}>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                        <CardTitle className='text-sm font-medium'>Total Bills</CardTitle>
                        <div className={toneIconWrapClass('amber')}><Receipt className='h-4 w-4' /></div>
                      </CardHeader>
                      <CardContent><div className='text-2xl font-bold'>{billPayments.totalBills}</div></CardContent>
                    </Card>
                    <Card className={kpiCardClass('emerald')}>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                        <CardTitle className='text-sm font-medium'>Collection</CardTitle>
                        <div className={toneIconWrapClass('emerald')}><Banknote className='h-4 w-4' /></div>
                      </CardHeader>
                      <CardContent><div className='text-2xl font-bold text-green-600'>{fmt(billPayments.totalCollection)}</div></CardContent>
                    </Card>
                    <Card className={kpiCardClass('sky')}>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                        <CardTitle className='text-sm font-medium'>Your Profit</CardTitle>
                        <div className={toneIconWrapClass('sky')}><TrendingUp className='h-4 w-4' /></div>
                      </CardHeader>
                      <CardContent><div className='text-2xl font-bold text-green-600'>{fmt(billPayments.totalNetBillProfit)}</div></CardContent>
                    </Card>
                    <Card className={kpiCardClass('rose')}>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                        <CardTitle className='text-sm font-medium'>Pending / Overdue</CardTitle>
                        <div className={toneIconWrapClass('rose')}><ShieldCheck className='h-4 w-4' /></div>
                      </CardHeader>
                      <CardContent><div className='text-2xl font-bold'>{billPayments.totalPending} / {billPayments.totalOverdue}</div></CardContent>
                    </Card>
                  </div>
                  {billPayments.byCompany.length > 0 && (
                    <div>
                      <p className='mb-3 text-sm font-medium text-muted-foreground'>By Company</p>
                      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
                        {billPayments.byCompany.map((row, idx) => {
                          const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
                          return (
                            <div key={row._id} className='rounded-xl border bg-card p-4 shadow-sm'>
                              <div className='mb-2 flex items-center gap-2'>
                                <span
                                  className='inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white'
                                  style={{ backgroundColor: color }}
                                >
                                  {row._id.charAt(0).toUpperCase()}
                                </span>
                                <p className='truncate text-sm font-semibold'>{row._id}</p>
                              </div>
                              <p className='text-lg font-bold' style={{ color }}>{fmt(row.totalCollection)}</p>
                              <div className='mt-2 flex items-center justify-between text-xs text-muted-foreground'>
                                <span>{row.billCount} bills</span>
                                <span>Amount {fmt(row.totalBillAmount)}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Agent Bills */}
        <div ref={(el) => { sectionRefs.current['agent-bills'] = el }} className='scroll-mt-24'>
          <Card>
            <CardHeader>
              <CardTitle>Agent Bills</CardTitle>
              <CardDescription>Bills collected as an agent</CardDescription>
            </CardHeader>
            <CardContent>
              {!isAgentBillUser ? (
                <LockedNote label='Agent Bills' />
              ) : agentBillsLoading || !agentBills || agentBills.bills.length === 0 ? (
                <EmptyNote label='agent bills' />
              ) : (
                <div className='space-y-4'>
                  <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                    <Card className={kpiCardClass('indigo')}>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                        <CardTitle className='text-sm font-medium'>Total Bills</CardTitle>
                        <div className={toneIconWrapClass('indigo')}><ReceiptText className='h-4 w-4' /></div>
                      </CardHeader>
                      <CardContent><div className='text-2xl font-bold'>{agentBills.totalBills}</div></CardContent>
                    </Card>
                    <Card className={kpiCardClass('emerald')}>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                        <CardTitle className='text-sm font-medium'>Collection</CardTitle>
                        <div className={toneIconWrapClass('emerald')}><Banknote className='h-4 w-4' /></div>
                      </CardHeader>
                      <CardContent><div className='text-2xl font-bold text-green-600'>{fmt(agentBills.totalCollection)}</div></CardContent>
                    </Card>
                    <Card className={kpiCardClass('sky')}>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                        <CardTitle className='text-sm font-medium'>Profit</CardTitle>
                        <div className={toneIconWrapClass('sky')}><TrendingUp className='h-4 w-4' /></div>
                      </CardHeader>
                      <CardContent><div className='text-2xl font-bold text-green-600'>{fmt(agentBills.totalProfit)}</div></CardContent>
                    </Card>
                    <Card className={kpiCardClass('rose')}>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                        <CardTitle className='text-sm font-medium'>Pending / Overdue</CardTitle>
                        <div className={toneIconWrapClass('rose')}><ShieldCheck className='h-4 w-4' /></div>
                      </CardHeader>
                      <CardContent><div className='text-2xl font-bold'>{agentBills.totalPending} / {agentBills.totalOverdueBills}</div></CardContent>
                    </Card>
                  </div>
                  <div className='rounded-md border'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead className='text-right'>Current Bill</TableHead>
                          <TableHead className='text-right'>Previous Bill</TableHead>
                          <TableHead className='text-right'>Total</TableHead>
                          <TableHead className='text-right'>Profit</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {agentBills.bills.map((b) => (
                          <TableRow key={b.id}>
                            <TableCell className='font-medium'>{b.customerName}</TableCell>
                            <TableCell className='font-mono text-sm'>{b.referenceNumber}</TableCell>
                            <TableCell>{b.companyName || '—'}</TableCell>
                            <TableCell className='text-right'>{fmt(b.currentBillAmount)}</TableCell>
                            <TableCell className='text-right'>{fmt(b.previousBillAmount)}</TableCell>
                            <TableCell className='text-right font-semibold'>{fmt(b.totalAmount)}</TableCell>
                            <TableCell className='text-right text-green-600'>{fmt(b.profit)}</TableCell>
                            <TableCell>
                              <Badge variant={b.isPaid ? 'secondary' : 'outline'}>{b.isPaid ? 'Paid' : 'Pending'}</Badge>
                            </TableCell>
                            <TableCell className='whitespace-nowrap text-sm'>{fmtDate(b.collectionDate)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Repairing */}
        <div ref={(el) => { sectionRefs.current['repairing'] = el }} className='scroll-mt-24'>
          <Card>
            <CardHeader>
              <CardTitle>Repairing</CardTitle>
              <CardDescription>Device repair jobs</CardDescription>
            </CardHeader>
            <CardContent>
              {!canAccess('repair') ? (
                <LockedNote label='Repairing' />
              ) : !repair ? (
                <EmptyNote label='repair jobs' />
              ) : (
                <div className='space-y-4'>
                  <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
                    <Card className={kpiCardClass('orange')}>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                        <CardTitle className='text-sm font-medium'>Total Jobs</CardTitle>
                        <div className={toneIconWrapClass('orange')}><Wrench className='h-4 w-4' /></div>
                      </CardHeader>
                      <CardContent><div className='text-2xl font-bold'>{repair.summary.totalJobs}</div></CardContent>
                    </Card>
                    <Card className={kpiCardClass('emerald')}>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                        <CardTitle className='text-sm font-medium'>Revenue</CardTitle>
                        <div className={toneIconWrapClass('emerald')}><Banknote className='h-4 w-4' /></div>
                      </CardHeader>
                      <CardContent><div className='text-2xl font-bold text-green-600'>{fmt(repair.summary.totalRevenue)}</div></CardContent>
                    </Card>
                    <Card className={kpiCardClass('rose')}>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                        <CardTitle className='text-sm font-medium'>Cost</CardTitle>
                        <div className={toneIconWrapClass('rose')}><Receipt className='h-4 w-4' /></div>
                      </CardHeader>
                      <CardContent><div className='text-2xl font-bold text-red-600'>{fmt(repair.summary.totalCost)}</div></CardContent>
                    </Card>
                    <Card className={kpiCardClass('sky')}>
                      <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                        <CardTitle className='text-sm font-medium'>Profit</CardTitle>
                        <div className={toneIconWrapClass('sky')}><TrendingUp className='h-4 w-4' /></div>
                      </CardHeader>
                      <CardContent><div className='text-2xl font-bold text-green-600'>{fmt(repair.summary.totalProfit)}</div></CardContent>
                    </Card>
                  </div>
                  {repair.recentJobs.length === 0 ? (
                    <EmptyNote label='repair jobs' />
                  ) : (
                    <div className='rounded-md border'>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Customer</TableHead>
                            <TableHead>Device</TableHead>
                            <TableHead>Issue</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className='text-right'>Charges</TableHead>
                            <TableHead className='text-right'>Cost</TableHead>
                            <TableHead className='text-right'>Profit</TableHead>
                            <TableHead>Date</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {repair.recentJobs.map((job) => (
                            <TableRow key={job._id}>
                              <TableCell className='font-medium'>{job.customerName}</TableCell>
                              <TableCell>{job.deviceModel}</TableCell>
                              <TableCell className='max-w-[200px] truncate'>{job.issue}</TableCell>
                              <TableCell className='capitalize'>{job.status}</TableCell>
                              <TableCell className='text-right'>{fmt(job.charges)}</TableCell>
                              <TableCell className='text-right'>{fmt(job.cost)}</TableCell>
                              <TableCell className='text-right text-green-600'>{fmt(job.charges - job.cost)}</TableCell>
                              <TableCell className='whitespace-nowrap text-sm'>{fmtDate(job.date)}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Expenses */}
        <div ref={(el) => { sectionRefs.current['expenses'] = el }} className='scroll-mt-24'>
          <Card>
            <CardHeader>
              <CardTitle>Expenses</CardTitle>
              <CardDescription>Category-wise breakdown</CardDescription>
            </CardHeader>
            <CardContent className='space-y-4'>
              <div className='grid gap-4 sm:grid-cols-3'>
                <Card className={kpiCardClass('rose')}>
                  <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                    <CardTitle className='text-sm font-medium'>Total Expenses</CardTitle>
                    <div className={toneIconWrapClass('rose')}><Banknote className='h-4 w-4' /></div>
                  </CardHeader>
                  <CardContent><div className='text-2xl font-bold text-red-600'>{fmt(expenses?.summary.totalExpenses ?? 0)}</div></CardContent>
                </Card>
                <Card className={kpiCardClass('slate')}>
                  <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                    <CardTitle className='text-sm font-medium'>Entries</CardTitle>
                    <div className={toneIconWrapClass('slate')}><Receipt className='h-4 w-4' /></div>
                  </CardHeader>
                  <CardContent><div className='text-2xl font-bold'>{expenses?.summary.expenseCount ?? 0}</div></CardContent>
                </Card>
                <Card className={kpiCardClass('amber')}>
                  <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                    <CardTitle className='text-sm font-medium'>Average</CardTitle>
                    <div className={toneIconWrapClass('amber')}><TrendingUp className='h-4 w-4' /></div>
                  </CardHeader>
                  <CardContent><div className='text-2xl font-bold'>{fmt(expenses?.summary.avgExpense ?? 0)}</div></CardContent>
                </Card>
              </div>
              {!expenses || expenses.categoryBreakdown.length === 0 ? (
                <EmptyNote label='expenses' />
              ) : (
                <div>
                  <p className='mb-3 text-sm font-medium text-muted-foreground'>Category-wise Breakdown</p>
                  <div className='grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
                    {expenses.categoryBreakdown.map((row, idx) => {
                      const total = expenses.summary.totalExpenses || 0
                      const share = total ? (row.totalAmount / total) * 100 : 0
                      const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length]
                      return (
                        <div key={row._id} className='rounded-xl border bg-card p-4 shadow-sm'>
                          <div className='mb-2 flex items-center justify-between'>
                            <span
                              className='inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold text-white'
                              style={{ backgroundColor: color }}
                            >
                              {row._id.charAt(0).toUpperCase()}
                            </span>
                            <Badge variant='secondary' className='text-xs'>{share.toFixed(1)}%</Badge>
                          </div>
                          <p className='truncate text-sm font-semibold'>{row._id}</p>
                          <p className='text-lg font-bold text-red-600'>{fmt(row.totalAmount)}</p>
                          <div className='mt-2 flex items-center justify-between text-xs text-muted-foreground'>
                            <span>{row.expenseCount} entries</span>
                            <span>Avg {fmt(row.avgAmount)}</span>
                          </div>
                          <div className='mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted'>
                            <div className='h-full rounded-full' style={{ width: `${share}%`, backgroundColor: color }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* My Accounts */}
        <div ref={(el) => { sectionRefs.current['accounts'] = el }} className='scroll-mt-24'>
          <Card>
            <CardHeader>
              <CardTitle>My Accounts</CardTitle>
              <CardDescription>Your personal cash ledger — open the Accounting module for full ledgers &amp; statements</CardDescription>
            </CardHeader>
            <CardContent className='space-y-6'>
              {ledgerLoading ? (
                <Skeleton className='h-[200px] w-full' />
              ) : (
                <>
                  <div className='grid gap-4 sm:grid-cols-3 lg:grid-cols-6'>
                    <Card className={kpiCardClass('slate')}>
                      <CardHeader className='pb-2'><CardTitle className='text-sm font-medium'>Opening Balance</CardTitle></CardHeader>
                      <CardContent><div className='text-xl font-bold'>{fmt(ledgerSummary.openingBalance)}</div></CardContent>
                    </Card>
                    <Card className={kpiCardClass('emerald')}>
                      <CardHeader className='pb-2'><CardTitle className='text-sm font-medium'>Total Money In</CardTitle></CardHeader>
                      <CardContent><div className='text-xl font-bold text-green-600'>{fmt(ledgerSummary.totalCredit)}</div></CardContent>
                    </Card>
                    <Card className={kpiCardClass('rose')}>
                      <CardHeader className='pb-2'><CardTitle className='text-sm font-medium'>Total Money Out / Expense</CardTitle></CardHeader>
                      <CardContent><div className='text-xl font-bold text-red-600'>{fmt(ledgerSummary.totalDebit)}</div></CardContent>
                    </Card>
                    <Card className={kpiCardClass('sky')}>
                      <CardHeader className='pb-2'><CardTitle className='text-sm font-medium'>Net Balance</CardTitle></CardHeader>
                      <CardContent>
                        <div className={cn('text-xl font-bold', ledgerSummary.netBalance >= 0 ? 'text-green-600' : 'text-red-600')}>
                          {fmt(ledgerSummary.netBalance)}
                        </div>
                        <p className='text-xs text-muted-foreground'>{ledgerSummary.netBalance >= 0 ? 'Positive' : 'Negative'}</p>
                      </CardContent>
                    </Card>
                    <Card className={kpiCardClass('violet')}>
                      <CardHeader className='pb-2'><CardTitle className='text-sm font-medium'>Closing Balance</CardTitle></CardHeader>
                      <CardContent><div className='text-xl font-bold'>{fmt(ledgerSummary.closingBalance)}</div></CardContent>
                    </Card>
                    <Card className={kpiCardClass('amber')}>
                      <CardHeader className='pb-2'><CardTitle className='text-sm font-medium'>Avg Transaction</CardTitle></CardHeader>
                      <CardContent><div className='text-xl font-bold'>{fmt(ledgerSummary.avgTransaction)}</div></CardContent>
                    </Card>
                  </div>

                  {(ledgerIncomeByCategory.length > 0 || ledgerExpenseByCategory.length > 0) && (
                    <div className='grid gap-4 md:grid-cols-2'>
                      {ledgerIncomeByCategory.length > 0 && (
                        <div>
                          <p className='mb-2 text-sm font-medium'>Income by Category</p>
                          <div className='space-y-2'>
                            {ledgerIncomeByCategory.map((cat, idx) => {
                              const share = ledgerSummary.totalCredit ? (cat.totalAmount / ledgerSummary.totalCredit) * 100 : 0
                              return (
                                <div key={cat.name} className='flex items-center gap-3 rounded-lg border p-2.5'>
                                  <span
                                    className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white'
                                    style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                                  >
                                    {cat.name.charAt(0).toUpperCase()}
                                  </span>
                                  <div className='min-w-0 flex-1'>
                                    <p className='truncate text-sm font-medium'>{cat.name}</p>
                                    <div className='mt-1 h-1 w-full overflow-hidden rounded-full bg-muted'>
                                      <div className='h-full rounded-full bg-emerald-500' style={{ width: `${share}%` }} />
                                    </div>
                                  </div>
                                  <div className='text-right text-sm font-semibold text-green-600'>{fmt(cat.totalAmount)}</div>
                                  <Badge variant='secondary' className='text-xs'>{share.toFixed(0)}%</Badge>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {ledgerExpenseByCategory.length > 0 && (
                        <div>
                          <p className='mb-2 text-sm font-medium'>Expense by Category</p>
                          <div className='space-y-2'>
                            {ledgerExpenseByCategory.map((cat, idx) => {
                              const share = ledgerSummary.totalDebit ? (cat.totalAmount / ledgerSummary.totalDebit) * 100 : 0
                              return (
                                <div key={cat.name} className='flex items-center gap-3 rounded-lg border p-2.5'>
                                  <span
                                    className='inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white'
                                    style={{ backgroundColor: CATEGORY_COLORS[idx % CATEGORY_COLORS.length] }}
                                  >
                                    {cat.name.charAt(0).toUpperCase()}
                                  </span>
                                  <div className='min-w-0 flex-1'>
                                    <p className='truncate text-sm font-medium'>{cat.name}</p>
                                    <div className='mt-1 h-1 w-full overflow-hidden rounded-full bg-muted'>
                                      <div className='h-full rounded-full bg-rose-500' style={{ width: `${share}%` }} />
                                    </div>
                                  </div>
                                  <div className='text-right text-sm font-semibold text-red-600'>{fmt(cat.totalAmount)}</div>
                                  <Badge variant='secondary' className='text-xs'>{share.toFixed(0)}%</Badge>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              <Link to='/accounting' search={{ tab: 'wallet' }} className='inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline'>
                View full accounts <ArrowRight className='h-3.5 w-3.5' />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  },
)

CompleteReport.displayName = 'CompleteReport'
