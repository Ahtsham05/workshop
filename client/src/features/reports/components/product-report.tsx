import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGetProductReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'
import { forwardRef, useImperativeHandle, useState } from 'react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ProductDetailDialog } from './product-detail-dialog'

interface ProductReportProps {
  startDate: string
  endDate: string
}

export const ProductReport = forwardRef<{ exportToExcel: () => void }, ProductReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const { data, isLoading } = useGetProductReportQuery({ startDate, endDate })
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null)

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data?.data || data.data.length === 0) {
            toast.error(t('No data available to export'))
            return
          }

          const excelData = data.data.map((product) => ({
            [t('product')]: product.productName,
            [t('category')]: product.category || 'N/A',
            [t('quantity_sold')]: product.totalQuantitySold,
            [t('revenue')]: product.totalRevenue,
            [t('profit')]: product.totalProfit,
            [t('current_stock')]: product.currentStock,
          }))

          const ws = XLSX.utils.json_to_sheet(excelData)
          const wb = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(wb, ws, 'Product Report')
          XLSX.writeFile(wb, `product-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch (error) {
          console.error('Export error:', error)
          toast.error(t('Failed to export data'))
        }
      },
    }))

    if (isLoading) return <Skeleton className='h-[400px] w-full' />

    const formatCurrency = (value: number) => 
      new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(value)

    return (
      <div className='space-y-6'>
        <div className='grid gap-4 md:grid-cols-4'>
          <Card>
            <CardHeader>
              <CardTitle className='text-sm'>{t('total_products')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{data?.stockSummary?.totalProducts || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className='text-sm'>{t('stock_value')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{formatCurrency(data?.stockSummary?.totalStockValue || 0)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className='text-sm'>{t('low_stock')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-orange-600'>{data?.stockSummary?.lowStockProducts || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className='text-sm'>{t('out_of_stock')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-red-600'>{data?.stockSummary?.outOfStockProducts || 0}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('top_selling_products')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('product')}</TableHead>
                  <TableHead className='text-right'>{t('quantity_sold')}</TableHead>
                  <TableHead className='text-right'>{t('revenue')}</TableHead>
                  <TableHead className='text-right'>{t('profit')}</TableHead>
                  <TableHead className='text-right'>{t('current_stock')}</TableHead>
                  <TableHead className='text-right'>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.data?.map((product) => (
                  <TableRow key={product._id}>
                    <TableCell className='font-medium'>{product.productName}</TableCell>
                    <TableCell className='text-right'>{product.totalQuantitySold} {product.unit || 'pcs'}</TableCell>
                    <TableCell className='text-right'>{formatCurrency(product.totalRevenue)}</TableCell>
                    <TableCell className='text-right text-green-600'>{formatCurrency(product.totalProfit)}</TableCell>
                    <TableCell className='text-right'>
                      <Badge variant={product.currentStock === 0 ? 'destructive' : product.currentStock <= 10 ? 'secondary' : 'default'}>
                        {product.currentStock} {product.unit || 'pcs'}
                      </Badge>
                    </TableCell>
                    <TableCell className='text-right'>
                      <Button
                        variant='ghost'
                        size='sm'
                        onClick={() => setSelectedProductId(product._id)}
                      >
                        <Eye className='h-4 w-4' />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <ProductDetailDialog
          productId={selectedProductId}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setSelectedProductId(null)}
        />
      </div>
    )
  }
)
