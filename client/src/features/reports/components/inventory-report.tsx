import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGetInventoryReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useState, useMemo, forwardRef, useImperativeHandle, Fragment } from 'react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronsDownUp,
  Boxes,
  Wallet,
  AlertTriangle,
  PackageX,
  PackageCheck,
  ScanLine,
  Layers,
} from 'lucide-react'
import { reportEntityName } from '../utils/report-entity-name'
import { ReportProductNameCell } from './report-product-name-cell'
import { expiryBadge } from '../utils/expiry-badge'
import { MovementTile } from './movement-tile'

const STOCK_STATUS_STYLES: Record<string, string> = {
  'Out of Stock':
    'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-400',
  'Low Stock':
    'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400',
  'In Stock':
    'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-400',
}

const STOCK_STATUS_ICON: Record<string, typeof PackageX> = {
  'Out of Stock': PackageX,
  'Low Stock': AlertTriangle,
  'In Stock': PackageCheck,
}

function StockStatusBadge({ status }: { status: string }) {
  const Icon = STOCK_STATUS_ICON[status] || PackageCheck
  return (
    <Badge variant='outline' className={STOCK_STATUS_STYLES[status] || ''}>
      <Icon className='h-3 w-3' />
      {status}
    </Badge>
  )
}

export const InventoryReport = forwardRef<{ exportToExcel: () => void }, {}>((_, ref) => {
  const { t, language } = useLanguage()
  const [status, setStatus] = useState<string>('all')
  const { data, isFetching: isLoading } = useGetInventoryReportQuery({ status: status === 'all' ? '' : status })
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const expandableIds = useMemo(
    () =>
      (data?.data ?? [])
        .filter((p) => (p.batches?.length || 0) > 0 || ((p.trackImei || p.trackSerial) && (p.imeis?.length || 0) > 0))
        .map((p) => p._id),
    [data?.data]
  )
  const allExpanded = expandableIds.length > 0 && expandableIds.every((id) => expandedRows.has(id))
  const toggleAllRows = () => setExpandedRows(allExpanded ? new Set() : new Set(expandableIds))

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
          'Cost/unit': product.cost,
          'Sale Price': product.price,
          [t('value')]: product.stockValue,
          'Potential Revenue': product.potentialRevenue,
          [t('status')]: product.status,
          Batches: product.batches?.length || 0,
          'IMEI/Serial Available': product.trackImei || product.trackSerial ? product.imeisTotalCount : '',
        }))

        const ws = XLSX.utils.json_to_sheet(excelData)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Stock Report')

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

        const imeiRows = data.data.flatMap((product) =>
          (product.imeis || []).map((imei) => ({
            [t('product')]: reportEntityName(language, product.name, product.nameUrdu),
            'IMEI/Serial': imei,
          })),
        )
        if (imeiRows.length > 0) {
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(imeiRows), 'IMEI-Serial')
        }

        XLSX.writeFile(wb, `stock-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
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
      <div className='grid gap-3 grid-cols-2 lg:grid-cols-4'>
        <MovementTile icon={Boxes} tone='sky' label={t('total_products')} value={String(data?.summary?.totalProducts || 0)} />
        <MovementTile icon={Wallet} tone='violet' label={t('stock_value')} value={formatCurrency(data?.summary?.totalStockValue || 0)} />
        <MovementTile icon={AlertTriangle} tone='amber' label={t('low_stock')} value={String(data?.summary?.lowStockCount || 0)} />
        <MovementTile icon={PackageX} tone='rose' label={t('out_of_stock')} value={String(data?.summary?.outOfStockCount || 0)} />
      </div>

      <Card>
        <CardHeader>
          <div className='flex flex-wrap justify-between items-center gap-2'>
            <CardTitle>{t('Stock Details')}</CardTitle>
            <div className='flex items-center gap-2'>
              {expandableIds.length > 0 && (
                <Button variant='outline' size='sm' onClick={toggleAllRows}>
                  {allExpanded ? (
                    <ChevronsDownUp className='h-4 w-4 mr-2' />
                  ) : (
                    <ChevronsUpDown className='h-4 w-4 mr-2' />
                  )}
                  {allExpanded ? t('Collapse All') : t('Expand All')}
                </Button>
              )}
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
          </div>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='w-8' />
                <TableHead className='min-w-[180px]'>{t('product')}</TableHead>
                <TableHead className='min-w-[100px]'>{t('barcode')}</TableHead>
                <TableHead className='min-w-[100px]'>{t('category')}</TableHead>
                <TableHead className='text-right min-w-[80px]'>{t('stock')}</TableHead>
                <TableHead className='text-right min-w-[100px]'>Cost/unit</TableHead>
                <TableHead className='text-right min-w-[100px]'>Sale Price</TableHead>
                <TableHead className='text-right min-w-[100px]'>{t('value')}</TableHead>
                <TableHead className='min-w-[100px]'>{t('status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data?.map((product) => {
                const hasBatches = (product.batches?.length || 0) > 0
                const isSerialized = product.trackImei || product.trackSerial
                const hasImeis = isSerialized && (product.imeis?.length || 0) > 0
                const isExpandable = hasBatches || hasImeis
                const isOpen = expandedRows.has(product._id)
                return (
                <Fragment key={product._id}>
                  <TableRow
                    className={isExpandable ? 'cursor-pointer hover:bg-muted/30' : undefined}
                    onClick={() => isExpandable && toggleRow(product._id)}
                  >
                    <TableCell className='w-8'>
                      {isExpandable && (
                        <Button variant='ghost' size='icon' className='h-6 w-6'>
                          {isOpen ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}
                        </Button>
                      )}
                    </TableCell>
                    <TableCell className='font-medium max-w-[220px]'>
                      <ReportProductNameCell
                        nameEn={product.name}
                        nameUrdu={product.nameUrdu}
                        suffix={
                          <>
                            {hasBatches && (
                              <span className='shrink-0 text-xs text-muted-foreground'>
                                ({product.batches!.length} {product.batches!.length === 1 ? 'batch' : 'batches'})
                              </span>
                            )}
                            {isSerialized && (
                              <span className='shrink-0 inline-flex items-center gap-1 rounded-full border border-indigo-300 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-400'>
                                <ScanLine className='h-2.5 w-2.5' />
                                {product.imeisTotalCount} {product.trackSerial ? t('Serial') : 'IMEI'}
                              </span>
                            )}
                          </>
                        }
                      />
                    </TableCell>
                    <TableCell className='font-mono text-xs text-muted-foreground'>{product.barcode || 'N/A'}</TableCell>
                    <TableCell>
                      {product.category && product.category !== 'N/A' ? (
                        <Badge variant='outline' className='font-normal text-muted-foreground'>
                          {product.category}
                        </Badge>
                      ) : (
                        <span className='text-xs italic text-muted-foreground'>N/A</span>
                      )}
                    </TableCell>
                    <TableCell className='text-right'>
                      <span className='font-semibold tabular-nums'>{product.stockQuantity}</span>{' '}
                      <span className='text-xs text-muted-foreground'>{product.unit || 'pcs'}</span>
                    </TableCell>
                    <TableCell className='text-right text-sm text-muted-foreground tabular-nums'>{formatCurrency(product.cost)}</TableCell>
                    <TableCell className='text-right text-sm text-muted-foreground tabular-nums'>{formatCurrency(product.price)}</TableCell>
                    <TableCell className='text-right font-semibold tabular-nums'>{formatCurrency(product.stockValue)}</TableCell>
                    <TableCell>
                      <StockStatusBadge status={product.status} />
                    </TableCell>
                  </TableRow>
                  {isOpen && hasBatches && (
                    <TableRow className='bg-muted/10 hover:bg-muted/10'>
                      <TableCell />
                      <TableCell colSpan={8} className='py-3'>
                        <div className='overflow-hidden rounded-lg border bg-background shadow-sm'>
                          <div className='flex items-center gap-2 border-b bg-muted/40 px-3 py-2'>
                            <Layers className='h-3.5 w-3.5 text-blue-600' />
                            <span className='text-xs font-semibold text-muted-foreground'>
                              {t('Batch Breakdown')} · {product.batches!.length}{' '}
                              {product.batches!.length === 1 ? t('batch') : t('batches')}
                            </span>
                          </div>
                          <Table>
                            <TableHeader>
                              <TableRow className='hover:bg-transparent'>
                                <TableHead className='h-8 text-xs'>Batch #</TableHead>
                                <TableHead className='h-8 text-right text-xs'>Qty</TableHead>
                                <TableHead className='h-8 text-right text-xs'>Cost/unit</TableHead>
                                <TableHead className='h-8 text-right text-xs'>Selling price</TableHead>
                                <TableHead className='h-8 text-right text-xs'>Value</TableHead>
                                <TableHead className='h-8 text-xs'>Expiry</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {product.batches!.map((b, idx) => (
                                <TableRow key={`${product._id}-batch-${idx}`}>
                                  <TableCell className='py-1.5 font-mono text-xs'>{b.batchNumber}</TableCell>
                                  <TableCell className='py-1.5 text-right text-xs tabular-nums'>{b.quantity}</TableCell>
                                  <TableCell className='py-1.5 text-right text-xs tabular-nums'>{formatCurrency(b.costPerUnit)}</TableCell>
                                  <TableCell className='py-1.5 text-right text-xs tabular-nums'>
                                    {b.sellingPrice != null ? formatCurrency(b.sellingPrice) : '—'}
                                  </TableCell>
                                  <TableCell className='py-1.5 text-right text-xs font-medium tabular-nums'>
                                    {formatCurrency(b.value)}
                                  </TableCell>
                                  <TableCell className='py-1.5'>{expiryBadge(b.expiryDate)}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                            <TableFooter>
                              <TableRow className='hover:bg-muted/50'>
                                <TableCell className='py-1.5 text-xs font-semibold'>{t('Total')}</TableCell>
                                <TableCell className='py-1.5 text-right text-xs font-semibold tabular-nums'>
                                  {product.batches!.reduce((sum, b) => sum + b.quantity, 0)}
                                </TableCell>
                                <TableCell />
                                <TableCell />
                                <TableCell className='py-1.5 text-right text-xs font-semibold tabular-nums'>
                                  {formatCurrency(product.batches!.reduce((sum, b) => sum + b.value, 0))}
                                </TableCell>
                                <TableCell />
                              </TableRow>
                            </TableFooter>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {isOpen && hasImeis && (
                    <TableRow className='bg-muted/10 hover:bg-muted/10'>
                      <TableCell />
                      <TableCell colSpan={8} className='py-3'>
                        <div className='overflow-hidden rounded-lg border bg-background shadow-sm'>
                          <div className='flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2'>
                            <div className='flex items-center gap-2'>
                              <ScanLine className='h-3.5 w-3.5 text-indigo-600' />
                              <span className='text-xs font-semibold text-muted-foreground'>
                                {product.trackSerial ? t('Serial Numbers') : 'IMEI Numbers'} {t('available')} · {product.imeisTotalCount}
                              </span>
                            </div>
                            {product.imeisTotalCount > (product.imeis?.length || 0) && (
                              <span className='text-xs text-muted-foreground'>
                                {t('Showing {{shown}} of {{total}}', { shown: product.imeis!.length, total: product.imeisTotalCount })}
                              </span>
                            )}
                          </div>
                          <div className='flex flex-wrap gap-1.5 p-3'>
                            {product.imeis!.map((imei) => (
                              <span
                                key={imei}
                                className='rounded-full border bg-muted/40 px-2 py-0.5 font-mono text-[11px] text-muted-foreground'
                              >
                                {imei}
                              </span>
                            ))}
                          </div>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
                )
              })}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
})

InventoryReport.displayName = 'InventoryReport'
