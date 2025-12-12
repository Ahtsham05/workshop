import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGetInventoryReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useState, forwardRef, useImperativeHandle } from 'react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'

export const InventoryReport = forwardRef<{ exportToExcel: () => void }, {}>((_, ref) => {
  const { t } = useLanguage()
  const [status, setStatus] = useState<string>('all')
  const { data, isLoading } = useGetInventoryReportQuery({ status: status === 'all' ? '' : status })

  useImperativeHandle(ref, () => ({
    exportToExcel: () => {
      try {
        if (!data?.data || data.data.length === 0) {
          toast.error(t('No data available to export'))
          return
        }

        const excelData = data.data.map((product) => ({
          [t('product')]: product.name,
          [t('barcode')]: product.barcode || 'N/A',
          [t('category')]: product.category,
          [t('stock')]: product.stockQuantity,
          [t('value')]: product.stockValue,
          [t('status')]: product.status,
        }))

        const ws = XLSX.utils.json_to_sheet(excelData)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Inventory Report')
        XLSX.writeFile(wb, `inventory-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
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
            <div className='text-2xl font-bold'>{data?.summary?.totalProducts || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>{t('stock_value')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{formatCurrency(data?.summary?.totalStockValue || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>{t('low_stock')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-orange-600'>{data?.summary?.lowStockCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>{t('out_of_stock')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>{data?.summary?.outOfStockCount || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className='flex justify-between items-center'>
            <CardTitle>{t('inventory_details')}</CardTitle>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className='w-[180px]'>
                <SelectValue placeholder={t('all_products')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('all_products')}</SelectItem>
                <SelectItem value='low'>{t('low_stock')}</SelectItem>
                <SelectItem value='out'>{t('out_of_stock')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('product')}</TableHead>
                <TableHead>{t('barcode')}</TableHead>
                <TableHead>{t('category')}</TableHead>
                <TableHead className='text-right'>{t('stock')}</TableHead>
                <TableHead className='text-right'>{t('value')}</TableHead>
                <TableHead>{t('status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data?.map((product) => (
                <TableRow key={product._id}>
                  <TableCell className='font-medium'>{product.name}</TableCell>
                  <TableCell>{product.barcode || 'N/A'}</TableCell>
                  <TableCell>{product.category}</TableCell>
                  <TableCell className='text-right'>{product.stockQuantity} {product.unit || 'pcs'}</TableCell>
                  <TableCell className='text-right'>{formatCurrency(product.stockValue)}</TableCell>
                  <TableCell>
                    <Badge 
                      variant={
                        product.status === 'Out of Stock' ? 'destructive' : 
                        product.status === 'Low Stock' ? 'secondary' : 'default'
                      }
                    >
                      {product.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
})

InventoryReport.displayName = 'InventoryReport'