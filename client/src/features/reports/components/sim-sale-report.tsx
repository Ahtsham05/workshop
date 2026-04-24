import { forwardRef, useImperativeHandle } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGetSimSaleReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { Smartphone, TrendingUp, CircleDollarSign, Wallet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface SimSaleReportProps {
  startDate: string
  endDate: string
}

export const SimSaleReport = forwardRef<{ exportToExcel: () => void }, SimSaleReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const { data, isLoading, isError } = useGetSimSaleReportQuery({ startDate, endDate })

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

          if (data.byProduct.length > 0) {
            const prodData = data.byProduct.map(r => ({
              Product: r._id,
              Count: r.count,
              'Sale Amount': r.totalSaleAmount,
              'SIM Amount': r.totalSimAmount,
              'Load Amount': r.totalLoadAmount,
              Commission: r.totalCommission,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(prodData), 'By Product')
          }

          if (data.recentSales.length > 0) {
            const salesData = data.recentSales.map(r => ({
              Product: r.productName,
              Customer: r.customerName ?? '',
              Mobile: r.customerMobile ?? '',
              'SIM Amount': r.simAmount,
              'Load Amount': r.loadAmount,
              'Sale Amount': r.saleAmount,
              Commission: r.commission,
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

    return (
      <div className='space-y-6'>
        {/* Summary cards */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Sales</CardTitle>
              <Smartphone className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{s ? s.totalSales : 0}</div>
              <p className='text-xs text-muted-foreground'>SIMs sold in period</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Sale Amount</CardTitle>
              <CircleDollarSign className='h-4 w-4 text-blue-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-blue-600'>{fmt(s ? s.totalSaleAmount : 0)}</div>
              <p className='text-xs text-muted-foreground'>charged to customers</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Load Deducted</CardTitle>
              <Wallet className='h-4 w-4 text-orange-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-orange-600'>{fmt(s ? s.totalLoadAmount : 0)}</div>
              <p className='text-xs text-muted-foreground'>deducted from wallets</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Commission</CardTitle>
              <TrendingUp className='h-4 w-4 text-green-500' />
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
          <Card>
            <CardHeader>
              <CardTitle className='text-sm font-medium'>SIM Amount</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-xl font-bold'>{fmt(s ? s.totalSimAmount : 0)}</div>
              <p className='text-xs text-muted-foreground'>total SIM purchase cost</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className='text-sm font-medium'>Total Purchase Cost</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-xl font-bold text-red-600'>{fmt(s ? s.totalPurchaseAmount : 0)}</div>
              <p className='text-xs text-muted-foreground'>SIM + Load combined cost</p>
            </CardContent>
          </Card>
        </div>

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

        {/* By Product table */}
        {data && data.byProduct.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>By Product</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className='text-right'>Count</TableHead>
                    <TableHead className='text-right'>Sale Amount</TableHead>
                    <TableHead className='text-right'>Load Deducted</TableHead>
                    <TableHead className='text-right'>Commission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byProduct.map(row => (
                    <TableRow key={row._id}>
                      <TableCell className='font-medium'>{row._id}</TableCell>
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

        {/* By Wallet */}
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
                    <TableHead className='text-right'>SIM Amt</TableHead>
                    <TableHead className='text-right'>Load Amt</TableHead>
                    <TableHead className='text-right'>Sale Amt</TableHead>
                    <TableHead className='text-right'>Commission</TableHead>
                    <TableHead>Wallet</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentSales.map(row => (
                    <TableRow key={row._id}>
                      <TableCell className='font-medium'>{row.productName}</TableCell>
                      <TableCell>{row.customerName ?? '—'}</TableCell>
                      <TableCell className='text-right'>{fmt(row.simAmount)}</TableCell>
                      <TableCell className='text-right'>{fmt(row.loadAmount)}</TableCell>
                      <TableCell className='text-right'>{fmt(row.saleAmount)}</TableCell>
                      <TableCell className='text-right text-green-600'>{fmt(row.commission)}</TableCell>
                      <TableCell>{row.walletType ?? '—'}</TableCell>
                      <TableCell>{row.date ? format(new Date(row.date), 'dd MMM yyyy') : '—'}</TableCell>
                    </TableRow>
                  ))}
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
      </div>
    )
  }
)

SimSaleReport.displayName = 'SimSaleReport'
