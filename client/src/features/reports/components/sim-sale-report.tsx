import { forwardRef, useImperativeHandle, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table'
import { useGetSimSaleReportQuery, useLazyGetSimSaleReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { Smartphone, TrendingUp, CircleDollarSign, Wallet, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { reportEntityName, reportEntityNameClass } from '../utils/report-entity-name'

interface SimSaleReportProps {
  startDate: string
  endDate: string
}

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#94a3b8',
]

export const SimSaleReport = forwardRef<{ exportToExcel: () => void }, SimSaleReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t, language } = useLanguage()
    const { data, isLoading, isError } = useGetSimSaleReportQuery({ startDate, endDate })
    const [fetchProductDetail] = useLazyGetSimSaleReportQuery()

    const [sheetOpen, setSheetOpen] = useState(false)
    const [activeProduct, setActiveProduct] = useState<string | null>(null)
    const [detailData, setDetailData] = useState<any[]>([])
    const [detailLoading, setDetailLoading] = useState(false)

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data) { toast.error(t('No data available to export')); return }
          const wb = XLSX.utils.book_new()

          const summaryData = [
            { Metric: 'Total Sales', Value: data.summary.totalSales },
            { Metric: 'Total SIM Amount', Value: data.summary.totalSimAmount },
            { Metric: 'Total Load Amount', Value: data.summary.totalLoadAmount },
            { Metric: 'Total Purchase Amount', Value: data.summary.totalPurchaseAmount },
            { Metric: 'Total Sale Amount', Value: data.summary.totalSaleAmount },
            { Metric: 'Total Commission', Value: data.summary.totalCommission },
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary')

          if (data.byProduct.length > 0) {
            const prodData = data.byProduct.map(r => ({
              Product: reportEntityName(language, r._id, r.productNameUrdu),
              Count: r.count,
              'Sale Amount': r.totalSaleAmount,
              'SIM Amount': r.totalSimAmount,
              'Load Amount': r.totalLoadAmount,
              Commission: r.totalCommission,
              'Avg Sale': r.count ? r.totalSaleAmount / r.count : 0,
              Share: data.summary.totalSaleAmount
                ? `${((r.totalSaleAmount / data.summary.totalSaleAmount) * 100).toFixed(1)}%`
                : '0%',
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prodData), 'By Product')
          }

          if (data.datewise.length > 0) {
            const dwData = data.datewise.map(r => ({
              Date: r._id,
              Sales: r.count,
              'Sale Amount': r.totalSaleAmount,
              'Load Amount': r.totalLoadAmount,
              Commission: r.totalCommission,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dwData), 'Date-wise')
          }

          if (data.recentSales.length > 0) {
            const salesData = data.recentSales.map(r => ({
              Product: reportEntityName(language, r.productName, r.productNameUrdu),
              Customer: reportEntityName(language, r.customerName ?? '', r.customerNameUrdu),
              Mobile: r.customerMobile ?? '',
              CNIC: r.customerCNIC ?? '',
              'SIM Amount': r.simAmount,
              'Load Amount': r.loadAmount,
              'Sale Amount': r.saleAmount,
              Commission: r.commission,
              'Payment Method': r.paymentMethod ?? '',
              'Payment Wallet': r.paymentWalletType ?? '',
              Wallet: r.walletType ?? '',
              Date: r.date,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesData), 'Recent Sales')
          }

          XLSX.writeFile(wb, `sim-sale-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch {
          toast.error(t('Failed to export data'))
        }
      },
    }))

    const openProductDetail = useCallback(
      async (productName: string) => {
        setActiveProduct(productName)
        setSheetOpen(true)
        setDetailLoading(true)
        try {
          const result = await fetchProductDetail({
            startDate,
            endDate,
            productName,
          }).unwrap()
          setDetailData(result.productSales || [])
        } catch {
          toast.error(t('Failed to load data'))
        } finally {
          setDetailLoading(false)
        }
      },
      [fetchProductDetail, startDate, endDate, t],
    )

    if (isLoading) return <Skeleton className='h-[400px] w-full' />
    if (isError) {
      return (
        <div className='rounded-md border border-destructive/30 p-8 text-center text-destructive'>
          Failed to load sim sale report. Please refresh and try again.
        </div>
      )
    }

    const fmt = (v: number) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(v)
    const s = data ? data.summary : null
    const products = data?.byProduct || []
    const totalSaleAmount = s?.totalSaleAmount || 0
    const detailTotal = detailData.reduce((sum, row) => sum + (row.saleAmount || 0), 0)
    const detailCommission = detailData.reduce((sum, row) => sum + (row.commission || 0), 0)

    return (
      <div className='space-y-6'>
        {/* Summary cards */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <Card className={kpiCardClass('violet')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Sales</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('violet'))}>
                <Smartphone className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{s ? s.totalSales : 0}</div>
              <p className='text-xs text-muted-foreground'>SIMs sold in period</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('sky')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Sale Amount</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('sky'))}>
                <CircleDollarSign className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-blue-600'>{fmt(s ? s.totalSaleAmount : 0)}</div>
              <p className='text-xs text-muted-foreground'>charged to customers</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('orange')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Load Deducted</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('orange'))}>
                <Wallet className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-orange-600'>{fmt(s ? s.totalLoadAmount : 0)}</div>
              <p className='text-xs text-muted-foreground'>deducted from wallets</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('emerald')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Commission</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('emerald'))}>
                <TrendingUp className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(s ? s.totalCommission : 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(s ? s.totalCommission : 0)}
              </div>
              <p className='text-xs text-muted-foreground'>sale minus purchase cost</p>
            </CardContent>
          </Card>
        </div>

        {/* Additional summary row */}
        <div className='grid gap-4 sm:grid-cols-2'>
          <Card className={kpiCardClass('indigo')}>
            <CardHeader>
              <CardTitle className='text-sm font-medium'>SIM Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-xl font-bold'>{fmt(s ? s.totalSimAmount : 0)}</div>
              <p className='text-xs text-muted-foreground'>total SIM purchase cost</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('rose')}>
            <CardHeader>
              <CardTitle className='text-sm font-medium'>Total Purchase Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-xl font-bold text-red-600'>{fmt(s ? s.totalPurchaseAmount : 0)}</div>
              <p className='text-xs text-muted-foreground'>SIM + Load combined cost</p>
            </CardContent>
          </Card>
        </div>

        {/* Product-wise cards */}
        {products.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('sim_sale_by_product')}</CardTitle>
              <p className='text-sm text-muted-foreground'>
                {t('Click a product to view its details')}
              </p>
            </CardHeader>
            <CardContent>
              <div className='grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
                {products.map((product, idx) => {
                  const productLabel = reportEntityName(language, product._id, product.productNameUrdu)
                  const share = totalSaleAmount
                    ? ((product.totalSaleAmount / totalSaleAmount) * 100).toFixed(1)
                    : '0'
                  const avgSale = product.count ? product.totalSaleAmount / product.count : 0
                  const color = COLORS[idx % COLORS.length]
                  return (
                    <button
                      key={product._id}
                      type='button'
                      onClick={() => openProductDetail(product._id)}
                      className='text-left rounded-xl border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/50 transition-all group'
                    >
                      <div className='flex items-center justify-between mb-3'>
                        <span
                          className='inline-flex h-8 w-8 items-center justify-center rounded-lg text-white text-xs font-bold'
                          style={{ backgroundColor: color }}
                        >
                          {productLabel.charAt(0).toUpperCase()}
                        </span>
                        <Badge variant='secondary' className='text-xs'>{share}%</Badge>
                      </div>
                      <p className={cn('font-semibold text-sm leading-tight mb-0.5', reportEntityNameClass(language, productLabel))}>
                        {productLabel}
                      </p>
                      <p className='text-xl font-bold' style={{ color }}>{fmt(product.totalSaleAmount)}</p>
                      <div className='mt-2 flex items-center justify-between text-xs text-muted-foreground'>
                        <span>{product.count} {t('entries')}</span>
                        <span>{t('avg')} {fmt(avgSale)}</span>
                      </div>
                      <div className='mt-2 text-xs text-green-600 font-medium'>
                        {t('Commission')}: {fmt(product.totalCommission)}
                      </div>
                      <div className='mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden'>
                        <div
                          className='h-full rounded-full transition-all'
                          style={{ width: `${share}%`, backgroundColor: color }}
                        />
                      </div>
                      <p className='mt-1.5 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity'>
                        {t('Click to view details →')}
                      </p>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Date-wise table */}
        {data && data.datewise.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Date-wise Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className='text-right'>Sales</TableHead>
                    <TableHead className='text-right'>Sale Amount</TableHead>
                    <TableHead className='text-right'>Load Deducted</TableHead>
                    <TableHead className='text-right'>Commission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.datewise.map(row => (
                    <TableRow key={row._id}>
                      <TableCell>{row._id}</TableCell>
                      <TableCell className='text-right'>{row.count}</TableCell>
                      <TableCell className='text-right'>{fmt(row.totalSaleAmount)}</TableCell>
                      <TableCell className='text-right'>{fmt(row.totalLoadAmount)}</TableCell>
                      <TableCell className='text-right text-green-600'>{fmt(row.totalCommission)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {data && data.byWallet.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Load by Wallet</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet</TableHead>
                    <TableHead className='text-right'>Transactions</TableHead>
                    <TableHead className='text-right'>Total Load Deducted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byWallet.map(row => (
                    <TableRow key={row._id}>
                      <TableCell className='font-medium'>{row._id}</TableCell>
                      <TableCell className='text-right'>{row.count}</TableCell>
                      <TableCell className='text-right'>{fmt(row.totalLoadAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Recent Sales */}
        {data && data.recentSales.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Sales</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Number</TableHead>
                    <TableHead>CNIC</TableHead>
                    <TableHead className='text-right'>SIM Amt</TableHead>
                    <TableHead className='text-right'>Load Amt</TableHead>
                    <TableHead className='text-right'>Sale Amt</TableHead>
                    <TableHead className='text-right'>Commission</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Payment Wallet</TableHead>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentSales.map(row => {
                    const prod = reportEntityName(language, row.productName, row.productNameUrdu)
                    const cust = reportEntityName(language, row.customerName ?? '', row.customerNameUrdu)
                    return (
                    <TableRow key={row._id}>
                      <TableCell className={cn('font-medium', reportEntityNameClass(language, prod))}>{prod}</TableCell>
                      <TableCell className={reportEntityNameClass(language, cust)}>{cust}</TableCell>
                      <TableCell>{row.customerMobile ?? '—'}</TableCell>
                      <TableCell>{row.customerCNIC ?? '—'}</TableCell>
                      <TableCell className='text-right'>{fmt(row.simAmount)}</TableCell>
                      <TableCell className='text-right'>{fmt(row.loadAmount)}</TableCell>
                      <TableCell className='text-right'>{fmt(row.saleAmount)}</TableCell>
                      <TableCell className='text-right text-green-600'>{fmt(row.commission)}</TableCell>
                      <TableCell className='capitalize'>{row.paymentMethod || 'cash'}</TableCell>
                      <TableCell>{row.paymentWalletType || '—'}</TableCell>
                      <TableCell>{row.walletType ?? '—'}</TableCell>
                      <TableCell>{row.date ? format(new Date(row.date), 'dd MMM yyyy') : '—'}</TableCell>
                    </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {!data && !isLoading && (
          <div className='rounded-md border p-8 text-center text-muted-foreground'>
            No sim sale data available for the selected period.
          </div>
        )}

        {/* Product detail sheet */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent side='right' className='w-full sm:max-w-3xl p-0 flex flex-col'>
            <SheetHeader className='px-6 pt-6 pb-4 border-b flex-shrink-0'>
              <div className='flex items-center justify-between'>
                <SheetTitle className='text-lg'>
                  {activeProduct ? reportEntityName(language, activeProduct) : ''} — {t('SIM Sale Details')}
                </SheetTitle>
                <Button variant='ghost' size='icon' onClick={() => setSheetOpen(false)}>
                  <X className='h-4 w-4' />
                </Button>
              </div>
              {!detailLoading && detailData.length > 0 && (
                <p className='text-sm text-muted-foreground mt-2'>
                  {detailData.length} {t('entries')} · {fmt(detailTotal)} {t('total')} · {t('Commission')}: {fmt(detailCommission)}
                </p>
              )}
            </SheetHeader>

            <div className='flex-1 overflow-y-auto px-6 py-4'>
              {detailLoading ? (
                <div className='space-y-2'>
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className='h-12 w-full' />)}
                </div>
              ) : detailData.length === 0 ? (
                <div className='flex flex-col items-center justify-center h-40 text-muted-foreground'>
                  <Smartphone className='h-10 w-10 mb-2 opacity-30' />
                  <p>{t('No sim sales found for this product')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('Date')}</TableHead>
                      <TableHead>{t('Customer')}</TableHead>
                      <TableHead>{t('Number')}</TableHead>
                      <TableHead className='text-right'>SIM Amt</TableHead>
                      <TableHead className='text-right'>Load Amt</TableHead>
                      <TableHead className='text-right'>Sale Amt</TableHead>
                      <TableHead className='text-right'>{t('Commission')}</TableHead>
                      <TableHead>{t('wallet')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailData.map((row, idx) => {
                      const cust = reportEntityName(language, row.customerName ?? '', row.customerNameUrdu)
                      return (
                        <TableRow key={row._id || idx}>
                          <TableCell className='whitespace-nowrap text-sm'>
                            {row.date ? format(new Date(row.date), 'dd MMM yyyy') : '—'}
                          </TableCell>
                          <TableCell className={cn('text-sm', reportEntityNameClass(language, cust))}>
                            {cust || '—'}
                          </TableCell>
                          <TableCell className='text-sm'>{row.customerMobile ?? '—'}</TableCell>
                          <TableCell className='text-right text-sm'>{fmt(row.simAmount || 0)}</TableCell>
                          <TableCell className='text-right text-sm'>{fmt(row.loadAmount || 0)}</TableCell>
                          <TableCell className='text-right text-sm font-semibold'>{fmt(row.saleAmount || 0)}</TableCell>
                          <TableCell className='text-right text-sm text-green-600'>{fmt(row.commission || 0)}</TableCell>
                          <TableCell className='text-sm'>{row.walletType ?? '—'}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={5} className='font-semibold'>{t('Total')}</TableCell>
                      <TableCell className='text-right font-bold'>{fmt(detailTotal)}</TableCell>
                      <TableCell className='text-right font-bold text-green-600'>{fmt(detailCommission)}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </div>

            {!detailLoading && detailData.length > 0 && (
              <div className='border-t px-6 py-4 flex-shrink-0'>
                <div className='flex justify-between items-center text-sm'>
                  <span className='text-muted-foreground'>
                    {format(new Date(startDate), 'dd MMM yyyy')} — {format(new Date(endDate), 'dd MMM yyyy')}
                  </span>
                  <div className='text-right'>
                    <p className='text-xs text-muted-foreground'>{t('Total Sale Amount')}</p>
                    <p className='font-bold text-lg'>{fmt(detailTotal)}</p>
                  </div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    )
  }
)

SimSaleReport.displayName = 'SimSaleReport'
