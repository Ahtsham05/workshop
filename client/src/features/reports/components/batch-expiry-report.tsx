import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGetBatchExpiryReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useMemo, useState, forwardRef, useImperativeHandle } from 'react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Boxes, AlertTriangle, PackageX, Wallet } from 'lucide-react'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { cn } from '@/lib/utils'
import { reportEntityName, reportEntityNameClass } from '../utils/report-entity-name'
import { expiryBadge } from '../utils/expiry-badge'

type ExpiryFilter = 'all' | '30' | '60' | '90' | 'expired'

export const BatchExpiryReport = forwardRef<{ exportToExcel: () => void }, {}>((_, ref) => {
  const { t, language } = useLanguage()
  const [filter, setFilter] = useState<ExpiryFilter>('all')
  // Server-side `days` only filters "expiring within N days" — "expired" and "all"
  // are easiest to apply client-side since both need the full active-batch list anyway.
  const { data, isLoading } = useGetBatchExpiryReportQuery(
    filter !== 'all' && filter !== 'expired' ? { days: Number(filter) } : undefined,
  )

  const rows = useMemo(() => {
    if (!data?.data) return []
    if (filter === 'expired') return data.data.filter((r) => (r.daysUntilExpiry ?? 1) < 0)
    return data.data
  }, [data, filter])

  useImperativeHandle(ref, () => ({
    exportToExcel: () => {
      try {
        if (rows.length === 0) {
          toast.error(t('No data available to export'))
          return
        }
        const excelData = rows.map((r) => ({
          Product: reportEntityName(language, r.productName, r.productNameUrdu),
          Variant: r.variantLabel || '',
          'Batch #': r.batchNumber,
          Quantity: r.quantity,
          'Cost/unit': r.costPerUnit,
          'Selling price': r.sellingPrice ?? '',
          'Batch value': r.batchValue,
          Expiry: r.expiryDate ? format(new Date(r.expiryDate), 'yyyy-MM-dd') : '',
          'Days until expiry': r.daysUntilExpiry ?? '',
          Supplier: r.supplierName || '',
        }))
        const ws = XLSX.utils.json_to_sheet(excelData)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Batch & Expiry')
        XLSX.writeFile(wb, `batch-expiry-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
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
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm'>Active Batches</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('sky'))}>
              <Boxes className='h-4 w-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{data?.summary?.activeBatches || 0}</div>
          </CardContent>
        </Card>
        <Card className={kpiCardClass('violet')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm'>Total Batch Value</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('violet'))}>
              <Wallet className='h-4 w-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{formatCurrency(data?.summary?.totalBatchValue || 0)}</div>
          </CardContent>
        </Card>
        <Card className={kpiCardClass('amber')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm'>Expiring within 30 days</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('amber'))}>
              <AlertTriangle className='h-4 w-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-amber-600'>{data?.summary?.expiringSoonCount || 0}</div>
          </CardContent>
        </Card>
        <Card className={kpiCardClass('rose')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm'>Expired</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('rose'))}>
              <PackageX className='h-4 w-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>{data?.summary?.expiredCount || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className='flex justify-between items-center'>
            <CardTitle>Batches — FEFO order (soonest expiry first)</CardTitle>
            <Select value={filter} onValueChange={(v) => setFilter(v as ExpiryFilter)}>
              <SelectTrigger className='w-[200px]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All active batches</SelectItem>
                <SelectItem value='30'>Expiring within 30 days</SelectItem>
                <SelectItem value='60'>Expiring within 60 days</SelectItem>
                <SelectItem value='90'>Expiring within 90 days</SelectItem>
                <SelectItem value='expired'>Already expired</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Variant</TableHead>
                <TableHead>Batch #</TableHead>
                <TableHead className='text-right'>Qty</TableHead>
                <TableHead className='text-right'>Cost/unit</TableHead>
                <TableHead className='text-right'>Selling price</TableHead>
                <TableHead className='text-right'>Value</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Supplier</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className='text-center py-8 text-muted-foreground'>
                    No batches found
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => {
                  const label = reportEntityName(language, r.productName, r.productNameUrdu)
                  return (
                    <TableRow key={r.id}>
                      <TableCell className={cn('font-medium', reportEntityNameClass(language, label))}>
                        {label}
                      </TableCell>
                      <TableCell className='text-muted-foreground text-sm'>{r.variantLabel || '—'}</TableCell>
                      <TableCell className='font-mono text-xs'>{r.batchNumber}</TableCell>
                      <TableCell className='text-right'>{r.quantity}</TableCell>
                      <TableCell className='text-right'>{formatCurrency(r.costPerUnit)}</TableCell>
                      <TableCell className='text-right'>
                        {r.sellingPrice != null ? formatCurrency(r.sellingPrice) : '—'}
                      </TableCell>
                      <TableCell className='text-right font-medium'>{formatCurrency(r.batchValue)}</TableCell>
                      <TableCell>{expiryBadge(r.expiryDate)}</TableCell>
                      <TableCell className='text-muted-foreground text-sm'>{r.supplierName || '—'}</TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
})

BatchExpiryReport.displayName = 'BatchExpiryReport'
