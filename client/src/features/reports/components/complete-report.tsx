import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'
import { Link } from '@tanstack/react-router'
import { useSelector } from 'react-redux'
import { differenceInCalendarDays, format } from 'date-fns'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { ArrowRight, Search, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
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
  type WalletWiseTransaction,
} from '@/stores/reports.api'
import { useGetBillPaymentReportQuery, useGetAgentBillReportQuery } from '@/stores/mobile-shop.api'
import { AGENT_BILL_EMAIL } from '../../mobile-shop/bill-payments'
import { useFeatureAccess } from '@/hooks/use-feature-access'
import { cn } from '@/lib/utils'

interface CompleteReportProps {
  startDate: string
  endDate: string
}

const fmt = (v: number) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(v || 0)
const fmtDate = (v: string | undefined) => (v ? format(new Date(v), 'dd MMM yyyy') : '—')

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
  const map = new Map<string, { totalAmount: number; count: number }>()
  for (const entry of entries) {
    if (flow === 'expense') {
      if (entry.transactionType !== 'expense' || !(entry.debit > 0)) continue
    } else if (!isIncomeLedgerType(entry.transactionType) || !(entry.credit > 0)) {
      continue
    }
    const amount = flow === 'expense' ? entry.debit : entry.credit
    const cat = entry.category?.trim() || 'Uncategorized'
    const row = map.get(cat) || { totalAmount: 0, count: 0 }
    row.totalAmount += amount
    row.count += 1
    map.set(cat, row)
  }
  return Array.from(map.entries())
    .map(([name, row]) => ({ name, totalAmount: row.totalAmount, count: row.count }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
}

export const CompleteReport = forwardRef<{ exportToExcel: () => void }, CompleteReportProps>(
  ({ startDate, endDate }, ref) => {
    const user = useSelector((state: RootState) => state.auth.data?.user)
    const { canAccess } = useFeatureAccess()
    const isAgentBillUser = user?.email === AGENT_BILL_EMAIL
    const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

    const daysInRange = useMemo(
      () => Math.max(1, differenceInCalendarDays(new Date(endDate), new Date(startDate)) + 1),
      [startDate, endDate],
    )

    const { data: pnl, isLoading: pnlLoading } = useGetProfitLossFullReportQuery(
      { from: startDate, to: endDate },
      { skip: !canAccess('profit_loss') },
    )
    const { data: walletWise, isLoading: walletWiseLoading } = useGetWalletWiseReportQuery({ startDate, endDate })
    const { data: services, isLoading: servicesLoading } = useGetServiceReportQuery({ startDate, endDate })
    const { data: billPayments } = useGetBillPaymentReportQuery(
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
    const { data: expenses, isLoading: expensesLoading } = useGetExpenseReportQuery({ startDate, endDate, groupRecurring: true })
    const { data: salesPurchase } = useGetSalesPurchaseSummaryReportQuery({ startDate, endDate })
    const { data: customers } = useGetCustomerReportQuery({ startDate, endDate })
    const { data: suppliers } = useGetSupplierReportQuery({ startDate, endDate })
    const { data: productReport, isLoading: productLoading } = useGetProductReportQuery({ startDate, endDate })

    const isLoading = pnlLoading || walletWiseLoading || servicesLoading || repairLoading || expensesLoading || productLoading

    const walletsWithActivity = useMemo(
      () => (walletWise?.wallets || []).filter((w) => w.totals.transactions > 0 || w.currentBalance > 0),
      [walletWise],
    )

    const sortByDateDesc = <T extends { date: string }>(rows: T[]) =>
      rows.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    const loadReport = useMemo(() => {
      let sold = 0
      let purchased = 0
      let profit = 0
      const transactions: (WalletWiseTransaction & { wallet: string })[] = []
      walletsWithActivity.forEach((w) => {
        sold += w.load.sold
        purchased += w.load.purchased
        profit += w.load.profit
        w.load.transactions.forEach((t) => transactions.push({ ...t, wallet: w.walletType }))
      })
      return { sold, purchased, profit, transactions: sortByDateDesc(transactions) }
    }, [walletsWithActivity])

    const loadWalletRows = useMemo(
      () =>
        walletsWithActivity
          .filter((w) => w.load.transactions.length > 0 || w.load.sold > 0 || w.load.purchased > 0)
          .map((w) => ({
            walletType: w.walletType,
            transactions: w.load.transactions.length,
            purchased: w.load.purchased,
            sold: w.load.sold,
            profit: w.load.profit,
          }))
          .sort((a, b) => b.profit - a.profit),
      [walletsWithActivity],
    )

    const cashReport = useMemo(() => {
      let withdrawalAmount = 0
      let depositAmount = 0
      let profit = 0
      const transactions: (WalletWiseTransaction & { wallet: string })[] = []
      walletsWithActivity.forEach((w) => {
        withdrawalAmount += w.cash.withdrawalAmount
        depositAmount += w.cash.depositAmount
        profit += w.cash.profit
        w.cash.transactions.forEach((t) => transactions.push({ ...t, wallet: w.walletType }))
      })
      return { withdrawalAmount, depositAmount, profit, transactions: sortByDateDesc(transactions) }
    }, [walletsWithActivity])

    const cashWalletRows = useMemo(
      () =>
        walletsWithActivity
          .filter((w) => w.cash.transactions.length > 0 || w.cash.withdrawalAmount > 0 || w.cash.depositAmount > 0)
          .map((w) => {
            const sendProfit = w.cash.transactions
              .filter((t) => t.type === 'withdrawal')
              .reduce((sum, t) => sum + (Number(t.profit) || 0), 0)
            const receiveProfit = w.cash.transactions
              .filter((t) => t.type === 'deposit')
              .reduce((sum, t) => sum + (Number(t.profit) || 0), 0)
            return {
              walletType: w.walletType,
              transactions: w.cash.transactions.length,
              sendAmount: w.cash.withdrawalAmount,
              sendProfit,
              receiveAmount: w.cash.depositAmount,
              receiveProfit,
            }
          })
          .sort((a, b) => b.sendProfit + b.receiveProfit - (a.sendProfit + a.receiveProfit)),
      [walletsWithActivity],
    )

    const cashWalletTotals = useMemo(
      () =>
        cashWalletRows.reduce(
          (acc, r) => ({
            sendProfit: acc.sendProfit + r.sendProfit,
            receiveProfit: acc.receiveProfit + r.receiveProfit,
          }),
          { sendProfit: 0, receiveProfit: 0 },
        ),
      [cashWalletRows],
    )

    const simSaleReport = useMemo(() => {
      let count = 0
      let saleAmount = 0
      let loadAmount = 0
      let purchaseAmount = 0
      let commission = 0
      const transactions: (WalletWiseTransaction & { wallet: string })[] = []
      walletsWithActivity.forEach((w) => {
        count += w.simSale.count
        saleAmount += w.simSale.saleAmount
        loadAmount += w.simSale.loadAmount
        purchaseAmount += w.simSale.purchaseAmount
        commission += w.simSale.commission
        w.simSale.transactions.forEach((t) => transactions.push({ ...t, wallet: w.walletType }))
      })
      return { count, saleAmount, loadAmount, purchaseAmount, commission, transactions: sortByDateDesc(transactions) }
    }, [walletsWithActivity])

    const simSaleProductRows = useMemo(() => {
      const map = new Map<string, { productName: string; count: number; saleAmount: number; loadAmount: number; purchaseAmount: number; commission: number }>()
      simSaleReport.transactions.forEach((t) => {
        const name = String(t.productName || 'Unknown')
        const row = map.get(name) || { productName: name, count: 0, saleAmount: 0, loadAmount: 0, purchaseAmount: 0, commission: 0 }
        row.count += 1
        row.saleAmount += Number(t.saleAmount) || 0
        row.loadAmount += Number(t.loadAmount) || 0
        row.purchaseAmount += Number(t.purchaseAmount) || 0
        row.commission += Number(t.commission) || 0
        map.set(name, row)
      })
      return Array.from(map.values()).sort((a, b) => b.commission - a.commission)
    }, [simSaleReport.transactions])

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

    const moduleSummaryRows = useMemo(
      () => [
        { name: 'Load', total: loadReport.sold + loadReport.purchased, profit: loadReport.profit },
        { name: 'Cash Management', total: cashReport.withdrawalAmount + cashReport.depositAmount, profit: cashReport.profit },
        { name: 'Sim Sale', total: simSaleReport.saleAmount, profit: simSaleReport.commission },
        { name: 'Services', total: services?.summary.totalAmount ?? 0, profit: services?.summary.totalProfit ?? 0 },
        { name: 'Agent Bills', total: agentBills?.totalCollection ?? 0, profit: agentBills?.totalProfit ?? 0 },
        { name: 'Repairing', total: repair?.summary.totalRevenue ?? 0, profit: repair?.summary.totalProfit ?? 0 },
        { name: 'Expenses', total: expenses?.summary.totalExpenses ?? 0, profit: -(expenses?.summary.totalExpenses ?? 0) },
        { name: 'My Accounts', total: ledgerSummary.totalCredit, profit: ledgerSummary.netBalance },
      ],
      [loadReport, cashReport, simSaleReport, services, agentBills, repair, expenses, ledgerSummary],
    )

    const moduleSummaryTotals = useMemo(
      () =>
        moduleSummaryRows.reduce(
          (acc, r) => ({ total: acc.total + r.total, profit: acc.profit + r.profit }),
          { total: 0, profit: 0 },
        ),
      [moduleSummaryRows],
    )

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
              'Purchase Amount': r.purchaseAmount,
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

          XLSX.writeFile(wb, `final-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
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
                              <TableHead className='text-right'>Qty Sold</TableHead>
                              <TableHead className='text-right'>Purchase Amount</TableHead>
                              <TableHead className='text-right'>Sale Amount</TableHead>
                              <TableHead className='text-right'>Profit</TableHead>
                              <TableHead className='text-right'>Margin</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {itemRows.map((row) => (
                              <TableRow key={row._id}>
                                <TableCell className='font-medium'>{row.productName}</TableCell>
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
                              <TableCell className='font-semibold'>Total — {itemRows.length} items</TableCell>
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

        {/* Load */}
        <div ref={(el) => { sectionRefs.current['load'] = el }} className='scroll-mt-24'>
          <Card>
            <CardHeader>
              <CardTitle>Load</CardTitle>
              <CardDescription>Wallet-wise load sold to customers and purchased from suppliers</CardDescription>
            </CardHeader>
            <CardContent>
              {!canAccess('load') ? (
                <LockedNote label='Load report' />
              ) : loadWalletRows.length === 0 ? (
                <EmptyNote label='load transactions' />
              ) : (
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Wallet</TableHead>
                        <TableHead className='text-right'>Transactions</TableHead>
                        <TableHead className='text-right'>Purchase Amount</TableHead>
                        <TableHead className='text-right'>Sale Amount</TableHead>
                        <TableHead className='text-right'>Profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadWalletRows.map((row) => (
                        <TableRow key={row.walletType}>
                          <TableCell className='font-medium'>{row.walletType}</TableCell>
                          <TableCell className='text-right'>{row.transactions}</TableCell>
                          <TableCell className='text-right'>{fmt(row.purchased)}</TableCell>
                          <TableCell className='text-right'>{fmt(row.sold)}</TableCell>
                          <TableCell className={cn('text-right font-medium', row.profit >= 0 ? 'text-green-600' : 'text-red-600')}>
                            {fmt(row.profit)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className='font-semibold'>Total — {loadWalletRows.length} wallets</TableCell>
                        <TableCell className='text-right font-semibold'>{loadReport.transactions.length}</TableCell>
                        <TableCell className='text-right font-semibold'>{fmt(loadReport.purchased)}</TableCell>
                        <TableCell className='text-right font-semibold'>{fmt(loadReport.sold)}</TableCell>
                        <TableCell className='text-right font-bold text-green-600'>{fmt(loadReport.profit)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Cash Management */}
        <div ref={(el) => { sectionRefs.current['cash-management'] = el }} className='scroll-mt-24'>
          <Card>
            <CardHeader>
              <CardTitle>Cash Management — Send &amp; Receive</CardTitle>
              <CardDescription>Cash withdrawals (sent to customers) and deposits (received from customers), across every wallet</CardDescription>
            </CardHeader>
            <CardContent>
              {!canAccess('wallet') ? (
                <LockedNote label='Cash management report' />
              ) : cashWalletRows.length === 0 ? (
                <EmptyNote label='cash management transactions' />
              ) : (
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Wallet</TableHead>
                        <TableHead className='text-right'>Transactions</TableHead>
                        <TableHead className='text-right'>Send Amount</TableHead>
                        <TableHead className='text-right'>Send Profit</TableHead>
                        <TableHead className='text-right'>Receive Amount</TableHead>
                        <TableHead className='text-right'>Receive Profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cashWalletRows.map((row) => (
                        <TableRow key={row.walletType}>
                          <TableCell className='font-medium'>{row.walletType}</TableCell>
                          <TableCell className='text-right'>{row.transactions}</TableCell>
                          <TableCell className='text-right'>{fmt(row.sendAmount)}</TableCell>
                          <TableCell className='text-right text-green-600'>{fmt(row.sendProfit)}</TableCell>
                          <TableCell className='text-right'>{fmt(row.receiveAmount)}</TableCell>
                          <TableCell className='text-right text-green-600'>{fmt(row.receiveProfit)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className='font-semibold'>Total — {cashWalletRows.length} wallets</TableCell>
                        <TableCell className='text-right font-semibold'>{cashReport.transactions.length}</TableCell>
                        <TableCell className='text-right font-semibold'>{fmt(cashReport.withdrawalAmount)}</TableCell>
                        <TableCell className='text-right font-bold text-green-600'>{fmt(cashWalletTotals.sendProfit)}</TableCell>
                        <TableCell className='text-right font-semibold'>{fmt(cashReport.depositAmount)}</TableCell>
                        <TableCell className='text-right font-bold text-green-600'>{fmt(cashWalletTotals.receiveProfit)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sim Sale */}
        <div ref={(el) => { sectionRefs.current['sim-sale'] = el }} className='scroll-mt-24'>
          <Card>
            <CardHeader>
              <CardTitle>Sim Sale</CardTitle>
              <CardDescription>Sim-wise sales with load bundled in, across every wallet</CardDescription>
            </CardHeader>
            <CardContent>
              {!canAccess('wallet') ? (
                <LockedNote label='Sim sale report' />
              ) : simSaleProductRows.length === 0 ? (
                <EmptyNote label='sim sale transactions' />
              ) : (
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Sim</TableHead>
                        <TableHead className='text-right'>Transactions</TableHead>
                        <TableHead className='text-right'>Purchase Amount</TableHead>
                        <TableHead className='text-right'>Sale Amount</TableHead>
                        <TableHead className='text-right'>Load Amount</TableHead>
                        <TableHead className='text-right'>Commission</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {simSaleProductRows.map((row) => (
                        <TableRow key={row.productName}>
                          <TableCell className='font-medium'>{row.productName}</TableCell>
                          <TableCell className='text-right'>{row.count}</TableCell>
                          <TableCell className='text-right'>{fmt(row.purchaseAmount)}</TableCell>
                          <TableCell className='text-right'>{fmt(row.saleAmount)}</TableCell>
                          <TableCell className='text-right'>{fmt(row.loadAmount)}</TableCell>
                          <TableCell className='text-right text-green-600'>{fmt(row.commission)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className='font-semibold'>Total — {simSaleProductRows.length} sims</TableCell>
                        <TableCell className='text-right font-semibold'>{simSaleReport.count}</TableCell>
                        <TableCell className='text-right font-semibold'>{fmt(simSaleReport.purchaseAmount)}</TableCell>
                        <TableCell className='text-right font-semibold'>{fmt(simSaleReport.saleAmount)}</TableCell>
                        <TableCell className='text-right font-semibold'>{fmt(simSaleReport.loadAmount)}</TableCell>
                        <TableCell className='text-right font-bold text-green-600'>{fmt(simSaleReport.commission)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
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
              {!services || services.byService.length === 0 ? (
                <EmptyNote label='services' />
              ) : (
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service</TableHead>
                        <TableHead className='text-right'>Qty</TableHead>
                        <TableHead className='text-right'>Amount</TableHead>
                        <TableHead className='text-right'>Per Day Avg</TableHead>
                        <TableHead className='text-right'>Profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {services.byService.map((row) => (
                        <TableRow key={row._id}>
                          <TableCell className='font-medium'>{row._id}</TableCell>
                          <TableCell className='text-right'>{row.totalQuantity}</TableCell>
                          <TableCell className='text-right'>{fmt(row.totalAmount)}</TableCell>
                          <TableCell className='text-right'>{fmt(row.totalAmount / daysInRange)}</TableCell>
                          <TableCell className='text-right text-green-600'>{fmt(row.totalAmount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className='font-semibold'>Total — {services.byService.length} services</TableCell>
                        <TableCell className='text-right font-semibold'>
                          {services.byService.reduce((sum, r) => sum + r.totalQuantity, 0)}
                        </TableCell>
                        <TableCell className='text-right font-semibold'>{fmt(services.summary.totalAmount)}</TableCell>
                        <TableCell className='text-right font-semibold'>{fmt(services.summary.totalAmount / daysInRange)}</TableCell>
                        <TableCell className='text-right font-bold text-green-600'>{fmt(services.summary.totalProfit)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
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
              <CardDescription>Company-wise bills collected as an agent</CardDescription>
            </CardHeader>
            <CardContent>
              {!isAgentBillUser ? (
                <LockedNote label='Agent Bills' />
              ) : agentBillsLoading || !agentBills || agentBills.byCompany.length === 0 ? (
                <EmptyNote label='agent bills' />
              ) : (
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Company</TableHead>
                        <TableHead className='text-right'>Bills</TableHead>
                        <TableHead className='text-right'>Collection</TableHead>
                        <TableHead className='text-right'>Overdue</TableHead>
                        <TableHead className='text-right'>Payable</TableHead>
                        <TableHead className='text-right'>Profit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {agentBills.byCompany.map((row) => (
                        <TableRow key={row._id}>
                          <TableCell className='font-medium'>{row._id}</TableCell>
                          <TableCell className='text-right'>{row.billCount}</TableCell>
                          <TableCell className='text-right'>{fmt(row.totalCollection)}</TableCell>
                          <TableCell className='text-right text-amber-600'>{fmt(row.totalOverdue)}</TableCell>
                          <TableCell className='text-right text-red-600'>{fmt(row.totalPayable)}</TableCell>
                          <TableCell className='text-right text-green-600'>{fmt(row.totalProfit)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className='font-semibold'>Total — {agentBills.byCompany.length} companies</TableCell>
                        <TableCell className='text-right font-semibold'>{agentBills.totalBills}</TableCell>
                        <TableCell className='text-right font-semibold'>{fmt(agentBills.totalCollection)}</TableCell>
                        <TableCell className='text-right font-semibold text-amber-600'>{fmt(agentBills.totalOverdue)}</TableCell>
                        <TableCell className='text-right font-semibold text-red-600'>{fmt(agentBills.totalPayable)}</TableCell>
                        <TableCell className='text-right font-bold text-green-600'>{fmt(agentBills.totalProfit)}</TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
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
              ) : !repair || repair.recentJobs.length === 0 ? (
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
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={4} className='font-semibold'>Total — {repair.summary.totalJobs} jobs</TableCell>
                        <TableCell className='text-right font-semibold'>{fmt(repair.summary.totalRevenue)}</TableCell>
                        <TableCell className='text-right font-semibold'>{fmt(repair.summary.totalCost)}</TableCell>
                        <TableCell className='text-right font-bold text-green-600'>{fmt(repair.summary.totalProfit)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  </Table>
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
            <CardContent>
              {!expenses || expenses.categoryBreakdown.length === 0 ? (
                <EmptyNote label='expenses' />
              ) : (
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className='text-right'>Entries</TableHead>
                        <TableHead className='text-right'>Total Amount</TableHead>
                        <TableHead className='text-right'>Average</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.categoryBreakdown.map((row) => (
                        <TableRow key={row._id}>
                          <TableCell className='font-medium'>{row._id}</TableCell>
                          <TableCell className='text-right'>{row.expenseCount}</TableCell>
                          <TableCell className='text-right text-red-600'>{fmt(row.totalAmount)}</TableCell>
                          <TableCell className='text-right'>{fmt(row.avgAmount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className='font-semibold'>Total — {expenses.categoryBreakdown.length} categories</TableCell>
                        <TableCell className='text-right font-semibold'>
                          {expenses.categoryBreakdown.reduce((sum, r) => sum + r.expenseCount, 0)}
                        </TableCell>
                        <TableCell className='text-right font-bold text-red-600'>
                          {fmt(expenses.categoryBreakdown.reduce((sum, r) => sum + r.totalAmount, 0))}
                        </TableCell>
                        <TableCell className='text-right font-semibold'>
                          {fmt(
                            expenses.categoryBreakdown.reduce((sum, r) => sum + r.totalAmount, 0) /
                              (expenses.categoryBreakdown.reduce((sum, r) => sum + r.expenseCount, 0) || 1),
                          )}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recurring Expenses */}
        {expenses && expenses.recurringBreakdown.length > 0 && (
          <div className='scroll-mt-24'>
            <Card>
              <CardHeader>
                <CardTitle>Recurring Expenses</CardTitle>
                <CardDescription>Auto-generated by recurring rules — kept separate from manual entries</CardDescription>
              </CardHeader>
              <CardContent>
                <div className='rounded-md border'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className='text-right'>Entries</TableHead>
                        <TableHead className='text-right'>Total Amount</TableHead>
                        <TableHead className='text-right'>Average</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {expenses.recurringBreakdown.map((row) => (
                        <TableRow key={row._id}>
                          <TableCell className='font-medium'>{row._id}</TableCell>
                          <TableCell className='text-right'>{row.expenseCount}</TableCell>
                          <TableCell className='text-right text-red-600'>{fmt(row.totalAmount)}</TableCell>
                          <TableCell className='text-right'>{fmt(row.avgAmount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className='font-semibold'>Total — {expenses.recurringBreakdown.length} categories</TableCell>
                        <TableCell className='text-right font-semibold'>
                          {expenses.recurringBreakdown.reduce((sum, r) => sum + r.expenseCount, 0)}
                        </TableCell>
                        <TableCell className='text-right font-bold text-red-600'>
                          {fmt(expenses.recurringBreakdown.reduce((sum, r) => sum + r.totalAmount, 0))}
                        </TableCell>
                        <TableCell className='text-right font-semibold'>
                          {fmt(
                            expenses.recurringBreakdown.reduce((sum, r) => sum + r.totalAmount, 0) /
                              (expenses.recurringBreakdown.reduce((sum, r) => sum + r.expenseCount, 0) || 1),
                          )}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

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
                (ledgerIncomeByCategory.length > 0 || ledgerExpenseByCategory.length > 0) && (
                  <div className='grid gap-4 md:grid-cols-2'>
                    {ledgerIncomeByCategory.length > 0 && (
                      <div className='rounded-md border'>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Income Category</TableHead>
                              <TableHead className='text-right'>Entries</TableHead>
                              <TableHead className='text-right'>Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ledgerIncomeByCategory.map((cat) => (
                              <TableRow key={cat.name}>
                                <TableCell className='font-medium'>{cat.name}</TableCell>
                                <TableCell className='text-right'>{cat.count}</TableCell>
                                <TableCell className='text-right text-green-600'>{fmt(cat.totalAmount)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                          <TableFooter>
                            <TableRow>
                              <TableCell className='font-semibold'>Total</TableCell>
                              <TableCell className='text-right font-semibold'>
                                {ledgerIncomeByCategory.reduce((sum, c) => sum + c.count, 0)}
                              </TableCell>
                              <TableCell className='text-right font-bold text-green-600'>{fmt(ledgerSummary.totalCredit)}</TableCell>
                            </TableRow>
                          </TableFooter>
                        </Table>
                      </div>
                    )}
                    {ledgerExpenseByCategory.length > 0 && (
                      <div className='rounded-md border'>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Expense Category</TableHead>
                              <TableHead className='text-right'>Entries</TableHead>
                              <TableHead className='text-right'>Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {ledgerExpenseByCategory.map((cat) => (
                              <TableRow key={cat.name}>
                                <TableCell className='font-medium'>{cat.name}</TableCell>
                                <TableCell className='text-right'>{cat.count}</TableCell>
                                <TableCell className='text-right text-red-600'>{fmt(cat.totalAmount)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                          <TableFooter>
                            <TableRow>
                              <TableCell className='font-semibold'>Total</TableCell>
                              <TableCell className='text-right font-semibold'>
                                {ledgerExpenseByCategory.reduce((sum, c) => sum + c.count, 0)}
                              </TableCell>
                              <TableCell className='text-right font-bold text-red-600'>{fmt(ledgerSummary.totalDebit)}</TableCell>
                            </TableRow>
                          </TableFooter>
                        </Table>
                      </div>
                    )}
                  </div>
                )
              )}

              <Link to='/accounting' search={{ tab: 'wallet' }} className='inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline'>
                View full accounts <ArrowRight className='h-3.5 w-3.5' />
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* All Modules Summary */}
        <div className='scroll-mt-24'>
          <Card>
            <CardHeader>
              <CardTitle>All Modules Summary</CardTitle>
              <CardDescription>Total activity and profit across every module</CardDescription>
            </CardHeader>
            <CardContent>
              <div className='grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
                {moduleSummaryRows.map((row) => (
                  <div key={row.name} className='rounded-xl border bg-card p-4 shadow-sm'>
                    <p className='text-sm font-medium text-muted-foreground'>{row.name}</p>
                    <p className='text-lg font-bold'>{fmt(row.total)}</p>
                    <div className='mt-2 flex items-center justify-between text-xs'>
                      <span className='text-muted-foreground'>Profit</span>
                      <span className={cn('font-semibold', row.profit >= 0 ? 'text-green-600' : 'text-red-600')}>
                        {fmt(row.profit)}
                      </span>
                    </div>
                  </div>
                ))}
                <div className='rounded-xl border-2 border-primary/30 bg-card p-4 shadow-sm'>
                  <p className='text-sm font-medium text-muted-foreground'>Grand Total</p>
                  <p className='text-lg font-bold'>{fmt(moduleSummaryTotals.total)}</p>
                  <div className='mt-2 flex items-center justify-between text-xs'>
                    <span className='text-muted-foreground'>Net Profit</span>
                    <span className={cn('font-semibold', moduleSummaryTotals.profit >= 0 ? 'text-green-600' : 'text-red-600')}>
                      {fmt(moduleSummaryTotals.profit)}
                    </span>
                  </div>
                </div>
                <div className={cn('rounded-xl border-2 p-4 shadow-sm', moduleSummaryTotals.profit >= 0 ? 'border-green-500/30 bg-green-50 dark:bg-green-950/20' : 'border-red-500/30 bg-red-50 dark:bg-red-950/20')}>
                  <p className='text-sm font-medium text-muted-foreground'>Total Profit</p>
                  <p className={cn('text-2xl font-bold', moduleSummaryTotals.profit >= 0 ? 'text-green-600' : 'text-red-600')}>
                    {fmt(moduleSummaryTotals.profit)}
                  </p>
                  <p className='mt-2 text-xs text-muted-foreground'>Across all modules combined</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  },
)

CompleteReport.displayName = 'CompleteReport'
