import { useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  useGetPurchaseReportQuery,
  useGetPurchaseInvoiceDetailsQuery,
  PurchaseInvoiceDetail,
} from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import {
  Package,
  ShoppingBag,
  Users,
  Wallet,
  ChevronDown,
  ChevronRight,
  Eye,
  LayoutList,
} from 'lucide-react'
import { forwardRef, useImperativeHandle } from 'react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { reportEntityName, reportEntityNameClass } from '../utils/report-entity-name'

interface PurchaseReportProps {
  startDate: string
  endDate: string
}

interface DailyRow {
  date: string
  invoices: number
  amount: number
  suppliers: Set<string>
}

const statusColors: Record<string, string> = {
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  unpaid: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
}

const paymentTypeColors: Record<string, string> = {
  Cash: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  Credit: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  'Bank Transfer': 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
  Wallet: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  Cheque: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  Card: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
}

export const PurchaseReport = forwardRef<{ exportToExcel: () => void }, PurchaseReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t, language } = useLanguage()
    const { data, isLoading } = useGetPurchaseReportQuery({ startDate, endDate })
    const { data: detailData, isLoading: detailLoading } = useGetPurchaseInvoiceDetailsQuery({
      startDate,
      endDate,
    })
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
    const [viewInvoice, setViewInvoice] = useState<PurchaseInvoiceDetail | null>(null)
    const [showProductsOnly, setShowProductsOnly] = useState(false)

    const dailyData = useMemo<DailyRow[]>(() => {
      if (!data?.data) return []
      const byDate = new Map<string, DailyRow>()
      data.data.forEach((row) => {
        const date = row._id.date
        if (!byDate.has(date)) {
          byDate.set(date, { date, invoices: 0, amount: 0, suppliers: new Set() })
        }
        const agg = byDate.get(date)!
        agg.invoices += row.purchaseCount
        agg.amount += row.totalAmount
        if (row._id.supplier) agg.suppliers.add(row._id.supplier)
      })
      return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? 1 : -1))
    }, [data])

    const productsByDate = useMemo(() => {
      if (!detailData?.purchases) return []
      const dateMap = new Map<
        string,
        Array<{
          invoiceNumber: string
          productName: string
          productNameUrdu?: string
          quantity: number
          unitPrice: number
          subtotal: number
        }>
      >()
      detailData.purchases.forEach((p) => {
        const dateStr = format(new Date(p.purchaseDate), 'dd MMM yyyy')
        if (!dateMap.has(dateStr)) dateMap.set(dateStr, [])
        p.items.forEach((item) => {
          dateMap.get(dateStr)!.push({
            invoiceNumber: p.invoiceNumber,
            productName: item.name,
            productNameUrdu: item.nameUrdu,
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

          if (dailyData.length > 0) {
            const summarySheet = XLSX.utils.json_to_sheet(
              dailyData.map((row) => ({
                [t('date')]: row.date,
                [t('invoices')]: row.invoices,
                [t('suppliers')]: row.suppliers.size,
                [t('amount')]: row.amount,
              }))
            )
            XLSX.utils.book_append_sheet(wb, summarySheet, 'Daily Summary')
          }

          if (detailData?.purchases && detailData.purchases.length > 0) {
            const rows: object[] = []
            detailData.purchases.forEach((p) => {
              p.items.forEach((item, idx) => {
                rows.push({
                  'Invoice #': idx === 0 ? p.invoiceNumber : '',
                  Date: idx === 0 ? format(new Date(p.purchaseDate), 'yyyy-MM-dd') : '',
                  Supplier:
                    idx === 0 ? reportEntityName(language, p.supplierName, p.supplierNameUrdu) : '',
                  'Supplier Phone': idx === 0 ? p.supplierPhone : '',
                  'Payment Type': idx === 0 ? p.paymentType : '',
                  'Invoice Total': idx === 0 ? p.totalAmount : '',
                  Product: reportEntityName(language, item.name, item.nameUrdu),
                  Qty: item.quantity,
                  'Unit Cost': item.unitPrice,
                  Subtotal: item.subtotal,
                })
              })
            })
            rows.push({
              'Invoice #': 'TOTAL',
              Date: '',
              Supplier: `${detailData.summary.totalInvoices} invoices`,
              'Supplier Phone': '',
              'Payment Type': '',
              'Invoice Total': detailData.summary.totalPurchases,
              Product: '',
              Qty: detailData.summary.totalItems,
              'Unit Cost': '',
              Subtotal: detailData.summary.totalPurchases,
            })
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Purchase Details')
          }

          if (wb.SheetNames.length === 0) {
            toast.error(t('No data available to export'))
            return
          }

          XLSX.writeFile(wb, `purchase-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
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
          <Skeleton className='h-[200px] w-full' />
          <Skeleton className='h-[400px] w-full' />
        </div>
      )
    }

    const formatCurrency = (value: number) =>
      new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(value)

    const summary = data?.summary ?? {}
    const totalAmount = summary.totalPurchases || 0
    const totalInvoices = summary.purchaseCount || 0
    const uniqueSuppliers = summary.uniqueSuppliers || 0
    const avgPurchaseValue = summary.avgPurchaseValue || 0

    const chartData = [...dailyData].reverse().map((row) => ({
      date: row.date,
      amount: row.amount,
      invoices: row.invoices,
    }))

    return (
      <div className='space-y-6'>
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          <Card className={kpiCardClass('orange')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('total_purchases')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('orange'))}>
                <ShoppingBag className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{formatCurrency(totalAmount)}</div>
              <p className='text-xs text-muted-foreground mt-1'>
                {totalInvoices} {t('invoices')}
              </p>
            </CardContent>
          </Card>

          <Card className={kpiCardClass('sky')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('invoices')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('sky'))}>
                <Package className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{totalInvoices}</div>
            </CardContent>
          </Card>

          <Card className={kpiCardClass('violet')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('suppliers')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('violet'))}>
                <Users className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{uniqueSuppliers}</div>
            </CardContent>
          </Card>

          <Card className={kpiCardClass('emerald')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('avg_purchase_value')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('emerald'))}>
                <Wallet className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{formatCurrency(avgPurchaseValue)}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('purchase_trend')}</CardTitle>
            <CardDescription>{t('daily_purchases_overview')}</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width='100%' height={360}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis dataKey='date' />
                <YAxis />
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Bar dataKey='amount' fill='#f97316' name={t('amount')} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('daily_summary')}</CardTitle>
            <CardDescription>{t('purchases_grouped_by_day')}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('date')}</TableHead>
                  <TableHead className='text-right'>{t('invoices')}</TableHead>
                  <TableHead className='text-right'>{t('suppliers')}</TableHead>
                  <TableHead className='text-right'>{t('amount')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dailyData.map((row) => (
                  <TableRow key={row.date}>
                    <TableCell className='font-medium'>{row.date}</TableCell>
                    <TableCell className='text-right'>{row.invoices}</TableCell>
                    <TableCell className='text-right'>{row.suppliers.size}</TableCell>
                    <TableCell className='text-right font-semibold'>
                      {formatCurrency(row.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              {dailyData.length > 0 && (
                <TableFooter>
                  <TableRow className='bg-muted font-bold border-t-2'>
                    <TableCell className='text-sm uppercase tracking-wide'>{t('total')}</TableCell>
                    <TableCell className='text-right'>{totalInvoices}</TableCell>
                    <TableCell className='text-right'>{uniqueSuppliers}</TableCell>
                    <TableCell className='text-right text-primary'>
                      {formatCurrency(totalAmount)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </CardContent>
        </Card>

        {/* Purchase Invoice Details */}
        <Card>
          <CardHeader className='flex flex-row items-start justify-between gap-4'>
            <div>
              <CardTitle>{t('purchase_details')}</CardTitle>
              <CardDescription>
                All purchase invoices in the selected period — click a row to see items
              </CardDescription>
            </div>
            {detailData?.purchases?.length ? (
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
                      const allIds = detailData.purchases.map((p) => p._id)
                      const allOpen = allIds.every((id) => expandedRows.has(id))
                      setExpandedRows(allOpen ? new Set() : new Set(allIds))
                    }}
                  >
                    {detailData.purchases.every((p) => expandedRows.has(p._id)) ? (
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
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className='h-10 w-full' />
                ))}
              </div>
            ) : !detailData?.purchases?.length ? (
              <p className='text-center text-muted-foreground py-10'>No purchases found</p>
            ) : showProductsOnly ? (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow className='bg-muted/50'>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className='text-right'>Qty</TableHead>
                      <TableHead className='text-right'>Unit Cost</TableHead>
                      <TableHead className='text-right'>Subtotal</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productsByDate.map(({ date, items }) => (
                      <>
                        <TableRow key={`date-${date}`} className='bg-muted/40 border-t'>
                          <TableCell
                            colSpan={6}
                            className='py-2 px-4 font-semibold text-sm text-foreground'
                          >
                            {date}
                          </TableCell>
                        </TableRow>
                        {items.map((row, idx) => (
                          <TableRow
                            key={`${date}-${idx}`}
                            className='hover:bg-muted/30 transition-colors'
                          >
                            <TableCell className='text-sm text-muted-foreground pl-6' />
                            <TableCell className='font-mono text-xs text-primary'>
                              {row.invoiceNumber}
                            </TableCell>
                            <TableCell
                              className={cn(
                                'font-medium',
                                reportEntityNameClass(
                                  language,
                                  reportEntityName(language, row.productName, row.productNameUrdu)
                                )
                              )}
                            >
                              {reportEntityName(language, row.productName, row.productNameUrdu)}
                            </TableCell>
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
                        {t('total')} — {detailData.summary.totalInvoices} invoice
                        {detailData.summary.totalInvoices !== 1 ? 's' : ''}
                      </TableCell>
                      <TableCell className='text-right'>
                        {detailData.summary.totalItems} items
                      </TableCell>
                      <TableCell />
                      <TableCell className='text-right text-lg text-primary'>
                        {formatCurrency(detailData.summary.totalPurchases)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow className='bg-muted/50'>
                      <TableHead className='w-8' />
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead className='text-center'>Payment</TableHead>
                      <TableHead className='text-right'>Items</TableHead>
                      <TableHead className='text-right'>Total</TableHead>
                      <TableHead className='w-10' />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailData.purchases.map((p) => {
                      const isOpen = expandedRows.has(p._id)
                      const totalQty = p.items.reduce((s, i) => s + i.quantity, 0)
                      return (
                        <>
                          <TableRow
                            key={p._id}
                            className='cursor-pointer hover:bg-muted/40 transition-colors'
                            onClick={() => toggleRow(p._id)}
                          >
                            <TableCell className='pl-4'>
                              <Button variant='ghost' size='icon' className='h-6 w-6 p-0'>
                                {isOpen ? (
                                  <ChevronDown className='h-4 w-4' />
                                ) : (
                                  <ChevronRight className='h-4 w-4' />
                                )}
                              </Button>
                            </TableCell>
                            <TableCell className='font-mono font-semibold text-primary'>
                              {p.invoiceNumber}
                            </TableCell>
                            <TableCell className='text-sm text-muted-foreground'>
                              {format(new Date(p.purchaseDate), 'dd MMM yyyy')}
                            </TableCell>
                            <TableCell
                              className={cn(
                                'font-medium',
                                reportEntityNameClass(
                                  language,
                                  reportEntityName(language, p.supplierName || '', p.supplierNameUrdu)
                                )
                              )}
                            >
                              {reportEntityName(language, p.supplierName || '', p.supplierNameUrdu) ||
                                'Unknown'}
                            </TableCell>
                            <TableCell className='text-sm text-muted-foreground'>
                              {p.supplierPhone || '—'}
                            </TableCell>
                            <TableCell className='text-center'>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${paymentTypeColors[p.paymentType] ?? ''}`}
                              >
                                {p.paymentType}
                              </span>
                            </TableCell>
                            <TableCell className='text-right text-sm'>{totalQty}</TableCell>
                            <TableCell className='text-right font-semibold'>
                              {formatCurrency(p.totalAmount)}
                            </TableCell>
                            <TableCell className='pr-3'>
                              <Button
                                variant='ghost'
                                size='icon'
                                className='h-7 w-7 text-muted-foreground hover:text-primary'
                                title='View purchase'
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setViewInvoice(p)
                                }}
                              >
                                <Eye className='h-4 w-4' />
                              </Button>
                            </TableCell>
                          </TableRow>

                          {isOpen &&
                            p.items.map((item, idx) => (
                              <TableRow
                                key={`${p._id}-item-${idx}`}
                                className='bg-muted/20 hover:bg-muted/30'
                              >
                                <TableCell />
                                <TableCell colSpan={3} className='pl-10 text-sm text-muted-foreground py-2'>
                                  <span
                                    className={cn(
                                      'font-medium text-foreground',
                                      reportEntityNameClass(
                                        language,
                                        reportEntityName(language, item.name, item.nameUrdu)
                                      )
                                    )}
                                  >
                                    {reportEntityName(language, item.name, item.nameUrdu)}
                                  </span>
                                </TableCell>
                                <TableCell />
                                <TableCell />
                                <TableCell className='text-right text-sm py-2 text-muted-foreground'>
                                  {item.quantity} × {formatCurrency(item.unitPrice)}
                                </TableCell>
                                <TableCell className='text-right font-medium py-2'>
                                  {formatCurrency(item.subtotal)}
                                </TableCell>
                                <TableCell />
                              </TableRow>
                            ))}
                        </>
                      )
                    })}
                  </TableBody>

                  <TableFooter>
                    <TableRow className='bg-muted font-bold border-t-2'>
                      <TableCell />
                      <TableCell colSpan={2} className='text-sm uppercase tracking-wide'>
                        {t('total')}
                      </TableCell>
                      <TableCell className='text-sm'>
                        {detailData.summary.totalInvoices} invoice
                        {detailData.summary.totalInvoices !== 1 ? 's' : ''}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell className='text-right'>
                        {detailData.summary.totalItems} items
                      </TableCell>
                      <TableCell className='text-right text-lg text-primary'>
                        {formatCurrency(detailData.summary.totalPurchases)}
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Purchase view dialog */}
        <Dialog open={!!viewInvoice} onOpenChange={(open) => !open && setViewInvoice(null)}>
          <DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
            {viewInvoice && (
              <>
                <DialogHeader>
                  <DialogTitle className='flex items-center gap-2'>
                    <span className='font-mono text-primary'>{viewInvoice.invoiceNumber}</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusColors[viewInvoice.status] ?? ''}`}
                    >
                      {viewInvoice.status}
                    </span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${paymentTypeColors[viewInvoice.paymentType] ?? ''}`}
                    >
                      {viewInvoice.paymentType}
                    </span>
                  </DialogTitle>
                </DialogHeader>

                <div className='grid grid-cols-2 gap-4 text-sm'>
                  <div className='space-y-1'>
                    <p className='text-muted-foreground'>Date</p>
                    <p className='font-medium'>
                      {format(new Date(viewInvoice.purchaseDate), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <div className='space-y-1'>
                    <p className='text-muted-foreground'>Supplier</p>
                    <p
                      className={cn(
                        'font-medium',
                        reportEntityNameClass(
                          language,
                          reportEntityName(
                            language,
                            viewInvoice.supplierName || '',
                            viewInvoice.supplierNameUrdu
                          )
                        )
                      )}
                    >
                      {reportEntityName(
                        language,
                        viewInvoice.supplierName || '',
                        viewInvoice.supplierNameUrdu
                      ) || 'Unknown'}
                    </p>
                    {viewInvoice.supplierPhone && (
                      <p className='text-muted-foreground text-xs'>{viewInvoice.supplierPhone}</p>
                    )}
                  </div>
                </div>

                <Separator />

                <div>
                  <p className='text-sm font-semibold mb-3'>Items Purchased</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className='text-right'>Qty</TableHead>
                        <TableHead className='text-right'>Unit Cost</TableHead>
                        <TableHead className='text-right'>Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {viewInvoice.items.map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell className='text-muted-foreground text-sm'>{idx + 1}</TableCell>
                          <TableCell
                            className={cn(
                              'font-medium',
                              reportEntityNameClass(
                                language,
                                reportEntityName(language, item.name, item.nameUrdu)
                              )
                            )}
                          >
                            {reportEntityName(language, item.name, item.nameUrdu)}
                          </TableCell>
                          <TableCell className='text-right'>{item.quantity}</TableCell>
                          <TableCell className='text-right'>
                            {formatCurrency(item.unitPrice)}
                          </TableCell>
                          <TableCell className='text-right font-semibold'>
                            {formatCurrency(item.subtotal)}
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
              </>
            )}
          </DialogContent>
        </Dialog>
      </div>
    )
  }
)

PurchaseReport.displayName = 'PurchaseReport'
