import { Fragment, forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { Link } from '@tanstack/react-router'
import { useSelector } from 'react-redux'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  ListOrdered,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronsDownUp,
  LayoutList,
  DollarSign,
  CreditCard,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  useGetActivitySummaryReportQuery,
  useGetSalesInvoiceDetailsQuery,
  useGetPurchaseInvoiceDetailsQuery,
  useGetSalesPurchaseSummaryReportQuery,
  type ActivitySummaryEntry,
  type SalesInvoiceDetail,
  type PurchaseInvoiceDetail,
  type ReportBatchAllocation,
} from '@/stores/reports.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import type { RootState } from '@/stores/store'
import { isCashBookBusiness } from '@/lib/business-types'
import { useLanguage } from '@/context/language-context'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { cn } from '@/lib/utils'
import { reportEntityName, reportEntityNameClass } from '../utils/report-entity-name'
import { expiryBadge } from '../utils/expiry-badge'
import LongText from '@/components/long-text'
import { formatImeiEntries } from '@/stores/imei.api'

interface LedgerReportProps {
  startDate: string
  endDate: string
}

// One line inside a ledger entry. Real sales/purchase invoices carry their normal
// item fields; every other module (load sale/purchase, and anything pulled in via
// "Include All Cash Activities") is folded into a single synthetic line, with `note`
// holding the extra context a real line item wouldn't have.
interface LedgerItem {
  name: string
  nameUrdu?: string
  quantity: number
  unitPrice: number
  subtotal: number
  discountAmount?: number
  imeis?: string[]
  variantLabel?: string | null
  batchNumber?: string | null
  batchAllocations?: ReportBatchAllocation[]
  expiryDate?: string | null
  note?: string
}

// One row of the ledger — a real sale invoice, a real purchase invoice, or another
// module's transaction reshaped to look like one, so the same table, expand/collapse
// and "Products Only" view work for all of them.
interface LedgerEntry {
  _id: string
  date: string
  module: string
  subType: string
  reference: string
  party: string
  partyPhone?: string
  paymentType: string
  status: string
  direction: 'in' | 'out'
  total: number
  paidAmount: number
  balance: number
  items: LedgerItem[]
}

interface LedgerRow extends LedgerEntry {
  signedAmount: number
  runningBalance: number
}

const salesEntryFromDetail = (inv: SalesInvoiceDetail): LedgerEntry => ({
  _id: inv._id,
  date: inv.invoiceDate,
  module: 'Sales',
  subType: inv.type === 'cash' ? 'Cash Sale' : `${inv.type} sale`,
  reference: inv.invoiceNumber,
  party: inv.customerName || 'Walk-in Customer',
  partyPhone: inv.customerPhone,
  paymentType: inv.type,
  status: inv.status,
  direction: 'in',
  total: inv.total,
  paidAmount: inv.paidAmount,
  balance: inv.balance,
  items: inv.items.map((item) => ({ ...item })),
})

const purchaseEntryFromDetail = (p: PurchaseInvoiceDetail): LedgerEntry => ({
  _id: p._id,
  date: p.purchaseDate,
  module: 'Purchases',
  subType: p.paymentType,
  reference: p.invoiceNumber,
  party: p.supplierName || 'Supplier',
  partyPhone: p.supplierPhone,
  paymentType: p.paymentType,
  status: p.status,
  direction: 'out',
  total: p.totalAmount,
  paidAmount: p.paidAmount,
  balance: p.balance,
  items: p.items.map((item) => ({ ...item })),
})

// Every other module (load sale/purchase, and — when "Include All Cash Activities"
// is on — sim sale, repairing, services, returns, payments, …) doesn't carry a real
// item list, so it's folded into one synthetic line per transaction.
const activityEntryToLedgerEntry = (entry: ActivitySummaryEntry): LedgerEntry => ({
  _id: entry.id,
  date: entry.date,
  module: entry.module === 'Load' ? entry.subType : entry.module,
  subType: entry.subType,
  reference: entry.reference || entry.subType,
  party: entry.party,
  partyPhone: entry.partyPhone,
  paymentType: entry.paymentType,
  status: entry.status,
  direction: entry.direction === 'in' ? 'in' : 'out',
  total: entry.totalAmount,
  paidAmount: entry.paidAmount,
  balance: entry.balance,
  items: [
    {
      name: entry.description || entry.subType,
      quantity: 1,
      unitPrice: entry.totalAmount,
      subtotal: entry.totalAmount,
      note: entry.details || undefined,
    },
  ],
})

