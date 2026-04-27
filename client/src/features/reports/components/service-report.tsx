import { forwardRef, useImperativeHandle, useState, useCallback, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import {
  useGetServiceReportQuery,
  useLazyGetServiceReportQuery,
  ServiceReportByService,
} from '@/stores/reports.api'
import {
  DollarSign,
  ShoppingBag,
  TrendingUp,
  ReceiptText,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface ServiceReportProps {
  startDate: string
  endDate: string
}

const fmt = (v: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(v)

const PAYMENT_COLORS: Record<string, string> = {
  cash:      '#22c55e',
  jazzcash:  '#f97316',
  easypaisa: '#06b6d4',
  bank:      '#6366f1',
  card:      '#a855f7',
}

const SERVICE_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#f97316', '#ec4899', '#14b8a6', '#84cc16',
]

const paymentLabel: Record<string, string> = {
  cash: 'Cash', jazzcash: 'JazzCash', easypaisa: 'Easypaisa', bank: 'Bank', card: 'Card',
}

export const ServiceReport = forwardRef<{ exportToExcel: () => void }, ServiceReportProps>(
  ({ startDate, endDate }, ref) => {
    const { data, isLoading } = useGetServiceReportQuery({ startDate, endDate })
    const [fetchDetail, { data: detailData, isFetching: detailLoading }] =
      useLazyGetServiceReportQuery()

    const [selectedService, setSelectedService] = useState<ServiceReportByService | null>(null)
    const [sheetExpanded, setSheetExpanded] = useState<Set<string>>(new Set())

    // Reset expanded rows whenever the sheet opens for a different service
    useEffect(() => { setSheetExpanded(new Set()) }, [selectedService?._id])

    const toggleSheetRow = useCallback((id: string) => {
      setSheetExpanded((prev) => {
        const next = new Set(prev)
        next.has(id) ? next.delete(id) : next.add(id)
        return next
      })
    }, [])

    const openService = useCallback(
      (svc: ServiceReportByService) => {
        setSelectedService(svc)
        fetchDetail({ startDate, endDate, serviceName: svc._id })
      },
      [fetchDetail, startDate, endDate],
    )

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data) { toast.error('No data to export'); return }
          const wb = XLSX.utils.book_new()

          XLSX.utils.book_append_sheet(
            wb,
            XLSX.utils.json_to_sheet([
              { Metric: 'Total Invoices',  Value: data.summary.totalInvoices },
              { Metric: 'Service Revenue', Value: data.summary.totalAmount },
              { Metric: 'Service Profit',  Value: data.summary.totalProfit },
              { Metric: 'Average Invoice', Value: data.summary.avgInvoice },
            ]),
            'Summary',
          )

          XLSX.utils.book_append_sheet(
            wb,
            XLSX.utils.json_to_sheet(
              data.byService.map((r) => ({
                Service: r._id,
                Quantity: r.totalQuantity,
                'Total Amount': r.totalAmount,
                'Avg Unit Price': r.avgUnitPrice,
                'Revenue Share %': data.summary.totalAmount
                  ? ((r.totalAmount / data.summary.totalAmount) * 100).toFixed(1)
                  : '0',
              })),
            ),
            'By Service',
          )

          XLSX.utils.book_append_sheet(
            wb,
            XLSX.utils.json_to_sheet(
              data.recentInvoices.map((r) => ({
                Date: format(new Date(r.date), 'yyyy-MM-dd'),
                Invoice: r.invoiceNumber,
                Customer: r.customerName || 'Walk-in',
                Phone: r.customerPhone || '',
                Services: (r.items || []).map((i) => `${i.serviceName} ×${i.quantity}`).join(', '),
                Amount: r.totalAmount,
                'Payment Method': paymentLabel[r.paymentMethod] || r.paymentMethod,
              })),
            ),
            'Recent Invoices',
          )

          XLSX.writeFile(wb, `service-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success('Data exported successfully')
        } catch {
          toast.error('Failed to export data')
        }
      },
    }))

    if (isLoading) {
      return (
        <div className='space-y-4'>
          <div className='grid gap-4 md:grid-cols-4'>
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className='h-24 w-full' />)}
          </div>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-3'>
            {[1, 2, 3].map((i) => <Skeleton key={i} className='h-36 w-full' />)}
          </div>
          <Skeleton className='h-64 w-full' />
        </div>
      )
    }

    const summary  = data?.summary
    const total    = summary?.totalAmount ?? 0
    const services = data?.byService ?? []
    const datewise = data?.datewise ?? []
    const payMethods = data?.byPaymentMethod ?? []

    return (
      <div className='space-y-6'>

        {/* ── Top Summary Cards ─────────────────────────────────────────────── */}
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          <Card>
            <CardContent className='p-5 flex items-center gap-4'>
              <div className='rounded-full bg-blue-100 dark:bg-blue-900/30 p-2.5'>
                <ReceiptText className='h-5 w-5 text-blue-600' />
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>Total Invoices</p>
                <p className='text-2xl font-bold'>{summary?.totalInvoices ?? 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='p-5 flex items-center gap-4'>
              <div className='rounded-full bg-emerald-100 dark:bg-emerald-900/30 p-2.5'>
                <DollarSign className='h-5 w-5 text-emerald-600' />
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>Total Revenue</p>
                <p className='text-2xl font-bold text-emerald-600'>{fmt(total)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='p-5 flex items-center gap-4'>
              <div className='rounded-full bg-green-100 dark:bg-green-900/30 p-2.5'>
                <TrendingUp className='h-5 w-5 text-green-600' />
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>Total Profit</p>
                <p className='text-2xl font-bold text-green-600'>{fmt(summary?.totalProfit ?? 0)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='p-5 flex items-center gap-4'>
              <div className='rounded-full bg-purple-100 dark:bg-purple-900/30 p-2.5'>
                <ShoppingBag className='h-5 w-5 text-purple-600' />
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>Avg Invoice</p>
                <p className='text-2xl font-bold'>{fmt(summary?.avgInvoice ?? 0)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Service Cards Grid ────────────────────────────────────────────── */}
        {services.length > 0 && (
          <div>
            <h3 className='text-base font-semibold mb-3'>Services</h3>
            <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
              {services.map((svc, idx) => {
                const share = total > 0 ? (svc.totalAmount / total) * 100 : 0
                const color = SERVICE_PALETTE[idx % SERVICE_PALETTE.length]
                return (
                  <Card
                    key={svc._id}
                    className='cursor-pointer hover:shadow-md transition-shadow border-l-4'
                    style={{ borderLeftColor: color }}
                    onClick={() => openService(svc)}
                  >
                    <CardContent className='p-5'>
                      {/* Header row */}
                      <div className='flex items-start justify-between mb-3'>
                        <div className='flex-1 min-w-0'>
                          <p className='font-semibold text-sm truncate'>{svc._id || 'Unknown'}</p>
                          <p className='text-xs text-muted-foreground mt-0.5'>
                            {svc.totalQuantity} job{svc.totalQuantity !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <ChevronRight className='h-4 w-4 text-muted-foreground shrink-0 mt-0.5' />
                      </div>

                      {/* Revenue */}
                      <p className='text-xl font-bold' style={{ color }}>
                        {fmt(svc.totalAmount)}
                      </p>

                      {/* Revenue share bar */}
                      <div className='mt-3 space-y-1'>
                        <div className='flex justify-between text-xs text-muted-foreground'>
                          <span>Revenue share</span>
                          <span>{share.toFixed(1)}%</span>
                        </div>
                        <div className='h-1.5 w-full rounded-full bg-muted overflow-hidden'>
                          <div
                            className='h-full rounded-full transition-all'
                            style={{ width: `${share}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>

                      {/* Avg unit price */}
                      <p className='text-xs text-muted-foreground mt-3'>
                        Avg price: <span className='font-medium text-foreground'>{fmt(svc.avgUnitPrice)}</span>
                      </p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        )}

        {services.length === 0 && (
          <Card>
            <CardContent className='py-16 text-center text-muted-foreground'>
              No service invoices found in the selected date range.
            </CardContent>
          </Card>
        )}

        {/* ── Charts Row ───────────────────────────────────────────────────── */}
        {(datewise.length > 0 || payMethods.length > 0) && (
          <div className='grid gap-4 md:grid-cols-2'>

            {/* Daily Revenue Trend */}
            {datewise.length > 0 && (
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm'>Daily Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width='100%' height={220}>
                    <BarChart data={datewise}>
                      <CartesianGrid strokeDasharray='3 3' />
                      <XAxis dataKey='_id' tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number) => fmt(v)} />
                      <Bar dataKey='totalAmount' name='Revenue' fill='#3b82f6' radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Payment Method Breakdown */}
            {payMethods.length > 0 && (
              <Card>
                <CardHeader className='pb-2'>
                  <CardTitle className='text-sm'>Payment Methods</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width='100%' height={220}>
                    <PieChart>
                      <Pie
                        data={payMethods}
                        dataKey='totalAmount'
                        nameKey='_id'
                        cx='50%'
                        cy='50%'
                        outerRadius={80}
                        label={({ _id, percent }) =>
                          `${paymentLabel[_id] ?? _id} ${(percent * 100).toFixed(0)}%`
                        }
                        labelLine={false}
                      >
                        {payMethods.map((pm) => (
                          <Cell
                            key={pm._id}
                            fill={PAYMENT_COLORS[pm._id] ?? '#94a3b8'}
                          />
                        ))}
                      </Pie>
                      <Legend formatter={(v) => paymentLabel[v] ?? v} />
                      <Tooltip formatter={(v: number) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* ── Service Detail Sheet ──────────────────────────────────────────── */}
        <Sheet open={!!selectedService} onOpenChange={(open) => !open && setSelectedService(null)}>
          <SheetContent className='w-full sm:max-w-2xl overflow-y-auto'>
            {selectedService && (
              <>
                <SheetHeader className='mb-4'>
                  <SheetTitle>{selectedService._id}</SheetTitle>
                  <p className='text-sm text-muted-foreground'>
                    All invoices for this service in the selected period
                  </p>
                </SheetHeader>

                {/* Service stats */}
                <div className='grid grid-cols-3 gap-3 mb-5'>
                  <div className='rounded-lg border p-3 text-center'>
                    <p className='text-xs text-muted-foreground mb-1'>Jobs</p>
                    <p className='text-xl font-bold'>{selectedService.totalQuantity}</p>
                  </div>
                  <div className='rounded-lg border p-3 text-center bg-emerald-50 dark:bg-emerald-950/20'>
                    <p className='text-xs text-muted-foreground mb-1'>Total Revenue</p>
                    <p className='text-lg font-bold text-emerald-600'>{fmt(selectedService.totalAmount)}</p>
                  </div>
                  <div className='rounded-lg border p-3 text-center'>
                    <p className='text-xs text-muted-foreground mb-1'>Avg Price</p>
                    <p className='text-lg font-bold'>{fmt(selectedService.avgUnitPrice)}</p>
                  </div>
                </div>

                <Separator className='mb-4' />

                {/* Invoices table */}
                {detailLoading ? (
                  <div className='space-y-2'>
                    {[1, 2, 3, 4].map((i) => <Skeleton key={i} className='h-10 w-full' />)}
                  </div>
                ) : !detailData?.recentInvoices?.length ? (
                  <p className='text-center text-muted-foreground py-10'>No invoices found</p>
                ) : (
                  <>
                    {/* Expand-all toggle */}
                    <div className='flex items-center justify-between mb-2'>
                      <p className='text-xs font-semibold text-muted-foreground uppercase tracking-wide'>
                        {detailData.recentInvoices.length} Invoice{detailData.recentInvoices.length !== 1 ? 's' : ''}
                      </p>
                      <Button
                        variant='outline'
                        size='sm'
                        className='h-7 text-xs'
                        onClick={() => {
                          const allIds = detailData.recentInvoices.map((i) => i._id)
                          const allOpen = allIds.every((id) => sheetExpanded.has(id))
                          setSheetExpanded(allOpen ? new Set() : new Set(allIds))
                        }}
                      >
                        {detailData.recentInvoices.every((i) => sheetExpanded.has(i._id)) ? (
                          <><ChevronDown className='h-3 w-3 mr-1' />Collapse All</>
                        ) : (
                          <><ChevronRight className='h-3 w-3 mr-1' />Expand All</>
                        )}
                      </Button>
                    </div>

                    <div className='overflow-x-auto rounded-md border'>
                      <Table>
                        <TableHeader>
                          <TableRow className='bg-muted/50'>
                            <TableHead className='w-8' />
                            <TableHead className='text-xs'>Invoice #</TableHead>
                            <TableHead className='text-xs'>Date</TableHead>
                            <TableHead className='text-xs'>Customer</TableHead>
                            <TableHead className='text-xs'>Payment</TableHead>
                            <TableHead className='text-xs text-right'>Items</TableHead>
                            <TableHead className='text-xs text-right'>Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detailData.recentInvoices.map((inv) => {
                            const isOpen = sheetExpanded.has(inv._id)
                            const totalQty = (inv.items ?? []).reduce((s, i) => s + i.quantity, 0)
                            return (
                              <>
                                {/* Invoice row */}
                                <TableRow
                                  key={inv._id}
                                  className='cursor-pointer hover:bg-muted/40 transition-colors'
                                  onClick={() => toggleSheetRow(inv._id)}
                                >
                                  <TableCell className='pl-3'>
                                    <Button variant='ghost' size='icon' className='h-6 w-6 p-0'>
                                      {isOpen
                                        ? <ChevronDown className='h-3.5 w-3.5' />
                                        : <ChevronRight className='h-3.5 w-3.5' />}
                                    </Button>
                                  </TableCell>
                                  <TableCell className='font-mono font-semibold text-primary text-xs py-2.5'>
                                    {inv.invoiceNumber}
                                  </TableCell>
                                  <TableCell className='text-xs text-muted-foreground py-2.5'>
                                    {format(new Date(inv.date), 'dd MMM yyyy')}
                                  </TableCell>
                                  <TableCell className='text-xs font-medium py-2.5'>
                                    {inv.customerName || 'Walk-in'}
                                    {inv.customerPhone && (
                                      <span className='block text-muted-foreground font-normal'>
                                        {inv.customerPhone}
                                      </span>
                                    )}
                                  </TableCell>
                                  <TableCell className='py-2.5'>
                                    <span
                                      className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize'
                                      style={{
                                        backgroundColor: `${PAYMENT_COLORS[inv.paymentMethod] ?? '#94a3b8'}20`,
                                        color: PAYMENT_COLORS[inv.paymentMethod] ?? '#94a3b8',
                                      }}
                                    >
                                      {paymentLabel[inv.paymentMethod] ?? inv.paymentMethod}
                                    </span>
                                  </TableCell>
                                  <TableCell className='text-right text-xs py-2.5'>{totalQty}</TableCell>
                                  <TableCell className='text-right font-semibold text-xs py-2.5'>
                                    {fmt(inv.totalAmount)}
                                  </TableCell>
                                </TableRow>

                                {/* Expanded service lines */}
                                {isOpen && (inv.items ?? []).map((item, idx) => (
                                  <TableRow key={`${inv._id}-${idx}`} className='bg-muted/20'>
                                    <TableCell />
                                    <TableCell colSpan={3} className='pl-8 text-xs text-muted-foreground py-2'>
                                      <span className='font-medium text-foreground'>{item.serviceName}</span>
                                    </TableCell>
                                    <TableCell />
                                    <TableCell className='text-right text-xs py-2'>×{item.quantity}</TableCell>
                                    <TableCell className='text-right text-xs font-medium py-2'>
                                      {fmt(item.total)}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </>
                            )
                          })}
                        </TableBody>

                        {/* Totals footer */}
                        <TableFooter>
                          <TableRow className='bg-muted font-bold'>
                            <TableCell />
                            <TableCell colSpan={2} className='text-xs uppercase tracking-wide'>Total</TableCell>
                            <TableCell className='text-xs'>
                              {detailData.recentInvoices.length} invoice{detailData.recentInvoices.length !== 1 ? 's' : ''}
                            </TableCell>
                            <TableCell />
                            <TableCell className='text-right text-xs'>
                              {detailData.recentInvoices.reduce(
                                (s, inv) => s + (inv.items ?? []).reduce((is, i) => is + i.quantity, 0),
                                0,
                              )} items
                            </TableCell>
                            <TableCell className='text-right text-sm text-primary'>
                              {fmt(detailData.recentInvoices.reduce((s, inv) => s + inv.totalAmount, 0))}
                            </TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>

                    {detailData.recentInvoices.length >= 25 && (
                      <p className='text-xs text-center text-muted-foreground mt-2'>
                        Showing latest 25 invoices
                      </p>
                    )}
                  </>
                )}
              </>
            )}
          </SheetContent>
        </Sheet>

      </div>
    )
  },
)

ServiceReport.displayName = 'ServiceReport'
