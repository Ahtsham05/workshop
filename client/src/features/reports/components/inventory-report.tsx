import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGetInventoryReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useState, forwardRef, useImperativeHandle, Fragment } from 'react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { kpiCardClass } from '@/lib/stat-card-tones'
import { reportEntityName, reportEntityNameClass } from '../utils/report-entity-name'
import { expiryBadge } from '../utils/expiry-badge'
import { cn } from '@/lib/utils'

export const InventoryReport = forwardRef<{ exportToExcel: () => void }, {}>((_, ref) => {
  const { t, language } = useLanguage()
  const [status, setStatus] = useState<string>('all')
  const { data, isLoading } = useGetInventoryReportQuery({ status: status === 'all' ? '' : status })
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  useImperativeHandle(ref, () => ({
    exportToExcel: () => {
      try {
        if (!data?.data || data.data.length === 0) {
          toast.error(t('No data available to export'))
          return
        }

        const excelData = data.data.map((product) => ({
          [t('product')]: reportEntityName(language, product.name, product.nameUrdu),
          [t('barcode')]: product.barcode || 'N/A',
          [t('category')]: product.category,
          [t('stock')]: product.stockQuantity,
          [t('value')]: product.stockValue,
          [t('status')]: product.status,
          Batches: product.batches?.length || 0,
        }))

        const ws = XLSX.utils.json_to_sheet(excelData)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Inventory Report')

        const batchRows = data.data.flatMap((product) =>
          (product.batches || []).map((b) => ({
            [t('product')]: reportEntityName(language, product.name, product.nameUrdu),
            'Batch #': b.batchNumber,
            Quantity: b.quantity,
            'Cost/unit': b.costPerUnit,
            'Selling price': b.sellingPrice ?? '',
            Expiry: b.expiryDate ? format(new Date(b.expiryDate), 'yyyy-MM-dd') : '',
          })),
        )
        if (batchRows.length > 0) {
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(batchRows), 'Batches')
        }
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
        <Card className={kpiCardClass('sky')}>
          <CardHeader>
            <CardTitle className='text-sm'>{t('total_products')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{data?.summary?.totalProducts || 0}</div>
          </CardContent>
        </Card>
        <Card className={kpiCardClass('violet')}>
          <CardHeader>
            <CardTitle className='text-sm'>{t('stock_value')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{formatCurrency(data?.summary?.totalStockValue || 0)}</div>
          </CardContent>
        </Card>
        <Card className={kpiCardClass('amber')}>
          <CardHeader>
            <CardTitle className='text-sm'>{t('low_stock')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-orange-600'>{data?.summary?.lowStockCount || 0}</div>
          </CardContent>
        </Card>
        <Card className={kpiCardClass('rose')}>
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
                <TableHead className='w-8' />
                <TableHead>{t('product')}</TableHead>
                <TableHead>{t('barcode')}</TableHead>
                <TableHead>{t('category')}</TableHead>
                <TableHead className='text-right'>{t('stock')}</TableHead>
                <TableHead className='text-right'>{t('value')}</TableHead>
                <TableHead>{t('status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data?.map((product) => {
                const label = reportEntityName(language, product.name, product.nameUrdu)
                const hasBatches = (product.batches?.length || 0) > 0
                const isOpen = expandedRows.has(product._id)
                return (
                <Fragment key={product._id}>
                  <TableRow
                    className={hasBatches ? 'cursor-pointer hover:bg-muted/30' : undefined}
                    onClick={() => hasBatches && toggleRow(product._id)}
                  >
                    <TableCell className='w-8'>
                      {hasBatches && (
                        <Button variant='ghost' size='icon' className='h-6 w-6'>
                          {isOpen ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className={cn('font-medium', reportEntityNameClass(language, label))}>
                      {label}
                      {hasBatches && (
                        <span className='ml-2 text-xs text-muted-foreground'>
                          ({product.batches!.length} {product.batches!.length === 1 ? 'batch' : 'batches'})
                        </span>
                      )}
                    </TableCell>
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
                  {isOpen && hasBatches && (
                    <TableRow className='bg-muted/20'>
                      <TableCell />
                      <TableCell colSpan={6} className='py-2'>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className='h-7 text-xs'>Batch #</TableHead>
                              <TableHead className='h-7 text-right text-xs'>Qty</TableHead>
                              <TableHead className='h-7 text-right text-xs'>Cost/unit</TableHead>
                              <TableHead className='h-7 text-right text-xs'>Selling price</TableHead>
                              <TableHead className='h-7 text-xs'>Expiry</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {product.batches!.map((b, idx) => (
                              <TableRow key={`${product._id}-batch-${idx}`}>
                                <TableCell className='py-1.5 font-mono text-xs'>{b.batchNumber}</TableCell>
                                <TableCell className='py-1.5 text-right text-xs'>{b.quantity}</TableCell>
                                <TableCell className='py-1.5 text-right text-xs'>{formatCurrency(b.costPerUnit)}</TableCell>
                                <TableCell className='py-1.5 text-right text-xs'>
                                  {b.sellingPrice != null ? formatCurrency(b.sellingPrice) : '—'}
                                </TableCell>
                                <TableCell className='py-1.5'>{expiryBadge(b.expiryDate)}</TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
})

InventoryReport.displayName = 'InventoryReport'