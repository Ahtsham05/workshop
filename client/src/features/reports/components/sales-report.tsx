import { useState, useCallback, useMemo, Fragment } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  useGetSalesReportQuery,
  useGetSalesInvoiceDetailsQuery,
  useGetActivitySummaryReportQuery,
  SalesInvoiceDetail,
  SalesInvoiceItem,
  ActivitySummaryEntry,
} from '@/stores/reports.api'
import { useGetAgentBillReportQuery, AgentBillRecord } from '@/stores/mobile-shop.api'
import { AGENT_BILL_EMAIL } from '../../mobile-shop/bill-payments'
import { useLanguage } from '@/context/language-context'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { TrendingUp, DollarSign, ShoppingCart, Package, ChevronDown, ChevronRight, Eye, LayoutList } from 'lucide-react'
import { forwardRef, useImperativeHandle } from 'react'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { reportEntityName, reportEntityNameClass } from '../utils/report-entity-name'
import { expiryBadge } from '../utils/expiry-badge'
import LongText from '@/components/long-text'
import { formatImeiEntries, type ImeiEntryInput } from '@/stores/imei.api'

interface SalesReportProps {
  startDate: string
  endDate: string
  // When the organization is a mobile shop, the Invoice Details table below also
  // merges in every other sale module (load, sim sale, repair, services, bill
  // payments, installments, agent bills) so it reads as one unified sales ledger
  // instead of just product invoices.
  isMobileShop?: boolean
}

// A single line inside a unified invoice row. Real sales invoices carry their
// normal item fields; every other module (load, sim sale, repair, …) is folded
// into one synthetic line per transaction, with `note` holding the extra context
// (wallet, technician, bill breakdown, …) that a real line item wouldn't have.
interface UnifiedInvoiceItem {
  name: string
  nameUrdu?: string
  quantity: number
  unitPrice: number
  subtotal: number
  discountAmount?: number
  imeis?: SalesInvoiceItem['imeis']
  variantLabel?: string | null
  batchNumber?: string | null
  batchAllocations?: SalesInvoiceItem['batchAllocations']
  expiryDate?: string | null
  note?: string
}

// One row of the merged Invoice Details table — either a real sales invoice
// (module: 'Sales') or another sale module's transaction reshaped to look like one,
// so the same table, expand/collapse, and "Invoice View" dialog work for all of them.
interface UnifiedInvoiceRow {
  _id: string
  invoiceNumber: string
  invoiceDate: string
  customerName?: string
  customerNameUrdu?: string
  customerPhone?: string
  type: string
  status: string
  total: number
  paidAmount: number
  balance: number
  discount?: number
  module: string
  items: UnifiedInvoiceItem[]
}

// Modules from the Activity Summary feed that count as "sale modules" for a mobile
// shop — everything else (Purchases, Expenses, customer/supplier ledger payments…)
// stays out of a sales ledger.
const SALE_MODULE_NAMES = new Set([
  'Load', 'Sim Sale', 'Repairing', 'Services', 'Bill Payments', 'Installments',
])

const salesRowFromDetail = (inv: SalesInvoiceDetail): UnifiedInvoiceRow => ({
  _id: inv._id,
  invoiceNumber: inv.invoiceNumber,
  invoiceDate: inv.invoiceDate,
  customerName: inv.customerName,
  customerNameUrdu: inv.customerNameUrdu,
  customerPhone: inv.customerPhone,
  type: inv.type,
  status: inv.status,
  total: inv.total,
  paidAmount: inv.paidAmount,
  balance: inv.balance,
  discount: inv.discount,
  module: 'Sales',
  items: inv.items,
})

const activityEntryToRow = (entry: ActivitySummaryEntry): UnifiedInvoiceRow => {
  // For Services, lead with the service name(s) and push the invoice reference to the
  // note line instead — the invoice number isn't what a reader scans for here.
  const isServices = entry.module === 'Services'
  return {
    _id: entry.id,
    invoiceNumber: entry.reference || entry.subType,
    invoiceDate: entry.date,
    customerName: entry.party,
    customerPhone: entry.partyPhone,
    type: entry.subType,
    status: entry.status,
    total: entry.totalAmount,
    paidAmount: entry.paidAmount,
    balance: entry.balance,
    module: entry.module,
    items: [
      {
        name: isServices ? (entry.details || entry.description) : entry.description,
        quantity: 1,
        unitPrice: entry.totalAmount,
        subtotal: entry.totalAmount,
        note: (isServices ? entry.description : entry.details) || undefined,
      },
    ],
  }
}

