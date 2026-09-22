import { useState, useMemo, Fragment, forwardRef, useImperativeHandle } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import { useGetCustomerAgingReportQuery, AgingReportCustomer } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { useBranchName } from '@/hooks/use-branch-name'
import { buildCustomerBalanceMessage } from '@/utils/sms-messages'
import { format } from 'date-fns'
import { ChevronDown, ChevronRight, CalendarIcon, Wallet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { reportEntityName, reportEntityNameClass } from '../utils/report-entity-name'
import { cn } from '@/lib/utils'
import { useFormatMoney, useCurrencyMeta } from '@/lib/format-money'
import { buildAgingBuckets, AGING_BUCKET_SIZES, DEFAULT_AGING_BUCKET_SIZE, AgingBucketSize } from '../utils/aging-buckets'

export const AgingReport = forwardRef<{ exportToExcel: () => void }, {}>((_, ref) => {
  const { t, language } = useLanguage()
  const branchName = useBranchName()
  const [asOfDate, setAsOfDate] = useState<Date>(() => new Date())
  const [bucketSize, setBucketSize] = useState<AgingBucketSize>(DEFAULT_AGING_BUCKET_SIZE)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const queryAsOfDate = format(asOfDate, 'yyyy-MM-dd')
  const { data, isFetching: isLoading } = useGetCustomerAgingReportQuery({ asOfDate: queryAsOfDate, bucketSize })
  const BUCKETS = useMemo(() => buildAgingBuckets(bucketSize), [bucketSize])

  useImperativeHandle(ref, () => ({
    exportToExcel: () => {
      try {
        if (!data?.data || data.data.length === 0) {
          toast.error(t('No data available to export'))
          return
        }

        const excelData = data.data.map((row) => ({
          [t('customer')]: reportEntityName(language, row.customerName, row.customerNameUrdu),
          [t('phone')]: row.phone || 'N/A',
          [t('Current')]: row.current,
          [BUCKETS[1].label]: row.bucket1,
          [BUCKETS[2].label]: row.bucket2,
          [BUCKETS[3].label]: row.bucket3,
          [BUCKETS[4].label]: row.bucket4,
          [t('total')]: row.totalOutstanding,
        }))

        const ws = XLSX.utils.json_to_sheet(excelData)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Customer Aging Report')
        XLSX.writeFile(wb, `customer-aging-report-${queryAsOfDate}.xlsx`)
        toast.success(t('Data exported successfully'))
      } catch (error) {
        console.error('Export error:', error)
        toast.error(t('Failed to export data'))
      }
    },
  }))

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const formatCurrency = useFormatMoney()
  const { symbol: currencySymbol } = useCurrencyMeta()

  if (isLoading) return <Skeleton className='h-[400px] w-full' />

  const summary = data?.summary
  const rows: AgingReportCustomer[] = data?.data || []

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>{t('Report Settings')}</CardTitle>
          <CardDescription>{t('Aging buckets are calculated against the balance outstanding as of this date, using the selected aging period')}</CardDescription>
        </CardHeader>
        <CardContent className='flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end'>
          <div className='flex flex-col gap-1.5'>
            <span className='text-xs font-medium text-muted-foreground'>{t('As of Date')}</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant='outline' className='w-[240px] justify-start text-left font-normal'>
                  <CalendarIcon className='mr-2 h-4 w-4' />
                  {format(asOfDate, 'PPP')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-auto p-0' align='start'>
                <Calendar
                  mode='single'
                  selected={asOfDate}
                  onSelect={(date) => {
                    if (date) setAsOfDate(date)
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className='flex flex-col gap-1.5'>
            <span className='text-xs font-medium text-muted-foreground'>{t('Aging Period')}</span>
            <Select value={String(bucketSize)} onValueChange={(v) => setBucketSize(Number(v) as AgingBucketSize)}>
              <SelectTrigger className='w-[180px]'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AGING_BUCKET_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size} {t('Days')}{size === DEFAULT_AGING_BUCKET_SIZE ? ` (${t('Default')})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'>
        {BUCKETS.map((b) => {
          const Icon = b.icon
          return (
            <Card key={b.key} className={kpiCardClass(b.tone)}>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className='text-sm font-medium'>{t(b.label)}</CardTitle>
                <div className={cn('shrink-0', toneIconWrapClass(b.tone))}>
                  <Icon className='h-4 w-4' />
                </div>
              </CardHeader>
              <CardContent>
                <div className='text-xl font-bold'>{formatCurrency(summary?.[b.key] || 0)}</div>
              </CardContent>
            </Card>
          )
        })}
        <Card className={kpiCardClass('indigo')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>{t('Total Outstanding')}</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('indigo'))}>
              <Wallet className='h-4 w-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-xl font-bold'>{formatCurrency(summary?.totalOutstanding || 0)}</div>
            <p className='text-xs text-muted-foreground mt-1'>
              {summary?.customersOverdue || 0} {t('of')} {summary?.totalCustomers || 0} {t('customers overdue')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('Customer Aging Detail')}</CardTitle>
          <CardDescription>{t('Click a customer row to see individual outstanding invoices')}</CardDescription>
        </CardHeader>
        <CardContent className='p-0'>
          {rows.length === 0 ? (
            <p className='text-center text-muted-foreground py-10'>{t('No outstanding balances')}</p>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow className='bg-muted/50'>
                    <TableHead className='w-8' />
                    <TableHead>{t('customer')}</TableHead>
                    <TableHead>{t('phone')}</TableHead>
                    <TableHead className='text-right'>{t('Current')}</TableHead>
                    <TableHead className='text-right'>{BUCKETS[1].shortLabel}</TableHead>
                    <TableHead className='text-right'>{BUCKETS[2].shortLabel}</TableHead>
                    <TableHead className='text-right'>{BUCKETS[3].shortLabel}</TableHead>
                    <TableHead className='text-right'>{BUCKETS[4].shortLabel}</TableHead>
                    <TableHead className='text-right'>{t('total')}</TableHead>
                    <TableHead className='w-10' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const isOpen = expandedRows.has(row._id)
                    const label = reportEntityName(language, row.customerName, row.customerNameUrdu)
                    return (
                      <Fragment key={row._id}>
                        <TableRow
                          className='cursor-pointer hover:bg-muted/40 transition-colors'
                          onClick={() => toggleRow(row._id)}
                        >
                          <TableCell className='pl-4'>
                            <Button variant='ghost' size='icon' className='h-6 w-6 p-0'>
                              {isOpen ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />}
                            </Button>
                          </TableCell>
                          <TableCell className={cn('font-medium', reportEntityNameClass(language, label))}>
                            {label}
                          </TableCell>
                          <TableCell className='text-sm text-muted-foreground'>{row.phone || 'N/A'}</TableCell>
                          <TableCell className='text-right'>{row.current ? formatCurrency(row.current) : '—'}</TableCell>
                          <TableCell className='text-right'>{row.bucket1 ? formatCurrency(row.bucket1) : '—'}</TableCell>
                          <TableCell className='text-right'>{row.bucket2 ? formatCurrency(row.bucket2) : '—'}</TableCell>
                          <TableCell className='text-right'>{row.bucket3 ? formatCurrency(row.bucket3) : '—'}</TableCell>
                          <TableCell className='text-right'>{row.bucket4 ? formatCurrency(row.bucket4) : '—'}</TableCell>
                          <TableCell className='text-right font-semibold'>{formatCurrency(row.totalOutstanding)}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {row.totalOutstanding > 0 && (row.phone || row.whatsapp) && (
                              <WhatsAppSendButton
                                phone={row.phone}
                                whatsapp={row.whatsapp}
                                name={row.customerName}
                                message={buildCustomerBalanceMessage({
                                  branchName,
                                  name: row.customerName,
                                  balance: row.totalOutstanding,
                                  currency: currencySymbol,
                                })}
                              />
                            )}
                          </TableCell>
                        </TableRow>

                        {isOpen && (
                          <TableRow>
                            <TableCell colSpan={10} className='bg-muted/20 p-0'>
                              <div className='p-4'>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>{t('Invoice #')}</TableHead>
                                      <TableHead>{t('Invoice Date')}</TableHead>
                                      <TableHead>{t('Due Date')}</TableHead>
                                      <TableHead className='text-right'>{t('Days Overdue')}</TableHead>
                                      <TableHead className='text-right'>{t('total')}</TableHead>
                                      <TableHead className='text-right'>{t('Paid')}</TableHead>
                                      <TableHead className='text-right'>{t('balance')}</TableHead>
                                      <TableHead>{t('Bucket')}</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {row.invoices.map((inv) => {
                                      const meta = BUCKETS.find((b) => b.key === inv.bucket)
                                      return (
                                        <TableRow key={inv._id}>
                                          <TableCell className='font-mono text-xs text-primary'>{inv.invoiceNumber}</TableCell>
                                          <TableCell className='text-sm text-muted-foreground'>
                                            {format(new Date(inv.invoiceDate), 'dd MMM yyyy')}
                                          </TableCell>
                                          <TableCell className='text-sm text-muted-foreground'>
                                            {format(new Date(inv.dueDate), 'dd MMM yyyy')}
                                          </TableCell>
                                          <TableCell className='text-right'>{inv.daysOverdue > 0 ? inv.daysOverdue : 0}</TableCell>
                                          <TableCell className='text-right'>{formatCurrency(inv.total)}</TableCell>
                                          <TableCell className='text-right'>{formatCurrency(inv.paidAmount)}</TableCell>
                                          <TableCell className='text-right font-semibold'>{formatCurrency(inv.balance)}</TableCell>
                                          <TableCell>
                                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap', meta?.badge)}>
                                              {t(meta?.label || inv.bucket)}
                                            </span>
                                          </TableCell>
                                        </TableRow>
                                      )
                                    })}
                                  </TableBody>
                                </Table>
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
          )}
        </CardContent>
      </Card>
    </div>
  )
})

AgingReport.displayName = 'AgingReport'
