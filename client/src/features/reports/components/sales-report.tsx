import { useState, useCallback, useMemo } from 'react'
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
import { useGetSalesReportQuery, useGetSalesInvoiceDetailsQuery, SalesInvoiceDetail } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { TrendingUp, DollarSign, ShoppingCart, Package, ChevronDown, ChevronRight, Eye, LayoutList } from 'lucide-react'
import { forwardRef, useImperativeHandle } from 'react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'

interface SalesReportProps {
  startDate: string
  endDate: string
}

const statusColors: Record<string, string> = {
  paid:      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  unpaid:    'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
  finalized: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  draft:     'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  refunded:  'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
}

const typeColors: Record<string, string> = {
  cash:    'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  credit:  'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
}

export const SalesReport = forwardRef<{ exportToExcel: () => void }, SalesReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const { data, isLoading } = useGetSalesReportQuery({ startDate, endDate, groupBy: 'day' })
    const { data: detailData, isLoading: detailLoading } = useGetSalesInvoiceDetailsQuery({ startDate, endDate })
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
    const [viewInvoice, setViewInvoice] = useState<SalesInvoiceDetail | null>(null)
    const [showProductsOnly, setShowProductsOnly] = useState(false)

    // Flatten invoices into date-grouped product rows for the Products Only view
    const productsByDate = useMemo(() => {
      if (!detailData?.invoices) return []
      const dateMap = new Map<string, Array<{
        invoiceNumber: string
        productName: string
        quantity: number
        unitPrice: number
        subtotal: number
      }>>()
      detailData.invoices.forEach((inv) => {
        const dateStr = format(new Date(inv.invoiceDate), 'dd MMM yyyy')
        if (!dateMap.has(dateStr)) dateMap.set(dateStr, [])
        inv.items.forEach((item) => {
          dateMap.get(dateStr)!.push({
            invoiceNumber: inv.invoiceNumber,
            productName: item.name,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            subtotal: item.subtotal,
          })
        })
      })
      return Array.from(dateMap.entries()).map(([date, items]) => ({ date, items }))
    }, [detailData])

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

          // Sheet 2 — invoice details
          if (detailData?.invoices && detailData.invoices.length > 0) {
            const rows: object[] = []
            detailData.invoices.forEach((inv) => {
              inv.items.forEach((item, idx) => {
                rows.push({
                  'Invoice #':    idx === 0 ? inv.invoiceNumber : '',
                  Date:           idx === 0 ? format(new Date(inv.invoiceDate), 'yyyy-MM-dd') : '',
                  Customer:       idx === 0 ? inv.customerName : '',
                  'Cust. Phone':  idx === 0 ? inv.customerPhone : '',
                  Type:           idx === 0 ? inv.type : '',
                  Status:         idx === 0 ? inv.status : '',
                  'Invoice Total': idx === 0 ? inv.total : '',
                  'Paid Amount':  idx === 0 ? inv.paidAmount : '',
                  Balance:        idx === 0 ? inv.balance : '',
                  Product:        item.name,
                  Qty:            item.quantity,
                  'Unit Price':   item.unitPrice,
                  Subtotal:       item.subtotal,
                })
              })
            })
            // Totals row
            rows.push({
              'Invoice #':    'TOTAL',
              Date:           '',
              Customer:       `${detailData.summary.totalInvoices} invoices`,
              'Cust. Phone':  '',
              Type:           '',
              Status:         '',
              'Invoice Total': detailData.summary.totalSales,
              'Paid Amount':  '',
              Balance:        '',
              Product:        '',
              Qty:            detailData.summary.totalItems,
              'Unit Price':   '',
              Subtotal:       detailData.summary.totalSales,
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
    }))

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
                All invoices in the selected period — click a row to see individual items
              </CardDescription>
            </div>
            {detailData?.invoices?.length ? (
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
                      const allIds = detailData.invoices.map((inv) => inv._id)
                      const allOpen = allIds.every((id) => expandedRows.has(id))
                      setExpandedRows(allOpen ? new Set() : new Set(allIds))
                    }}
                  >
                    {detailData.invoices.every((inv) => expandedRows.has(inv._id)) ? (
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
            {detailLoading ? (
              <div className='space-y-2 p-6'>
                {[1, 2, 3].map((i) => <Skeleton key={i} className='h-10 w-full' />)}
              </div>
            ) : !detailData?.invoices?.length ? (
              <p className='text-center text-muted-foreground py-10'>No invoices found</p>
            ) : showProductsOnly ? (
              /* ── Products Only View ────────────────────────────────────────── */
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow className='bg-muted/50'>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className='text-right'>Qty</TableHead>
                      <TableHead className='text-right'>Unit Price</TableHead>
                      <TableHead className='text-right'>Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productsByDate.map(({ date, items }) => (
                      <>
                        {/* Date group header */}
                        <TableRow key={`date-${date}`} className='bg-muted/40 border-t'>
                          <TableCell
                            colSpan={6}
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
                            <TableCell className='font-medium'>{row.productName}</TableCell>
                            <TableCell className='text-right text-sm'>{row.quantity}</TableCell>
                            <TableCell className='text-right text-sm'>
                              {formatCurrency(row.unitPrice)}
                            </TableCell>
                            <TableCell className='text-right font-semibold'>
                              {formatCurrency(row.subtotal)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </>
                    ))}
                  </TableBody>

                  <TableFooter>
                    <TableRow className='bg-muted font-bold border-t-2'>
                      <TableCell colSpan={3} className='text-sm uppercase tracking-wide'>
                        Total — {detailData.summary.totalInvoices} invoice
                        {detailData.summary.totalInvoices !== 1 ? 's' : ''}
                      </TableCell>
                      <TableCell className='text-right'>
                        {detailData.summary.totalItems} items
                      </TableCell>
                      <TableCell />
                      <TableCell className='text-right text-lg text-primary'>
                        {formatCurrency(detailData.summary.totalSales)}
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
                    {detailData.invoices.map((inv) => {
                      const isOpen = expandedRows.has(inv._id)
                      const totalQty = inv.items.reduce((s, i) => s + i.quantity, 0)
                      return (
                        <>
                          {/* ── Invoice row ── */}
                          <TableRow
                            key={inv._id}
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
                            <TableCell className='text-sm text-muted-foreground'>
                              {format(new Date(inv.invoiceDate), 'dd MMM yyyy')}
                            </TableCell>
                            <TableCell className='font-medium'>
                              {inv.customerName || 'Walk-in'}
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
                              {/* Invoice # / Date / Customer (colSpan 3) */}
                              <TableCell
                                colSpan={3}
                                className='pl-10 text-sm text-muted-foreground py-2'
                              >
                                <span className='font-medium text-foreground'>{item.name}</span>
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
                                {formatCurrency(item.subtotal)}
                              </TableCell>
                              {/* Paid — empty */}
                              <TableCell />
                              {/* Balance — empty */}
                              <TableCell />
                              {/* Actions — empty */}
                              <TableCell />
                            </TableRow>
                          ))}
                        </>
                      )
                    })}
                  </TableBody>

                  {/* ── Totals row ── */}
                  <TableFooter>
                    <TableRow className='bg-muted font-bold border-t-2'>
                      <TableCell />
                      <TableCell colSpan={2} className='text-sm uppercase tracking-wide'>
                        Total
                      </TableCell>
                      <TableCell className='text-sm'>
                        {detailData.summary.totalInvoices} invoice
                        {detailData.summary.totalInvoices !== 1 ? 's' : ''}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell />
                      <TableCell className='text-right'>
                        {detailData.summary.totalItems} items
                      </TableCell>
                      <TableCell className='text-right text-lg text-primary'>
                        {formatCurrency(detailData.summary.totalSales)}
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
          <DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
            {viewInvoice && (
              <>
                <DialogHeader>
                  <DialogTitle className='flex items-center gap-2'>
                    <span className='font-mono text-primary'>{viewInvoice.invoiceNumber}</span>
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
                    <p className='font-medium'>{viewInvoice.customerName || 'Walk-in'}</p>
                    {viewInvoice.customerPhone && (
                      <p className='text-muted-foreground text-xs'>{viewInvoice.customerPhone}</p>
                    )}
                  </div>
                </div>

                <Separator />

                {/* Items */}
                <div>
                  <p className='text-sm font-semibold mb-3'>Items Sold</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className='text-right'>Qty</TableHead>
                        <TableHead className='text-right'>Unit Price</TableHead>
                        <TableHead className='text-right'>Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewInvoice.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className='text-muted-foreground text-sm'>{idx + 1}</TableCell>
                          <TableCell className='font-medium'>{item.name}</TableCell>
                          <TableCell className='text-right'>{item.quantity}</TableCell>
                          <TableCell className='text-right'>{formatCurrency(item.unitPrice)}</TableCell>
                          <TableCell className='text-right font-semibold'>{formatCurrency(item.subtotal)}</TableCell>
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

                <Separator />

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