// A line split across several batches only mirrors the *first* one onto batchNumber
// — show the real per-batch breakdown when it's present.
const formatBatchDisplay = (item: Pick<LedgerItem, 'batchNumber' | 'batchAllocations'>): string => {
  if (item.batchAllocations && item.batchAllocations.length > 1) {
    return item.batchAllocations.map((a) => `${a.batchNumber}×${a.quantity}`).join(', ')
  }
  return item.batchNumber || ''
}

// Computes each row's running balance in chronological order (oldest first), then
// hands back the rows newest-first — matching how every other table in this app
// lists its most recent activity at the top, while still reading top-to-bottom as
// "balance as of this transaction" like a bank statement.
//
// The balance moves by `paidAmount`, not `total`: a credit purchase/sale that hasn't
// been paid off yet hasn't actually moved any cash, so it shouldn't swing the balance
// by its full invoiced amount — only the portion actually paid/received should. The
// API already normalizes `paidAmount` per entry (full total for cash, the real amount
// for credit — 0 until something is paid), so this falls out of using that field.
const buildLedgerRows = (entries: LedgerEntry[]): LedgerRow[] => {
  const chronological = [...entries].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )
  let running = 0
  const withBalance = chronological.map((entry) => {
    const signedAmount = entry.direction === 'in' ? entry.paidAmount : -entry.paidAmount
    running += signedAmount
    return { ...entry, signedAmount, runningBalance: running }
  })
  return withBalance.reverse()
}

const moduleColors: Record<string, string> = {
  Sales: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Purchases: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'Load Sale': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  'Load Purchase': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  'Sales Returns': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  'Purchase Returns': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  'Sim Sale': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  Repairing: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  Services: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  'Bill Payments': 'bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300',
  Installments: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
  'Customer Payments': 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  'Supplier Payments': 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  'My Wallet': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  'Cash Management': 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
}