const agentBillToRow = (bill: AgentBillRecord): UnifiedInvoiceRow => ({
  _id: bill.id,
  invoiceNumber: bill.referenceNumber,
  invoiceDate: bill.collectionDate || bill.createdAt,
  customerName: bill.customerName,
  customerPhone: bill.mobileNo,
  type: 'Agent Bill',
  status: bill.isPaid ? 'paid' : 'pending',
  total: bill.totalAmount,
  paidAmount: bill.isPaid ? bill.totalAmount : 0,
  balance: bill.isPaid ? 0 : bill.totalAmount,
  module: 'Agent Bills',
  items: [
    {
      name: bill.companyName || 'Agent Bill',
      quantity: 1,
      unitPrice: bill.currentBillAmount,
      subtotal: bill.totalAmount,
      note: bill.overdueAmount > 0 ? `Overdue carried forward: ${bill.overdueAmount}` : undefined,
    },
  ],
})

// A line split across several batches only mirrors the *first* one onto batchNumber
// (see invoice.model.js) — show the real per-batch breakdown when it's present, instead
// of attributing the whole line's quantity to a single batch.
const formatBatchDisplay = (item: Pick<SalesInvoiceItem, 'batchNumber' | 'batchAllocations'>): string => {
  if (item.batchAllocations && item.batchAllocations.length > 1) {
    return item.batchAllocations.map((a) => `${a.batchNumber}×${a.quantity}`).join(', ')
  }
  return item.batchNumber || ''
}

const statusColors: Record<string, string> = {
  paid:        'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  unpaid:      'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
  finalized:   'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  draft:       'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  refunded:    'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  completed:   'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  pending:     'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  delivered:   'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
  overdue:     'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  partial:     'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
}

const typeColors: Record<string, string> = {
  cash:    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  credit:  'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
}

// One color per module so the merged Invoice Details table stays scannable —
// "Sales" is the default ledger, the rest are every other mobile-shop sale module.
const moduleColors: Record<string, string> = {
  'Sales':         'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  'Load':          'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  'Sim Sale':      'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
  'Repairing':     'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  'Services':      'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  'Bill Payments':   'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  'Installments':    'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
  'Agent Bills':     'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300',
}

