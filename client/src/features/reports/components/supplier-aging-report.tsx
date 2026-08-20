import { useState, Fragment, forwardRef, useImperativeHandle } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import { useGetSupplierAgingReportQuery, SupplierAgingData } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { useBranchName } from '@/hooks/use-branch-name'
import { buildSupplierBalanceMessage } from '@/utils/sms-messages'
import { format } from 'date-fns'
import { ChevronDown, ChevronRight, CalendarIcon, CheckCircle2, Clock, AlertCircle, AlertTriangle, XCircle, Wallet } from 'lucide-react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { reportEntityName, reportEntityNameClass } from '../utils/report-entity-name'
import { cn } from '@/lib/utils'

type BucketKey = 'current' | 'days1to30' | 'days31to60' | 'days61to90' | 'days90plus'

const BUCKETS: Array<{
  key: BucketKey
  label: string
  tone: 'emerald' | 'amber' | 'orange' | 'rose' | 'slate'
  icon: typeof CheckCircle2
  badge: string
}> = [
  {
    key: 'current',
    label: 'Current',
    tone: 'emerald',
    icon: CheckCircle2,
    badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  {
    key: 'days1to30',
    label: '1-30 Days',
    tone: 'amber',
    icon: Clock,
    badge: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
  },
  {
    key: 'days31to60',
    label: '31-60 Days',
    tone: 'orange',
    icon: AlertCircle,
    badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  },
  {
    key: 'days61to90',
    label: '61-90 Days',
    tone: 'rose',
    icon: AlertTriangle,
    badge: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
  },
  {
    key: 'days90plus',
    label: '90+ Days',
    tone: 'slate',
    icon: XCircle,
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400',
  },
]

export const SupplierAgingReport = forwardRef<{ exportToExcel: () => void }, {}>((_, ref) => {
  const { t, language } = useLanguage()
  const branchName = useBranchName()
  const [asOfDate, setAsOfDate] = useState<Date>(() => new Date())
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const queryAsOfDate = format(asOfDate, 'yyyy-MM-dd')
  const { data, isFetching: isLoading } = useGetSupplierAgingReportQuery({ asOfDate: queryAsOfDate })

  useImperativeHandle(ref, () => ({
    exportToExcel: () => {
      try {
        if (!data?.data || data.data.length === 0) {
          toast.error(t('No data available to export'))
          return
        }

        const excelData = data.data.map((row) => ({
          [t('supplier')]: reportEntityName(language, row.supplierName, row.supplierNameUrdu),
          [t('phone')]: row.phone || 'N/A',
          [t('Current')]: row.current,
          '1-30 Days': row.days1to30,
          '31-60 Days': row.days31to60,
          '61-90 Days': row.days61to90,
          '90+ Days': row.days90plus,
          [t('total')]: row.totalOutstanding,
        }))

        const ws = XLSX.utils.json_to_sheet(excelData)
        const wb = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(wb, ws, 'Supplier Aging Report')
        XLSX.writeFile(wb, `supplier-aging-report-${queryAsOfDate}.xlsx`)
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

  if (isLoading) return <Skeleton className='h-[400px] w-full' />

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(value || 0)

  const summary = data?.summary
  const rows: SupplierAgingData[] = data?.data || []

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>{t('As of Date')}</CardTitle>
          <CardDescription>{t('Aging buckets are calculated against the balance owed as of this date')}</CardDescription>
        </CardHeader>
        <CardContent>
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
              {summary?.suppliersOverdue || 0} {t('of')} {summary?.totalSuppliers || 0} {t('suppliers overdue')}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('Supplier Aging Detail')}</CardTitle>
          <CardDescription>{t('Click a supplier row to see individual outstanding purchases')}</CardDescription>
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
                    <TableHead>{t('supplier')}</TableHead>
                    <TableHead>{t('phone')}</TableHead>
                    <TableHead className='text-right'>{t('Current')}</TableHead>
                    <TableHead className='text-right'>1-30</TableHead>
                    <TableHead className='text-right'>31-60</TableHead>
                    <TableHead className='text-right'>61-90</TableHead>
                    <TableHead className='text-right'>90+</TableHead>
                    <TableHead className='text-right'>{t('total')}</TableHead>
                    <TableHead className='w-10' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const isOpen = expandedRows.has(row._id)
                    const label = reportEntityName(language, row.supplierName, row.supplierNameUrdu)
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
                          <TableCell className='text-right'>{row.days1to30 ? formatCurrency(row.days1to30) : '—'}</TableCell>
                          <TableCell className='text-right'>{row.days31to60 ? formatCurrency(row.days31to60) : '—'}</TableCell>
                          <TableCell className='text-right'>{row.days61to90 ? formatCurrency(row.days61to90) : '—'}</TableCell>
                          <TableCell className='text-right'>{row.days90plus ? formatCurrency(row.days90plus) : '—'}</TableCell>
                          <TableCell className='text-right font-semibold'>{formatCurrency(row.totalOutstanding)}</TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            {row.totalOutstanding > 0 && (row.phone || row.whatsapp) && (
                              <WhatsAppSendButton
                                phone={row.phone}
                                whatsapp={row.whatsapp}
                                name={row.supplierName}
                                message={buildSupplierBalanceMessage({
                                  branchName,
                                  name: row.supplierName,
                                  balance: row.totalOutstanding,
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
                                      <TableHead>{t('Purchase Date')}</TableHead>
                                      <TableHead>{t('Due Date')}</TableHead>
                                      <TableHead className='text-right'>{t('Days Overdue')}</TableHead>
                                      <TableHead className='text-right'>{t('total')}</TableHead>
                                      <TableHead className='text-right'>{t('Paid')}</TableHead>
                                      <TableHead className='text-right'>{t('balance')}</TableHead>
                                      <TableHead>{t('Bucket')}</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {row.purchases.map((pur) => {
                                      const meta = BUCKETS.find((b) => b.key === pur.bucket)
                                      return (
                                        <TableRow key={pur._id}>
                                          <TableCell className='font-mono text-xs text-primary'>
                                            <div>{pur.invoiceNumber}</div>
                                            {pur.vendorBillNumber && (
                                              <div className='text-muted-foreground'>Bill: {pur.vendorBillNumber}</div>
                                            )}
                                          </TableCell>
                                          <TableCell className='text-sm text-muted-foreground'>
                                            {format(new Date(pur.purchaseDate), 'dd MMM yyyy')}
                                          </TableCell>
                                          <TableCell className='text-sm text-muted-foreground'>
                                            {format(new Date(pur.dueDate), 'dd MMM yyyy')}
                                          </TableCell>
                                          <TableCell className='text-right'>{pur.daysOverdue > 0 ? pur.daysOverdue : 0}</TableCell>
                                          <TableCell className='text-right'>{formatCurrency(pur.totalAmount)}</TableCell>
                                          <TableCell className='text-right'>{formatCurrency(pur.paidAmount)}</TableCell>
                                          <TableCell className='text-right font-semibold'>{formatCurrency(pur.balance)}</TableCell>
                                          <TableCell>
                                            <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap', meta?.badge)}>
                                              {t(meta?.label || pur.bucket)}
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

SupplierAgingReport.displayName = 'SupplierAgingReport'