export const LedgerReport = forwardRef<{ exportToExcel: () => void }, LedgerReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t, language } = useLanguage()
    const [showAllActivities, setShowAllActivities] = useState(false)
    const [showProductsOnly, setShowProductsOnly] = useState(false)
    const [hideCredit, setHideCredit] = useState(true)
    const [searchQuery, setSearchQuery] = useState('')
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

    const user = useSelector((state: RootState) => state.auth.data?.user)
    const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
    const showCashBookFeatures = isCashBookBusiness(org?.businessType || user?.businessType)

    const { data: salesDetailData, isFetching: salesLoading } = useGetSalesInvoiceDetailsQuery({ startDate, endDate })
    const { data: purchaseDetailData, isFetching: purchaseLoading } = useGetPurchaseInvoiceDetailsQuery({ startDate, endDate })
    const { data: activityData, isFetching: activityLoading } = useGetActivitySummaryReportQuery({ startDate, endDate })
    const { data: summaryReportData } = useGetSalesPurchaseSummaryReportQuery(
      { startDate, endDate },
      { skip: !showCashBookFeatures }
    )

    const isLoading = salesLoading || purchaseLoading || activityLoading

    const fmt = (value: number) =>
      new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(value)

    // Real Sales/Purchase invoices (with actual item lists) plus every other module
    // reshaped into a synthetic single-line entry. Expenses are deliberately excluded
    // — this ledger tracks trading activity (sales vs purchases), not overhead.
    const mergedEntries = useMemo<LedgerEntry[]>(() => {
      const salesEntries = (salesDetailData?.invoices || []).map(salesEntryFromDetail)
      const purchaseEntries = (purchaseDetailData?.purchases || []).map(purchaseEntryFromDetail)
      const activityEntries = (activityData?.entries || [])
        .filter((e) => e.direction !== 'neutral')
        .filter((e) => e.module !== 'Sales' && e.module !== 'Purchases' && e.module !== 'Expenses')
        .filter((e) => showAllActivities || e.module === 'Load')
        .map(activityEntryToLedgerEntry)
      const all = [...salesEntries, ...purchaseEntries, ...activityEntries]
      // "On credit" here means the invoice/purchase itself is typed as credit — not
      // just an outstanding balance — so excluding it drops it (and whatever portion
      // of it has been paid so far) out of the list and the running balance below.
      return hideCredit ? all.filter((e) => e.paymentType?.trim().toLowerCase() !== 'credit') : all
    }, [salesDetailData, purchaseDetailData, activityData, showAllActivities, hideCredit])

    const ledgerRows = useMemo(() => buildLedgerRows(mergedEntries), [mergedEntries])

    const filteredRows = useMemo(() => {
      const q = searchQuery.trim().toLowerCase()
      if (!q) return ledgerRows
      return ledgerRows.filter((row) =>
        [row.reference, row.party, row.subType, row.module]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
    }, [ledgerRows, searchQuery])

    // Flatten entries into date-grouped product rows for the Products Only view.
    const productsByDate = useMemo(() => {
      if (filteredRows.length === 0) return []
      const dateMap = new Map<string, Array<{
        reference: string
        module: string
        direction: 'in' | 'out'
        productName: string
        productNameUrdu?: string
        quantity: number
        unitPrice: number
        subtotal: number
        discountAmount?: number
        imeis?: string[]
        variantLabel?: string | null
        batchNumber?: string | null
        batchAllocations?: ReportBatchAllocation[]
        expiryDate?: string | null
        note?: string
        runningBalance: number
      }>>()
      filteredRows.forEach((row) => {
        const dateStr = format(new Date(row.date), 'dd MMM yyyy')
        if (!dateMap.has(dateStr)) dateMap.set(dateStr, [])
        row.items.forEach((item) => {
          dateMap.get(dateStr)!.push({
            reference: row.reference,
            module: row.module,
            direction: row.direction,
            productName: item.name,
            productNameUrdu: item.nameUrdu,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
            discountAmount: item.discountAmount,
            imeis: item.imeis,
            variantLabel: item.variantLabel,
            batchNumber: item.batchNumber,
            batchAllocations: item.batchAllocations,
            expiryDate: item.expiryDate,
            note: item.note,
            runningBalance: row.runningBalance,
          })
        })
      })
      return Array.from(dateMap.entries()).map(([date, items]) => ({ date, items }))
    }, [filteredRows])

    const toggleRow = (id: string) => {
      setExpandedRows((prev) => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
      })
    }
    const allRowIds = useMemo(() => filteredRows.map((r) => r._id), [filteredRows])
    const allExpanded = allRowIds.length > 0 && allRowIds.every((id) => expandedRows.has(id))
    const toggleAll = () => setExpandedRows(allExpanded ? new Set() : new Set(allRowIds))

    const summary = useMemo(() => {
      // Cash-basis, matching the table's Amount/Running Balance columns below — unpaid
      // credit is tracked separately via each row's outstanding balance, not counted here.
      const totalSales = filteredRows.filter((r) => r.direction === 'in').reduce((s, r) => s + r.paidAmount, 0)
      const totalPurchases = filteredRows.filter((r) => r.direction === 'out').reduce((s, r) => s + r.paidAmount, 0)
      return {
        totalSales,
        totalPurchases,
        netRemaining: totalSales - totalPurchases,
        count: filteredRows.length,
        totalItems: filteredRows.reduce((s, r) => s + r.items.reduce((s2, i) => s2 + i.quantity, 0), 0),
      }
    }, [filteredRows])

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (filteredRows.length === 0) {
            toast.error(t('No data available to export'))
            return
          }
          const wb = XLSX.utils.book_new()

          const summarySheet = XLSX.utils.json_to_sheet([
            { Metric: 'Period Start', Value: startDate },
            { Metric: 'Period End', Value: endDate },
            { Metric: 'Total Sales (+)', Value: summary.totalSales },
            { Metric: 'Total Purchases (-)', Value: summary.totalPurchases },
            { Metric: 'Total Remaining Amount', Value: summary.netRemaining },
            { Metric: 'Transactions', Value: summary.count },
            { Metric: 'Credit Excluded', Value: hideCredit ? 'Yes' : 'No' },
            ...(showCashBookFeatures ? [{ Metric: 'Cash in Hand (today)', Value: summaryReportData?.summary.cashInHand ?? 0 }] : []),
          ])
          XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')

          const ledgerSheet = XLSX.utils.json_to_sheet(
            filteredRows.map((row) => ({
              Date: format(new Date(row.date), 'yyyy-MM-dd HH:mm'),
              Module: row.module,
              Type: row.subType,
              Reference: row.reference,
              Party: row.party,
              'Payment Type': row.paymentType,
              'Sale (+) / Purchase (-)': row.signedAmount,
              'Running Balance': row.runningBalance,
              Paid: row.paidAmount,
              Outstanding: row.balance,
              Status: row.status,
            }))
          )
          XLSX.utils.book_append_sheet(wb, ledgerSheet, 'Ledger')

          const itemRows: object[] = []
          productsByDate.forEach(({ date, items }) => {
            items.forEach((item) => {
              itemRows.push({
                Date: date,
                Module: item.module,
                Reference: item.reference,
                Product: reportEntityName(language, item.productName, item.productNameUrdu),
                Variant: item.variantLabel || '',
                'Batch #': formatBatchDisplay(item),
                Expiry: item.expiryDate ? format(new Date(item.expiryDate), 'yyyy-MM-dd') : '',
                Qty: item.quantity,
                'Unit Price': item.unitPrice,
                Subtotal: item.direction === 'in' ? item.subtotal : -item.subtotal,
                Balance: item.runningBalance,
              })
            })
          })
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows), 'Products')

          XLSX.writeFile(wb, `sales-purchase-ledger-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch (error) {
          console.error('Export error:', error)
          toast.error(t('Failed to export data'))
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
        {/* KPI Cards */}
        <div className={cn('grid gap-4 md:grid-cols-2', showCashBookFeatures ? 'lg:grid-cols-5' : 'lg:grid-cols-4')}>
          <Card className={kpiCardClass('emerald')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Sales</CardTitle>
              <div className={toneIconWrapClass('emerald')}>
                <ArrowDownLeft className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-green-600'>+{fmt(summary.totalSales)}</div>
              <p className='text-xs text-muted-foreground'>Sales invoices{showAllActivities ? '' : ' + load sale'}</p>
            </CardContent>
          </Card>

          <Card className={kpiCardClass('rose')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Purchases</CardTitle>
              <div className={toneIconWrapClass('rose')}>
                <ArrowUpRight className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-red-600'>-{fmt(summary.totalPurchases)}</div>
              <p className='text-xs text-muted-foreground'>Product purchases{showAllActivities ? '' : ' + load purchase'}</p>
            </CardContent>
          </Card>

          <Card className={kpiCardClass(summary.netRemaining >= 0 ? 'violet' : 'amber')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Remaining Amount</CardTitle>
              <div className={toneIconWrapClass(summary.netRemaining >= 0 ? 'violet' : 'amber')}>
                <Scale className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className={cn('text-2xl font-bold', summary.netRemaining >= 0 ? 'text-violet-600' : 'text-amber-600')}>
                {summary.netRemaining >= 0 ? '+' : '-'}{fmt(Math.abs(summary.netRemaining))}
              </div>
              <p className='text-xs text-muted-foreground'>Sales minus purchases for the period</p>
            </CardContent>
          </Card>

          <Card className={kpiCardClass('sky')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Transactions</CardTitle>
              <div className={toneIconWrapClass('sky')}>
                <ListOrdered className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{summary.count}</div>
              <p className='text-xs text-muted-foreground'>{summary.totalItems} items across all entries</p>
            </CardContent>
          </Card>

          {showCashBookFeatures && (
            <Link to='/cash-book' className='block'>
              <Card className={cn(kpiCardClass('emerald'), 'h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md')}>
                <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                  <CardTitle className='text-sm font-medium'>Cash in Hand</CardTitle>
                  <div className={toneIconWrapClass('emerald')}>
                    <DollarSign className='h-4 w-4' />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold text-emerald-600'>{fmt(summaryReportData?.summary.cashInHand ?? 0)}</div>
                  <p className='text-xs text-muted-foreground'>Available cash after expenses, as of today</p>
                </CardContent>
              </Card>
            </Link>
          )}
        </div>

        {/* Ledger Table */}
        <Card className='min-w-0'>
          <CardHeader>
            <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between'>
              <div>
                <CardTitle>Sale &amp; Purchase Report</CardTitle>
                <CardDescription>
                  Every sale and purchase (including load) in the selected period, sales shown as +, purchases as −, with a running balance — click a row to see individual items
                  {hideCredit && ' (credit sales/purchases are hidden)'}
                </CardDescription>
              </div>
              <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
                <div className='relative'>
                  <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
                  <Input
                    placeholder='Search reference, party...'
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className='pl-8 w-full sm:w-[200px]'
                  />
                </div>
                <Button
                  variant={showAllActivities ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => setShowAllActivities((v) => !v)}
                >
                  {showAllActivities ? 'Sales & Purchases Only' : 'Include All Cash Activities'}
                </Button>
                <Button
                  variant={hideCredit ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => setHideCredit((v) => !v)}
                  title='Credit sales/purchases (and their running balance) are excluded while this is on'
                >
                  <CreditCard className='h-4 w-4 mr-1.5' />
                  {hideCredit ? 'Credit Hidden' : 'Show Credit'}
                </Button>
                {filteredRows.length > 0 && (
                  <Button
                    variant={showProductsOnly ? 'default' : 'outline'}
                    size='sm'
                    onClick={() => setShowProductsOnly((v) => !v)}
                  >
                    <LayoutList className='h-4 w-4 mr-1.5' />
                    {showProductsOnly ? 'Entry View' : 'Products Only'}
                  </Button>
                )}
                {!showProductsOnly && filteredRows.length > 0 && (
                  <Button variant='outline' size='sm' onClick={toggleAll}>
                    {allExpanded ? (
                      <>
                        <ChevronsDownUp className='h-4 w-4 mr-1.5' />
                        Collapse All
                      </>
                    ) : (
                      <>
                        <ChevronsUpDown className='h-4 w-4 mr-1.5' />
                        Expand All
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className='p-0'>
            {filteredRows.length === 0 ? (
              <p className='text-center text-muted-foreground py-10'>No sales or purchases found for the selected period</p>
            ) : showProductsOnly ? (
              /* ── Products Only View ──────────────────────────────────────── */
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow className='bg-muted/50'>
                      <TableHead>Date</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Module</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead>Batch #</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className='text-right'>Qty</TableHead>
                      <TableHead className='text-right'>Unit Price</TableHead>
                      <TableHead className='text-right'>Subtotal</TableHead>
                      <TableHead className='text-right'>Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productsByDate.map(({ date, items }) => (
                      <Fragment key={`date-group-${date}`}>
                        <TableRow className='bg-muted/40 border-t'>
                          <TableCell colSpan={11} className='py-2 px-4 font-semibold text-sm text-foreground'>
                            {date}
                          </TableCell>
                        </TableRow>
                        {items.map((row, idx) => (
                          <TableRow key={`${date}-${idx}`} className='hover:bg-muted/30 transition-colors'>
                            <TableCell className='text-sm text-muted-foreground pl-6' />
                            <TableCell className='font-mono text-xs text-primary'>{row.reference}</TableCell>
                            <TableCell>
                              <Badge variant='secondary' className={cn('text-xs whitespace-nowrap', moduleColors[row.module])}>
                                {row.module}
                              </Badge>
                            </TableCell>
                            <TableCell
                              className={cn(
                                'font-medium',
                                reportEntityNameClass(language, reportEntityName(language, row.productName, row.productNameUrdu))
                              )}
                            >
                              {reportEntityName(language, row.productName, row.productNameUrdu)}
                              {row.imeis && row.imeis.length > 0 && (
                                <div className='text-xs font-normal text-muted-foreground'>
                                  IMEI/Serial: {formatImeiEntries(row.imeis)}
                                </div>
                              )}
                              {row.note && (
                                <div className='text-xs font-normal text-muted-foreground'>{row.note}</div>
                              )}
                            </TableCell>
                            <TableCell className='text-sm text-muted-foreground'>{row.variantLabel || '—'}</TableCell>
                            <TableCell className='font-mono text-xs text-muted-foreground'>
                              {formatBatchDisplay(row) || '—'}
                            </TableCell>
                            <TableCell>{expiryBadge(row.expiryDate)}</TableCell>
                            <TableCell className='text-right text-sm'>{row.quantity}</TableCell>
                            <TableCell className='text-right text-sm'>{fmt(row.unitPrice)}</TableCell>
                            <TableCell className='text-right font-semibold whitespace-nowrap'>
                              <span className={row.direction === 'in' ? 'text-green-600' : 'text-red-600'}>
                                {row.direction === 'in' ? '+' : '−'}{fmt(row.subtotal)}
                              </span>
                            </TableCell>
                            <TableCell className='text-right font-medium whitespace-nowrap'>
                              <span className={row.runningBalance >= 0 ? 'text-foreground' : 'text-red-600'}>
                                {row.runningBalance >= 0 ? '+' : '−'}{fmt(Math.abs(row.runningBalance))}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className='bg-muted font-bold border-t-2'>
                      <TableCell colSpan={7} className='text-sm uppercase tracking-wide'>
                        Total — {summary.count} {summary.count === 1 ? 'entry' : 'entries'}
                      </TableCell>
                      <TableCell className='text-right'>{summary.totalItems} items</TableCell>
                      <TableCell />
                      <TableCell className='text-right text-lg whitespace-nowrap'>
                        <span className={summary.netRemaining >= 0 ? 'text-primary' : 'text-red-600'}>
                          {summary.netRemaining >= 0 ? '+' : '−'}{fmt(Math.abs(summary.netRemaining))}
                        </span>
                      </TableCell>
                      <TableCell className='text-right whitespace-nowrap'>
                        <span className={(ledgerRows[0]?.runningBalance ?? 0) >= 0 ? 'text-foreground' : 'text-red-600'}>
                          {(ledgerRows[0]?.runningBalance ?? 0) >= 0 ? '+' : '−'}{fmt(Math.abs(ledgerRows[0]?.runningBalance ?? 0))}
                        </span>
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            ) : (
              /* ── Entry View (expandable) ─────────────────────────────────── */
              <div className='overflow-x-auto'>
                <Table className='w-max min-w-full table-auto'>
                  <TableHeader>
                    <TableRow className='bg-muted/50'>
                      <TableHead className='w-8' />
                      <TableHead className='whitespace-nowrap'>Date</TableHead>
                      <TableHead className='whitespace-nowrap'>Module</TableHead>
                      <TableHead className='whitespace-nowrap'>Reference</TableHead>
                      <TableHead className='whitespace-nowrap'>Party</TableHead>
                      <TableHead className='whitespace-nowrap'>Payment</TableHead>
                      <TableHead className='whitespace-nowrap text-right'>Amount</TableHead>
                      <TableHead className='whitespace-nowrap text-right'>Running Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.map((row) => {
                      const isOpen = expandedRows.has(row._id)
                      return (
                        <Fragment key={`${row.module}-${row._id}`}>
                          <TableRow className='cursor-pointer hover:bg-muted/40 transition-colors' onClick={() => toggleRow(row._id)}>
                            <TableCell className='pl-4'>
                              <Button variant='ghost' size='icon' className='h-6 w-6 p-0'>
                                {isOpen ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}
                              </Button>
                            </TableCell>
                            <TableCell className='whitespace-nowrap text-sm'>
                              {format(new Date(row.date), 'dd MMM yyyy')}
                              <div className='text-xs text-muted-foreground'>{format(new Date(row.date), 'hh:mm a')}</div>
                            </TableCell>
                            <TableCell>
                              <Badge variant='secondary' className={cn('text-xs whitespace-nowrap', moduleColors[row.module])}>
                                {row.module}
                              </Badge>
                              <div className='text-xs text-muted-foreground mt-0.5'>{row.subType}</div>
                            </TableCell>
                            <TableCell className='text-sm font-mono'>{row.reference || '—'}</TableCell>
                            <TableCell>
                              <div className='text-sm font-medium'>{row.party}</div>
                              {row.partyPhone && <div className='text-xs text-muted-foreground'>{row.partyPhone}</div>}
                            </TableCell>
                            <TableCell className='text-sm whitespace-nowrap'>{row.paymentType}</TableCell>
                            <TableCell className='text-right font-semibold whitespace-nowrap'>
                              <span className={row.direction === 'in' ? 'text-green-600' : 'text-red-600'}>
                                {row.direction === 'in' ? '+' : '−'}{fmt(Math.abs(row.signedAmount))}
                              </span>
                              {row.balance > 0 && (
                                <div className='text-xs font-normal text-amber-600'>{fmt(row.balance)} outstanding</div>
                              )}
                            </TableCell>
                            <TableCell className='text-right font-bold whitespace-nowrap'>
                              <span className={row.runningBalance >= 0 ? 'text-foreground' : 'text-red-600'}>
                                {row.runningBalance >= 0 ? '+' : '−'}{fmt(Math.abs(row.runningBalance))}
                              </span>
                            </TableCell>
                          </TableRow>

                          {isOpen && row.items.map((item, idx) => (
                            <TableRow key={`${row._id}-item-${idx}`} className='bg-muted/20 hover:bg-muted/30'>
                              <TableCell />
                              <TableCell colSpan={3} className='pl-10 text-sm text-muted-foreground py-2'>
                                <LongText
                                  className={cn(
                                    'font-medium text-foreground max-w-[240px]',
                                    reportEntityNameClass(language, reportEntityName(language, item.name, item.nameUrdu))
                                  )}
                                >
                                  {reportEntityName(language, item.name, item.nameUrdu)}
                                </LongText>
                                {item.imeis && item.imeis.length > 0 && (
                                  <span className='block text-xs text-muted-foreground'>
                                    IMEI/Serial: {formatImeiEntries(item.imeis)}
                                  </span>
                                )}
                                {item.note && <span className='block text-xs text-muted-foreground'>{item.note}</span>}
                                {(item.variantLabel || item.batchNumber || item.expiryDate) && (
                                  <span className='mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
                                    {item.variantLabel && <span>{item.variantLabel}</span>}
                                    {formatBatchDisplay(item) && <span className='font-mono'>{formatBatchDisplay(item)}</span>}
                                    {item.expiryDate && expiryBadge(item.expiryDate)}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell />
                              <TableCell className='text-right text-sm py-2 text-muted-foreground whitespace-nowrap'>
                                {item.quantity} × {fmt(item.unitPrice)}
                              </TableCell>
                              <TableCell className='text-right font-medium py-2 whitespace-nowrap' colSpan={2}>
                                <span className={row.direction === 'in' ? 'text-green-600' : 'text-red-600'}>
                                  {row.direction === 'in' ? '+' : '−'}{fmt(item.subtotal)}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </Fragment>
                      )
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow className='bg-muted font-bold border-t-2'>
                      <TableCell colSpan={6} className='text-sm uppercase tracking-wide'>
                        Total — {filteredRows.length} {filteredRows.length === 1 ? 'entry' : 'entries'}
                      </TableCell>
                      <TableCell className='text-right whitespace-nowrap'>
                        <span className='text-green-600'>+{fmt(summary.totalSales)}</span>
                        {' / '}
                        <span className='text-red-600'>−{fmt(summary.totalPurchases)}</span>
                      </TableCell>
                      <TableCell className='text-right text-lg whitespace-nowrap'>
                        <span className={summary.netRemaining >= 0 ? 'text-primary' : 'text-red-600'}>
                          {summary.netRemaining >= 0 ? '+' : '−'}{fmt(Math.abs(summary.netRemaining))}
                        </span>
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }
)

LedgerReport.displayName = 'LedgerReport'