export const SalesReport = forwardRef<{ exportToExcel: () => void }, SalesReportProps>(
  ({ startDate, endDate, isMobileShop = false }, ref) => {
    const { t, language } = useLanguage()
    const { data, isFetching: isLoading } = useGetSalesReportQuery({ startDate, endDate, groupBy: 'day' })
    const { data: detailData, isFetching: detailLoading } = useGetSalesInvoiceDetailsQuery({ startDate, endDate })

    const user = useSelector((state: RootState) => state.auth.data?.user)
    const isAgentBillUser = user?.email === AGENT_BILL_EMAIL
    const { data: activityData, isFetching: activityLoading } = useGetActivitySummaryReportQuery(
      { startDate, endDate },
      { skip: !isMobileShop }
    )
    const { data: agentBillData, isFetching: agentBillLoading } = useGetAgentBillReportQuery(
      { startDate, endDate },
      { skip: !isMobileShop || !isAgentBillUser }
    )

    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
    const [viewInvoice, setViewInvoice] = useState<UnifiedInvoiceRow | null>(null)
    const [showProductsOnly, setShowProductsOnly] = useState(false)

    // Merge real sales invoices with every other mobile-shop sale module into one
    // unified ledger — see UnifiedInvoiceRow. For non-mobile-shop businesses this is
    // just the sales invoices, unchanged.
    const mergedInvoices = useMemo<UnifiedInvoiceRow[]>(() => {
      const salesRows = (detailData?.invoices || []).map(salesRowFromDetail)
      const moduleRows = isMobileShop
        ? (activityData?.entries || [])
            .filter((entry) => SALE_MODULE_NAMES.has(entry.module) && entry.subType !== 'Load Purchase')
            .map(activityEntryToRow)
        : []
      const agentBillRows = isMobileShop && isAgentBillUser
        ? (agentBillData?.bills || []).map(agentBillToRow)
        : []
      return [...salesRows, ...moduleRows, ...agentBillRows].sort(
        (a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime()
      )
    }, [detailData, activityData, agentBillData, isMobileShop, isAgentBillUser])

    const mergedSummary = useMemo(
      () => ({
        totalInvoices: mergedInvoices.length,
        totalItems: mergedInvoices.reduce((s, r) => s + r.items.reduce((s2, i) => s2 + i.quantity, 0), 0),
        totalSales: mergedInvoices.reduce((s, r) => s + r.total, 0),
      }),
      [mergedInvoices]
    )

    const detailsLoading = detailLoading || (isMobileShop && (activityLoading || (isAgentBillUser && agentBillLoading)))

    // Flatten invoices into date-grouped product rows for the Products Only view
    const productsByDate = useMemo(() => {
      if (mergedInvoices.length === 0) return []
      const dateMap = new Map<string, Array<{
        invoiceNumber: string
        module: string
        productName: string
        productNameUrdu?: string
        quantity: number
        unitPrice: number
        subtotal: number
        discountAmount?: number
        imeis?: ImeiEntryInput[]
        variantLabel?: string | null
        batchNumber?: string | null
        batchAllocations?: SalesInvoiceItem['batchAllocations']
        expiryDate?: string | null
        note?: string
      }>>()
      mergedInvoices.forEach((inv) => {
        const dateStr = format(new Date(inv.invoiceDate), 'dd MMM yyyy')
        if (!dateMap.has(dateStr)) dateMap.set(dateStr, [])
        inv.items.forEach((item) => {
          dateMap.get(dateStr)!.push({
            invoiceNumber: inv.invoiceNumber,
            module: inv.module,
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
          })
        })
      })
      return Array.from(dateMap.entries()).map(([date, items]) => ({ date, items }))
    }, [mergedInvoices])

    const toggleRow = useCallback((id: string) => {
      setExpandedRows((prev) => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
      })
    }, [])

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          const wb = XLSX.utils.book_new()

          // Sheet 1 — daily summary
          if (data?.data && data.data.length > 0) {
            const summarySheet = XLSX.utils.json_to_sheet(
              data.data.map((row) => ({
                [t('date')]:     row._id,
                [t('invoices')]: row.invoiceCount,
                [t('sales')]:    row.totalSales,
                [t('cost')]:     row.totalCost,
                [t('profit')]:   row.totalProfit,
                [t('margin')]:   row.totalSales > 0
                  ? `${((row.totalProfit / row.totalSales) * 100).toFixed(2)}%`
                  : '0%',
              })),
            )
            XLSX.utils.book_append_sheet(wb, summarySheet, 'Daily Summary')
          }

          // Sheet 2 — invoice details (merged across every sale module for mobile shops)
          if (mergedInvoices.length > 0) {
            const rows: object[] = []
            mergedInvoices.forEach((inv) => {
              inv.items.forEach((item, idx) => {
                rows.push({
                  ...(isMobileShop ? { Module: idx === 0 ? inv.module : '' } : {}),
                  'Invoice #':    idx === 0 ? inv.invoiceNumber : '',
                  Date:           idx === 0 ? format(new Date(inv.invoiceDate), 'yyyy-MM-dd') : '',
                  Customer:       idx === 0 ? reportEntityName(language, inv.customerName || '', inv.customerNameUrdu) : '',
                  'Cust. Phone':  idx === 0 ? (inv.customerPhone || '') : '',
                  Type:           idx === 0 ? inv.type : '',
                  Status:         idx === 0 ? inv.status : '',
                  'Invoice Total': idx === 0 ? inv.total : '',
                  'Invoice Discount': idx === 0 ? (inv.discount || 0) : '',
                  'Paid Amount':  idx === 0 ? inv.paidAmount : '',
                  Balance:        idx === 0 ? inv.balance : '',
                  Product:        reportEntityName(language, item.name, item.nameUrdu),
                  Variant:        item.variantLabel || '',
                  'Batch #':      formatBatchDisplay(item),
                  Expiry:         item.expiryDate ? format(new Date(item.expiryDate), 'yyyy-MM-dd') : '',
                  Qty:            item.quantity,
                  'Unit Sale Price':   item.unitPrice,
                  'Item Discount': item.discountAmount || 0,
                  Subtotal:       item.subtotal,
                  ...(item.note ? { Notes: item.note } : {}),
                })
              })
            })
            // Totals row
            rows.push({
              ...(isMobileShop ? { Module: '' } : {}),
              'Invoice #':    'TOTAL',
              Date:           '',
              Customer:       `${mergedSummary.totalInvoices} invoices`,
              'Cust. Phone':  '',
              Type:           '',
              Status:         '',
              'Invoice Total': mergedSummary.totalSales,
              'Invoice Discount': '',
              'Paid Amount':  '',
              Balance:        '',
              Product:        '',
              Variant:        '',
              'Batch #':      '',
              Expiry:         '',
              Qty:            mergedSummary.totalItems,
              'Unit Sale Price':   '',
              'Item Discount': '',
              Subtotal:       mergedSummary.totalSales,
            })
            const detailSheet = XLSX.utils.json_to_sheet(rows)
            XLSX.utils.book_append_sheet(wb, detailSheet, 'Invoice Details')
          }

          if (wb.SheetNames.length === 0) {
            toast.error(t('No data available to export'))
            return
          }

          XLSX.writeFile(wb, `sales-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch (error) {
          console.error('Export error:', error)
          toast.error(t('Failed to export data'))
        }
      },
    }), [data, mergedInvoices, mergedSummary, isMobileShop, t, language])

    const formatCurrency = (value: number) =>
      new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(value)

    if (isLoading) {
      return (
        <div className='space-y-4'>
          <Skeleton className='h-[200px] w-full' />
          <Skeleton className='h-[400px] w-full' />
        </div>
      )
    }

    return (
      <div className='space-y-6'>
        {/* ── Summary Cards ────────────────────────────────────────────────── */}
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          <Card className={kpiCardClass('emerald')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('total_revenue')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('emerald'))}>
                <DollarSign className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {formatCurrency(data?.summary?.totalRevenue || 0)}
              </div>
            </CardContent>
          </Card>

          <Card className={kpiCardClass('emerald')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('total_profit')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('emerald'))}>
                <TrendingUp className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {formatCurrency(data?.summary?.totalProfit || 0)}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                {t('margin')}:{' '}
                {data?.summary?.totalRevenue
                  ? ((data.summary.totalProfit / data.summary.totalRevenue) * 100).toFixed(2)
                  : 0}
                %
              </p>
            </CardContent>
          </Card>

          <Card className={kpiCardClass('sky')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('total_invoices')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('sky'))}>
                <ShoppingCart className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{data?.summary?.totalInvoices || 0}</div>
            </CardContent>
          </Card>

          <Card className={kpiCardClass('violet')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('avg_invoice_value')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('violet'))}>
                <Package className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {formatCurrency(data?.summary?.avgInvoiceValue || 0)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Sales Chart ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>{t('sales_trend')}</CardTitle>
            <CardDescription>{t('daily_sales_and_profit')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width='100%' height={400}>
              <BarChart data={data?.data || []}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis dataKey='_id' />
                <YAxis />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
                <Bar dataKey='totalSales' fill='#3b82f6' name={t('sales')} />
                <Bar dataKey='totalProfit' fill='#10b981' name={t('profit')} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* ── Daily Summary Table ───────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>{t('detailed_sales_data')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('date')}</TableHead>
                  <TableHead className='text-right'>{t('invoices')}</TableHead>
                  <TableHead className='text-right'>{t('sales')}</TableHead>
                  <TableHead className='text-right'>{t('cost')}</TableHead>
                  <TableHead className='text-right'>{t('profit')}</TableHead>
                  <TableHead className='text-right'>{t('margin')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data?.map((row, index) => (
                  <TableRow key={index}>
                    <TableCell>{row._id}</TableCell>
                    <TableCell className='text-right'>{row.invoiceCount}</TableCell>
                    <TableCell className='text-right'>{formatCurrency(row.totalSales)}</TableCell>
                    <TableCell className='text-right'>{formatCurrency(row.totalCost)}</TableCell>
                    <TableCell className='text-right text-green-600'>
                      {formatCurrency(row.totalProfit)}
                    </TableCell>
                    <TableCell className='text-right'>
                      {row.totalSales > 0
                        ? ((row.totalProfit / row.totalSales) * 100).toFixed(2)
                        : 0}
                      %
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* ── Invoice Details Table ─────────────────────────────────────────── */}
        <Card>
          <CardHeader className='flex flex-row items-start justify-between gap-4'>
            <div>
              <CardTitle>Invoice Details</CardTitle>
              <CardDescription>
                {isMobileShop
                  ? 'Every sale invoice, load sale/purchase, sim sale, repair, service, bill payment, installment, cash management send/receive and agent bill in the selected period — click a row to see individual items'
                  : 'All invoices in the selected period — click a row to see individual items'}
              </CardDescription>
            </div>
            {mergedInvoices.length ? (
              <div className='flex items-center gap-2 shrink-0 mt-1'>
                <Button
                  variant={showProductsOnly ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => setShowProductsOnly((v) => !v)}
                >
                  <LayoutList className='h-4 w-4 mr-1.5' />
                  {showProductsOnly ? 'Invoice View' : 'Products Only'}
                </Button>

                {!showProductsOnly && (
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      const allIds = mergedInvoices.map((inv) => inv._id)
                      const allOpen = allIds.every((id) => expandedRows.has(id))
                      setExpandedRows(allOpen ? new Set() : new Set(allIds))
                    }}
                  >
                    {mergedInvoices.every((inv) => expandedRows.has(inv._id)) ? (
                      <>
                        <ChevronDown className='h-4 w-4 mr-1.5' />
                        Collapse All
                      </>
                    ) : (
                      <>
                        <ChevronRight className='h-4 w-4 mr-1.5' />
                        Expand All
                      </>
                    )}
                  </Button>
                )}
              </div>
            ) : null}
          </CardHeader>
          <CardContent className='p-0'>
            {detailsLoading ? (
              <div className='space-y-2 p-6'>
                {[1, 2, 3].map((i) => <Skeleton key={i} className='h-10 w-full' />)}
              </div>
            ) : !mergedInvoices.length ? (
              <p className='text-center text-muted-foreground py-10'>No invoices found</p>
            ) : showProductsOnly ? (
              /* ── Products Only View ────────────────────────────────────────── */
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow className='bg-muted/50'>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice #</TableHead>
                      {isMobileShop && <TableHead>Module</TableHead>}
                      <TableHead>Product</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead>Batch #</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className='text-right'>Qty</TableHead>
                      <TableHead className='text-right'>Unit Sale Price</TableHead>
                      <TableHead className='text-right'>Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productsByDate.map(({ date, items }) => (
                      <Fragment key={`date-group-${date}`}>
                        {/* Date group header */}
                        <TableRow className='bg-muted/40 border-t'>
                          <TableCell
                            colSpan={isMobileShop ? 10 : 9}
                            className='py-2 px-4 font-semibold text-sm text-foreground'
                          >
                            {date}
                          </TableCell>
                        </TableRow>

                        {/* One row per product */}
                        {items.map((row, idx) => (
                          <TableRow
                            key={`${date}-${idx}`}
                            className='hover:bg-muted/30 transition-colors'
                          >
                            <TableCell className='text-sm text-muted-foreground pl-6' />
                            <TableCell className='font-mono text-xs text-primary'>
                              {row.invoiceNumber}
                            </TableCell>
                            {isMobileShop && (
                              <TableCell>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${moduleColors[row.module] ?? ''}`}>
                                  {row.module}
                                </span>
                              </TableCell>
                            )}
                            <TableCell
                              className={cn(
                                'font-medium',
                                reportEntityNameClass(
                                  language,
                                  reportEntityName(language, row.productName, row.productNameUrdu),
                                ),
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
                            <TableCell className='text-sm text-muted-foreground'>
                              {row.variantLabel || '—'}
                            </TableCell>
                            <TableCell className='font-mono text-xs text-muted-foreground'>
                              {formatBatchDisplay(row) || '—'}
                            </TableCell>
                            <TableCell>{expiryBadge(row.expiryDate)}</TableCell>
                            <TableCell className='text-right text-sm'>{row.quantity}</TableCell>
                            <TableCell className='text-right text-sm'>
                              {formatCurrency(row.unitPrice)}
                            </TableCell>
                            <TableCell className='text-right font-semibold'>
                              {(row.discountAmount || 0) > 0 && (
                                <div className='text-xs font-normal text-muted-foreground line-through'>
                                  {formatCurrency(row.quantity * row.unitPrice)}
                                </div>
                              )}
                              {formatCurrency(row.subtotal)}
                              {(row.discountAmount || 0) > 0 && (
                                <div className='text-xs font-normal text-green-600'>
                                  -{formatCurrency(row.discountAmount || 0)}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}
                  </TableBody>

                  <TableFooter>
                    <TableRow className='bg-muted font-bold border-t-2'>
                      <TableCell colSpan={isMobileShop ? 7 : 6} className='text-sm uppercase tracking-wide'>
                        Total — {mergedSummary.totalInvoices} invoice
                        {mergedSummary.totalInvoices !== 1 ? 's' : ''}
                      </TableCell>
                      <TableCell className='text-right'>
                        {mergedSummary.totalItems} items
                      </TableCell>
                      <TableCell />
                      <TableCell className='text-right text-lg text-primary'>
                        {formatCurrency(mergedSummary.totalSales)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            ) : (
              /* ── Invoice Details View (original) ───────────────────────────── */
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow className='bg-muted/50'>
                      <TableHead className='w-8' />
                      <TableHead>Invoice #</TableHead>
                      {isMobileShop && <TableHead>Module</TableHead>}
                      <TableHead>Date</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className='text-center'>Type</TableHead>
                      <TableHead className='text-center'>Status</TableHead>
                      <TableHead className='text-right'>Items</TableHead>
                      <TableHead className='text-right'>Total</TableHead>
                      <TableHead className='text-right'>Paid</TableHead>
                      <TableHead className='text-right'>Balance</TableHead>
                      <TableHead className='w-10' />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mergedInvoices.map((inv) => {
                      const isOpen = expandedRows.has(inv._id)
                      const totalQty = inv.items.reduce((s, i) => s + i.quantity, 0)
                      return (
                        <Fragment key={inv._id}>
                          {/* ── Invoice row ── */}
                          <TableRow
                            className='cursor-pointer hover:bg-muted/40 transition-colors'
                            onClick={() => toggleRow(inv._id)}
                          >
                            <TableCell className='pl-4'>
                              <Button variant='ghost' size='icon' className='h-6 w-6 p-0'>
                                {isOpen
                                  ? <ChevronDown className='h-4 w-4' />
                                  : <ChevronRight className='h-4 w-4' />}
                              </Button>
                            </TableCell>
                            <TableCell className='font-mono font-semibold text-primary'>
                              {inv.invoiceNumber}
                            </TableCell>
                            {isMobileShop && (
                              <TableCell>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${moduleColors[inv.module] ?? ''}`}>
                                  {inv.module}
                                </span>
                              </TableCell>
                            )}
                            <TableCell className='text-sm text-muted-foreground'>
                              {format(new Date(inv.invoiceDate), 'dd MMM yyyy')}
                            </TableCell>
                            <TableCell
                              className={cn(
                                'font-medium',
                                reportEntityNameClass(
                                  language,
                                  reportEntityName(language, inv.customerName || '', inv.customerNameUrdu),
                                ),
                              )}
                            >
                              {reportEntityName(language, inv.customerName || '', inv.customerNameUrdu) || 'Walk-in'}
                            </TableCell>
                            <TableCell className='text-sm text-muted-foreground'>
                              {inv.customerPhone || '—'}
                            </TableCell>
                            <TableCell className='text-center'>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${typeColors[inv.type] ?? ''}`}>
                                {inv.type}
                              </span>
                            </TableCell>
                            <TableCell className='text-center'>
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[inv.status] ?? ''}`}>
                                {inv.status}
                              </span>
                            </TableCell>
                            <TableCell className='text-right text-sm'>{totalQty}</TableCell>
                            <TableCell className='text-right font-semibold'>
                              {formatCurrency(inv.total)}
                            </TableCell>
                            <TableCell className='text-right text-green-600 text-sm'>
                              {formatCurrency(inv.paidAmount)}
                            </TableCell>
                            <TableCell className='text-right text-sm'>
                              {inv.balance > 0 ? (
                                <span className='text-red-500'>{formatCurrency(inv.balance)}</span>
                              ) : (
                                <span className='text-muted-foreground'>—</span>
                              )}
                            </TableCell>
                            <TableCell className='pr-3'>
                              <Button
                                variant='ghost'
                                size='icon'
                                className='h-7 w-7 text-muted-foreground hover:text-primary'
                                title='View invoice'
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setViewInvoice(inv)
                                }}
                              >
                                <Eye className='h-4 w-4' />
                              </Button>
                            </TableCell>
                          </TableRow>

                          {/* ── Expanded items ── */}
                          {isOpen && inv.items.map((item, idx) => (
                            <TableRow
                              key={`${inv._id}-item-${idx}`}
                              className='bg-muted/20 hover:bg-muted/30'
                            >
                              {/* expand icon col */}
                              <TableCell />
                              {/* Invoice # / Module / Date / Customer */}
                              <TableCell
                                colSpan={isMobileShop ? 4 : 3}
                                className='pl-10 text-sm text-muted-foreground py-2'
                              >
                                <LongText
                                  className={cn(
                                    'font-medium text-foreground max-w-[240px]',
                                    reportEntityNameClass(
                                      language,
                                      reportEntityName(language, item.name, item.nameUrdu),
                                    ),
                                  )}
                                >
                                  {reportEntityName(language, item.name, item.nameUrdu)}
                                </LongText>
                                {item.imeis && item.imeis.length > 0 && (
                                  <span className='block text-xs text-muted-foreground'>
                                    IMEI/Serial: {formatImeiEntries(item.imeis)}
                                  </span>
                                )}
                                {item.note && (
                                  <span className='block text-xs text-muted-foreground'>{item.note}</span>
                                )}
                                {(item.variantLabel || item.batchNumber || item.expiryDate) && (
                                  <span className='mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground'>
                                    {item.variantLabel && <span>{item.variantLabel}</span>}
                                    {formatBatchDisplay(item) && <span className='font-mono'>{formatBatchDisplay(item)}</span>}
                                    {item.expiryDate && expiryBadge(item.expiryDate)}
                                  </span>
                                )}
                              </TableCell>
                              {/* Phone */}
                              <TableCell />
                              {/* Type */}
                              <TableCell />
                              {/* Status */}
                              <TableCell />
                              {/* Items — qty × unit price */}
                              <TableCell className='text-right text-sm py-2 text-muted-foreground'>
                                {item.quantity} × {formatCurrency(item.unitPrice)}
                              </TableCell>
                              {/* Total — subtotal only */}
                              <TableCell className='text-right font-medium py-2'>
                                {(item.discountAmount || 0) > 0 && (
                                  <div className='text-xs font-normal text-muted-foreground line-through'>
                                    {formatCurrency(item.quantity * item.unitPrice)}
                                  </div>
                                )}
                                {formatCurrency(item.subtotal)}
                                {(item.discountAmount || 0) > 0 && (
                                  <div className='text-xs font-normal text-green-600'>
                                    -{formatCurrency(item.discountAmount || 0)}
                                  </div>
                                )}
                              </TableCell>
                              {/* Paid — empty */}
                              <TableCell />
                              {/* Balance — empty */}
                              <TableCell />
                              {/* Actions — empty */}
                              <TableCell />
                            </TableRow>
                          ))}
                        </Fragment>
                      )
                    })}
                  </TableBody>

                  {/* ── Totals row ── */}
                  <TableFooter>
                    <TableRow className='bg-muted font-bold border-t-2'>
                      <TableCell />
                      <TableCell colSpan={isMobileShop ? 3 : 2} className='text-sm uppercase tracking-wide'>
                        Total
                      </TableCell>
                      <TableCell className='text-sm'>
                        {mergedSummary.totalInvoices} invoice
                        {mergedSummary.totalInvoices !== 1 ? 's' : ''}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell className='text-right'>
                        {mergedSummary.totalItems} items
                      </TableCell>
                      <TableCell className='text-right text-lg text-primary'>
                        {formatCurrency(mergedSummary.totalSales)}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Invoice View Dialog ───────────────────────────────────────────── */}
        <Dialog open={!!viewInvoice} onOpenChange={(open) => !open && setViewInvoice(null)}>
          <DialogContent className='max-w-3xl max-h-[90vh] overflow-y-auto'>
            {viewInvoice && (
              <>
                <DialogHeader>
                  <DialogTitle className='flex flex-wrap items-center gap-2'>
                    <span className='font-mono text-primary'>{viewInvoice.invoiceNumber}</span>
                    {isMobileShop && (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${moduleColors[viewInvoice.module] ?? ''}`}>
                        {viewInvoice.module}
                      </span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[viewInvoice.status] ?? ''}`}>
                      {viewInvoice.status}
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${typeColors[viewInvoice.type] ?? ''}`}>
                      {viewInvoice.type}
                    </span>
                  </DialogTitle>
                </DialogHeader>

                {/* Meta */}
                <div className='grid grid-cols-2 gap-4 text-sm'>
                  <div className='space-y-1'>
                    <p className='text-muted-foreground'>Date</p>
                    <p className='font-medium'>{format(new Date(viewInvoice.invoiceDate), 'dd MMM yyyy, hh:mm a')}</p>
                  </div>
                  <div className='space-y-1'>
                    <p className='text-muted-foreground'>Customer</p>
                    <p className={cn('font-medium', reportEntityNameClass(language, reportEntityName(language, viewInvoice.customerName || '', viewInvoice.customerNameUrdu)))}>
                      {reportEntityName(language, viewInvoice.customerName || '', viewInvoice.customerNameUrdu) || 'Walk-in'}
                    </p>
                    {viewInvoice.customerPhone && (
                      <p className='text-muted-foreground text-xs'>{viewInvoice.customerPhone}</p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Items */}
                <div>
                  <p className='text-sm font-semibold mb-3'>{viewInvoice.module === 'Sales' ? 'Items Sold' : 'Transaction Details'}</p>
                  <div className='overflow-x-auto'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className='text-right'>Qty</TableHead>
                        <TableHead className='text-right'>Unit Sale Price</TableHead>
                        <TableHead className='text-right'>Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewInvoice.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className='text-muted-foreground text-sm'>{idx + 1}</TableCell>
                          <TableCell className='font-medium max-w-[240px]'>
                            <LongText
                              className={reportEntityNameClass(
                                language,
                                reportEntityName(language, item.name, item.nameUrdu),
                              )}
                            >
                              {reportEntityName(language, item.name, item.nameUrdu)}
                            </LongText>
                            {item.imeis && item.imeis.length > 0 && (
                              <div className='text-xs font-normal text-muted-foreground'>
                                IMEI/Serial: {formatImeiEntries(item.imeis)}
                              </div>
                            )}
                            {item.note && (
                              <div className='text-xs font-normal text-muted-foreground'>{item.note}</div>
                            )}
                            {(item.variantLabel || item.batchNumber || item.expiryDate) && (
                              <div className='mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-normal text-muted-foreground'>
                                {item.variantLabel && <span>{item.variantLabel}</span>}
                                {item.batchNumber && <span className='font-mono'>{item.batchNumber}</span>}
                                {item.expiryDate && expiryBadge(item.expiryDate)}
                              </div>
                            )}
                          </TableCell>
                          <TableCell className='text-right'>{item.quantity}</TableCell>
                          <TableCell className='text-right'>{formatCurrency(item.unitPrice)}</TableCell>
                          <TableCell className='text-right font-semibold'>
                            {(item.discountAmount || 0) > 0 && (
                              <div className='text-xs font-normal text-muted-foreground line-through'>
                                {formatCurrency(item.quantity * item.unitPrice)}
                              </div>
                            )}
                            {formatCurrency(item.subtotal)}
                            {(item.discountAmount || 0) > 0 && (
                              <div className='text-xs font-normal text-green-600'>
                                -{formatCurrency(item.discountAmount || 0)}
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={4} className='text-right font-bold'>
                          {viewInvoice.items.reduce((s, i) => s + i.quantity, 0)} items total
                        </TableCell>
                        <TableCell className='text-right font-bold text-primary'>
                          {formatCurrency(viewInvoice.items.reduce((s, i) => s + i.subtotal, 0))}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                  </div>
                </div>

                <Separator />

                {(() => {
                  const itemDiscountTotal = viewInvoice.items.reduce((s, i) => s + (i.discountAmount || 0), 0)
                  const totalSaved = itemDiscountTotal + (viewInvoice.discount || 0)
                  if (totalSaved <= 0) return null
                  return (
                    <div className='grid grid-cols-2 gap-4 text-sm'>
                      {itemDiscountTotal > 0 && (
                        <div className='rounded-lg border p-3 text-center'>
                          <p className='text-muted-foreground text-xs mb-1'>Item Discounts</p>
                          <p className='text-lg font-bold text-green-600'>-{formatCurrency(itemDiscountTotal)}</p>
                        </div>
                      )}
                      {(viewInvoice.discount || 0) > 0 && (
                        <div className='rounded-lg border p-3 text-center'>
                          <p className='text-muted-foreground text-xs mb-1'>Invoice Discount</p>
                          <p className='text-lg font-bold text-green-600'>-{formatCurrency(viewInvoice.discount || 0)}</p>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Payment summary */}
                <div className='grid grid-cols-3 gap-4 text-sm'>
                  <div className='rounded-lg border p-3 text-center'>
                    <p className='text-muted-foreground text-xs mb-1'>Invoice Total</p>
                    <p className='text-lg font-bold'>{formatCurrency(viewInvoice.total)}</p>
                  </div>
                  <div className='rounded-lg border p-3 text-center bg-green-50 dark:bg-green-950/20'>
                    <p className='text-muted-foreground text-xs mb-1'>Amount Paid</p>
                    <p className='text-lg font-bold text-green-600'>{formatCurrency(viewInvoice.paidAmount)}</p>
                  </div>
                  <div className={`rounded-lg border p-3 text-center ${viewInvoice.balance > 0 ? 'bg-red-50 dark:bg-red-950/20' : ''}`}>
                    <p className='text-muted-foreground text-xs mb-1'>Balance Due</p>
                    <p className={`text-lg font-bold ${viewInvoice.balance > 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                      {viewInvoice.balance > 0 ? formatCurrency(viewInvoice.balance) : 'Fully Paid'}
                    </p>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    )
  },
)

SalesReport.displayName = 'SalesReport'
