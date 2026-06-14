import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ClipboardList,
  CreditCard,
  Filter,
  Search,
  Wallet,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useGetActivitySummaryReportQuery, type ActivitySummaryEntry } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { cn } from '@/lib/utils'

interface ActivitySummaryReportProps {
  startDate: string
  endDate: string
}

const moduleColors: Record<string, string> = {
  Sales: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Purchases: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  'Sales Returns': 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300',
  'Purchase Returns': 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300',
  Expenses: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  Load: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300',
  'Cash Management': 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300',
  'Sim Sale': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300',
  Repairing: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  Services: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  'Bill Payments': 'bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-300',
  Installments: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-300',
  'Customer Payments': 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300',
  'Supplier Payments': 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
}

const directionColors: Record<string, string> = {
  in: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  out: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  neutral: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400',
}

const SECTION_ORDER = [
  'Sales',
  'Purchases',
  'Sales Returns',
  'Purchase Returns',
  'Load Sale',
  'Load Purchase',
  'Cash Received',
  'Cash Sent',
  'Sim Sale',
  'Services',
  'Repairing',
  'Bill Payments',
  'Installments',
  'Expenses',
  'Customer Cash Received',
  'Customer Cash Paid',
  'Supplier Cash Paid',
  'Supplier Cash Received',
]

const SECTION_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#94a3b8', '#0ea5e9', '#84cc16',
]

const getSectionKey = (entry: ActivitySummaryEntry): string => {
  if (entry.module === 'Load') return entry.subType
  if (entry.module === 'Cash Management') return entry.subType
  if (entry.module === 'Customer Payments') {
    return entry.subType === 'Cash Received' ? 'Customer Cash Received' : 'Customer Cash Paid'
  }
  if (entry.module === 'Supplier Payments') {
    return entry.subType === 'Cash Paid' ? 'Supplier Cash Paid' : 'Supplier Cash Received'
  }
  return entry.module
}

interface SectionTotals {
  count: number
  totalAmount: number
  paidAmount: number
  balance: number
  cashIn: number
  cashOut: number
}

const calcSectionTotals = (entries: ActivitySummaryEntry[]): SectionTotals =>
  entries.reduce(
    (acc, entry) => ({
      count: acc.count + 1,
      totalAmount: acc.totalAmount + (entry.totalAmount || 0),
      paidAmount: acc.paidAmount + (entry.paidAmount || 0),
      balance: acc.balance + (entry.balance || 0),
      cashIn: acc.cashIn + (entry.direction === 'in' ? entry.paidAmount || 0 : 0),
      cashOut: acc.cashOut + (entry.direction === 'out' ? entry.paidAmount || 0 : 0),
    }),
    { count: 0, totalAmount: 0, paidAmount: 0, balance: 0, cashIn: 0, cashOut: 0 },
  )

const buildGroupedSections = (entries: ActivitySummaryEntry[]) => {
  const groups = new Map<string, ActivitySummaryEntry[]>()
  entries.forEach((entry) => {
    const key = getSectionKey(entry)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(entry)
  })

  return Array.from(groups.entries())
    .map(([section, sectionEntries]) => ({
      section,
      entries: sectionEntries,
      totals: calcSectionTotals(sectionEntries),
    }))
    .sort((a, b) => {
      const ai = SECTION_ORDER.indexOf(a.section)
      const bi = SECTION_ORDER.indexOf(b.section)
      if (ai === -1 && bi === -1) return a.section.localeCompare(b.section)
      if (ai === -1) return 1
      if (bi === -1) return -1
      return ai - bi
    })
}

const getSectionModuleColor = (section: string): string => {
  if (section.startsWith('Load')) return moduleColors.Load
  if (section.startsWith('Cash') || section.includes('Cash')) return moduleColors['Cash Management']
  if (section.startsWith('Customer')) return moduleColors['Customer Payments']
  if (section.startsWith('Supplier')) return moduleColors['Supplier Payments']
  return moduleColors[section] || 'bg-muted text-muted-foreground'
}

interface ActivityTableProps {
  entries: ActivitySummaryEntry[]
  fmt: (value: number) => string
  showModuleColumn?: boolean
  embedded?: boolean
}

function ActivityTable({ entries, fmt, showModuleColumn = false, embedded = false }: ActivityTableProps) {
  const totals = calcSectionTotals(entries)
  const labelColSpan = showModuleColumn ? 6 : 5

  return (
    <div className={cn('w-full min-w-0', !embedded && 'rounded-md border')}>
      <Table className='w-max min-w-full table-auto'>
        <TableHeader>
          <TableRow>
            <TableHead className='whitespace-nowrap'>Date</TableHead>
            {showModuleColumn && <TableHead className='whitespace-nowrap'>Module</TableHead>}
            <TableHead className='whitespace-nowrap'>Type</TableHead>
            <TableHead className='whitespace-nowrap'>Reference</TableHead>
            <TableHead className='whitespace-nowrap'>Party</TableHead>
            <TableHead className='whitespace-nowrap'>Payment</TableHead>
            <TableHead className='whitespace-nowrap text-right'>Total</TableHead>
            <TableHead className='whitespace-nowrap text-right'>Paid</TableHead>
            <TableHead className='whitespace-nowrap text-right'>Balance</TableHead>
            <TableHead className='whitespace-nowrap'>Description</TableHead>
            <TableHead className='whitespace-nowrap'>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={`${entry.module}-${entry.id}`}>
              <TableCell className='whitespace-nowrap text-sm'>
                {format(new Date(entry.date), 'dd MMM yyyy')}
                <div className='text-xs text-muted-foreground'>
                  {format(new Date(entry.date), 'hh:mm a')}
                </div>
              </TableCell>
              {showModuleColumn && (
                <TableCell>
                  <Badge
                    variant='secondary'
                    className={cn('text-xs whitespace-nowrap', moduleColors[entry.module])}
                  >
                    {entry.module}
                  </Badge>
                </TableCell>
              )}
              <TableCell className='text-sm whitespace-nowrap'>{entry.subType}</TableCell>
              <TableCell className='text-sm font-mono'>{entry.reference || '—'}</TableCell>
              <TableCell>
                <div className='text-sm font-medium'>{entry.party}</div>
                {entry.partyPhone && (
                  <div className='text-xs text-muted-foreground'>{entry.partyPhone}</div>
                )}
              </TableCell>
              <TableCell>
                <div className='flex flex-col gap-1'>
                  <span className='text-sm'>{entry.paymentType}</span>
                  <Badge
                    variant='outline'
                    className={cn('text-xs w-fit', directionColors[entry.direction])}
                  >
                    {entry.direction === 'in' ? 'Cash In' : entry.direction === 'out' ? 'Cash Out' : '—'}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className='text-right font-medium whitespace-nowrap'>
                {fmt(entry.totalAmount)}
              </TableCell>
              <TableCell className='text-right whitespace-nowrap text-green-600 dark:text-green-400'>
                {fmt(entry.paidAmount)}
              </TableCell>
              <TableCell className='text-right whitespace-nowrap'>
                {entry.balance > 0 ? (
                  <span className='text-amber-600 dark:text-amber-400 font-medium'>
                    {fmt(entry.balance)}
                  </span>
                ) : (
                  <span className='text-muted-foreground'>—</span>
                )}
              </TableCell>
              <TableCell className='max-w-[200px] whitespace-normal'>
                <div className='text-sm line-clamp-2' title={entry.description}>
                  {entry.description}
                </div>
                {entry.details && (
                  <div className='text-xs text-muted-foreground truncate' title={entry.details}>
                    {entry.details}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Badge variant='outline' className='text-xs capitalize'>
                  {entry.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow className='bg-muted/60 font-semibold'>
            <TableCell colSpan={labelColSpan} className='whitespace-nowrap text-sm uppercase tracking-wide'>
              Total — {totals.count} {totals.count === 1 ? 'entry' : 'entries'}
            </TableCell>
            <TableCell className='text-right whitespace-nowrap'>{fmt(totals.totalAmount)}</TableCell>
            <TableCell className='text-right whitespace-nowrap text-green-600 dark:text-green-400'>
              {fmt(totals.paidAmount)}
            </TableCell>
            <TableCell className='text-right whitespace-nowrap'>
              {totals.balance > 0 ? (
                <span className='text-amber-600 dark:text-amber-400'>{fmt(totals.balance)}</span>
              ) : (
                <span className='text-muted-foreground'>—</span>
              )}
            </TableCell>
            <TableCell colSpan={2} className='whitespace-normal'>
              <div className='flex flex-wrap gap-3 text-xs font-normal text-muted-foreground'>
                <span className='text-green-600 dark:text-green-400'>In: {fmt(totals.cashIn)}</span>
                <span className='text-red-600 dark:text-red-400'>Out: {fmt(totals.cashOut)}</span>
              </div>
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}

export const ActivitySummaryReport = forwardRef<
  { exportToExcel: () => void },
  ActivitySummaryReportProps
>(({ startDate, endDate }, ref) => {
  const { t } = useLanguage()
  const [moduleFilter, setModuleFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSection, setActiveSection] = useState<string | null>(null)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const { data, isLoading } = useGetActivitySummaryReportQuery({
    startDate,
    endDate,
  })

  const fmt = (value: number) =>
    new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(value)

  const allEntries = data?.entries ?? []
  const allByModule = data?.byModule ?? []

  const filteredEntries = useMemo(() => {
    let rows = allEntries
    if (moduleFilter !== 'all') {
      rows = rows.filter((entry) => entry.module === moduleFilter)
    }
    const q = searchQuery.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((entry) => {
      const haystack = [
        entry.module,
        entry.subType,
        entry.reference,
        entry.party,
        entry.partyPhone,
        entry.paymentType,
        entry.description,
        entry.details,
        entry.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [allEntries, moduleFilter, searchQuery])

  const allGroupedSections = useMemo(() => buildGroupedSections(allEntries), [allEntries])

  const groupedSections = useMemo(() => {
    if (moduleFilter !== 'all') return []
    return buildGroupedSections(filteredEntries)
  }, [filteredEntries, moduleFilter])

  const totalSectionAmount = useMemo(
    () => allGroupedSections.reduce((sum, group) => sum + group.totals.totalAmount, 0),
    [allGroupedSections],
  )

  const scrollToSection = useCallback((section: string) => {
    setModuleFilter('all')
    setSearchQuery('')
    setActiveSection(section)
    window.setTimeout(() => {
      sectionRefs.current[section]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }, [])

  const displaySummary = useMemo(() => {
    const rows = moduleFilter === 'all' ? allEntries : allEntries.filter((e) => e.module === moduleFilter)
    return {
      totalEntries: rows.length,
      totalAmount: rows.reduce((sum, e) => sum + (e.totalAmount || 0), 0),
      cashReceived: rows.filter((e) => e.direction === 'in').reduce((sum, e) => sum + (e.paidAmount || 0), 0),
      cashPaid: rows.filter((e) => e.direction === 'out').reduce((sum, e) => sum + (e.paidAmount || 0), 0),
      creditSalesBalance: rows.filter((e) => e.module === 'Sales' && e.balance > 0).reduce((sum, e) => sum + e.balance, 0),
      creditPurchaseBalance: rows.filter((e) => e.module === 'Purchases' && e.balance > 0).reduce((sum, e) => sum + e.balance, 0),
      cashSales: rows.filter((e) => e.module === 'Sales' && e.paymentType === 'Cash').reduce((sum, e) => sum + (e.totalAmount || 0), 0),
      creditSales: rows.filter((e) => e.module === 'Sales' && e.paymentType !== 'Cash').reduce((sum, e) => sum + (e.totalAmount || 0), 0),
      cashPurchases: rows.filter((e) => e.module === 'Purchases' && e.paymentType === 'Cash').reduce((sum, e) => sum + (e.totalAmount || 0), 0),
      creditPurchases: rows.filter((e) => e.module === 'Purchases' && e.paymentType !== 'Cash').reduce((sum, e) => sum + (e.totalAmount || 0), 0),
    }
  }, [allEntries, moduleFilter])

  useImperativeHandle(ref, () => ({
    exportToExcel: () => {
      try {
        if (!allEntries.length) {
          toast.error(t('No data available to export'))
          return
        }

        const wb = XLSX.utils.book_new()

        const summarySheet = XLSX.utils.json_to_sheet([
          { Metric: 'Period Start', Value: startDate },
          { Metric: 'Period End', Value: endDate },
          { Metric: 'Total Entries', Value: displaySummary.totalEntries },
          { Metric: 'Cash Received', Value: displaySummary.cashReceived },
          { Metric: 'Cash Paid', Value: displaySummary.cashPaid },
          { Metric: 'Cash Sales', Value: displaySummary.cashSales },
          { Metric: 'Credit Sales', Value: displaySummary.creditSales },
          { Metric: 'Credit Sales Balance', Value: displaySummary.creditSalesBalance },
          { Metric: 'Cash Purchases', Value: displaySummary.cashPurchases },
          { Metric: 'Credit Purchases', Value: displaySummary.creditPurchases },
          { Metric: 'Credit Purchase Balance', Value: displaySummary.creditPurchaseBalance },
        ])
        XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')

        if (allByModule.length > 0) {
          const moduleSheet = XLSX.utils.json_to_sheet(
            allByModule.map((row) => ({
              Module: row.module,
              Entries: row.count,
              'Total Amount': row.totalAmount,
              'Cash In': row.cashIn,
              'Cash Out': row.cashOut,
            }))
          )
          XLSX.utils.book_append_sheet(wb, moduleSheet, 'By Module')
        }

        const entriesSheet = XLSX.utils.json_to_sheet(
          filteredEntries.map((entry) => ({
            Section: getSectionKey(entry),
            Date: format(new Date(entry.date), 'yyyy-MM-dd HH:mm'),
            Module: entry.module,
            Type: entry.subType,
            Reference: entry.reference,
            Party: entry.party,
            Phone: entry.partyPhone || '',
            'Payment Type': entry.paymentType,
            Direction: entry.direction === 'in' ? 'Cash In' : entry.direction === 'out' ? 'Cash Out' : '—',
            'Total Amount': entry.totalAmount,
            'Paid Amount': entry.paidAmount,
            Balance: entry.balance,
            Description: entry.description,
            Details: entry.details || '',
            Status: entry.status,
          }))
        )
        XLSX.utils.book_append_sheet(wb, entriesSheet, 'All Activities')

        if (moduleFilter === 'all') {
          groupedSections.forEach(({ section, entries, totals }) => {
            const safeName = section.replace(/[\\/*?:[\]]/g, '').slice(0, 28)
            const rows = entries.map((entry) => ({
              Date: format(new Date(entry.date), 'yyyy-MM-dd HH:mm'),
              Type: entry.subType,
              Reference: entry.reference,
              Party: entry.party,
              Phone: entry.partyPhone || '',
              'Payment Type': entry.paymentType,
              Direction: entry.direction === 'in' ? 'Cash In' : entry.direction === 'out' ? 'Cash Out' : '—',
              'Total Amount': entry.totalAmount,
              'Paid Amount': entry.paidAmount,
              Balance: entry.balance,
              Description: entry.description,
              Details: entry.details || '',
              Status: entry.status,
            }))
            rows.push({
              Date: 'TOTAL',
              Type: `${totals.count} entries`,
              Reference: '',
              Party: '',
              Phone: '',
              'Payment Type': '',
              Direction: '',
              'Total Amount': totals.totalAmount,
              'Paid Amount': totals.paidAmount,
              Balance: totals.balance,
              Description: `Cash In: ${totals.cashIn} | Cash Out: ${totals.cashOut}`,
              Details: '',
              Status: '',
            })
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), safeName)
          })
        }

        XLSX.writeFile(wb, `activity-summary-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
        toast.success(t('Data exported successfully'))
      } catch (error) {
        console.error('Export error:', error)
        toast.error(t('Failed to export data'))
      }
    },
  }))

  if (isLoading) {
    return (
      <div className='space-y-4'>
        <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className='h-[120px] w-full' />
          ))}
        </div>
        <Skeleton className='h-[500px] w-full' />
      </div>
    )
  }

  const summary = displaySummary
  const byModule = allByModule

  return (
    <div className='space-y-6 min-w-0 max-w-full'>
      {/* KPI Cards */}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <Card className={kpiCardClass('sky')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Total Activities</CardTitle>
            <div className={toneIconWrapClass('sky')}>
              <ClipboardList className='h-4 w-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{summary?.totalEntries ?? 0}</div>
            <p className='text-xs text-muted-foreground'>All entries in selected period</p>
          </CardContent>
        </Card>

        <Card className={kpiCardClass('emerald')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Cash Received</CardTitle>
            <div className={toneIconWrapClass('emerald')}>
              <ArrowDownLeft className='h-4 w-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{fmt(summary?.cashReceived ?? 0)}</div>
            <p className='text-xs text-muted-foreground'>
              Cash sales: {fmt(summary?.cashSales ?? 0)}
            </p>
          </CardContent>
        </Card>

        <Card className={kpiCardClass('rose')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Cash Paid</CardTitle>
            <div className={toneIconWrapClass('rose')}>
              <ArrowUpRight className='h-4 w-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{fmt(summary?.cashPaid ?? 0)}</div>
            <p className='text-xs text-muted-foreground'>
              Cash purchases: {fmt(summary?.cashPurchases ?? 0)}
            </p>
          </CardContent>
        </Card>

        <Card className={kpiCardClass('violet')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>Credit Outstanding</CardTitle>
            <div className={toneIconWrapClass('violet')}>
              <CreditCard className='h-4 w-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {fmt((summary?.creditSalesBalance ?? 0) + (summary?.creditPurchaseBalance ?? 0))}
            </div>
            <p className='text-xs text-muted-foreground'>
              Sales: {fmt(summary?.creditSalesBalance ?? 0)} · Purchases:{' '}
              {fmt(summary?.creditPurchaseBalance ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Module Breakdown */}
      {allGroupedSections.length > 0 && moduleFilter === 'all' && (
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>Module Summary</CardTitle>
            <CardDescription>Click a module to view its detail table below</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
              {allGroupedSections.map((group, idx) => {
                const { section, totals } = group
                const color = SECTION_COLORS[idx % SECTION_COLORS.length]
                const share = totalSectionAmount
                  ? ((totals.totalAmount / totalSectionAmount) * 100).toFixed(1)
                  : '0'
                const avg = totals.count ? totals.totalAmount / totals.count : 0
                const isActive = activeSection === section

                return (
                  <button
                    key={section}
                    type='button'
                    onClick={() => scrollToSection(section)}
                    className={cn(
                      'text-left rounded-xl border bg-card p-4 shadow-sm transition-all group',
                      'hover:shadow-md hover:border-primary/50',
                      isActive && 'ring-2 ring-primary border-primary shadow-md',
                    )}
                  >
                    <div className='flex items-center justify-between mb-3'>
                      <span
                        className='inline-flex h-8 w-8 items-center justify-center rounded-lg text-white text-xs font-bold'
                        style={{ backgroundColor: color }}
                      >
                        {section.charAt(0).toUpperCase()}
                      </span>
                      <Badge variant='secondary' className='text-xs'>
                        {share}%
                      </Badge>
                    </div>
                    <p className='font-semibold text-sm leading-tight mb-0.5 line-clamp-2'>
                      {section}
                    </p>
                    <p className='text-xl font-bold tabular-nums' style={{ color }}>
                      {fmt(totals.totalAmount)}
                    </p>
                    <div className='mt-2 flex items-center justify-between text-xs text-muted-foreground'>
                      <span>
                        {totals.count} {totals.count === 1 ? 'entry' : 'entries'}
                      </span>
                      <span>Avg {fmt(avg)}</span>
                    </div>
                    <div className='mt-2 flex gap-3 text-xs'>
                      <span className='text-green-600 dark:text-green-400'>
                        In: {fmt(totals.cashIn)}
                      </span>
                      <span className='text-red-600 dark:text-red-400'>
                        Out: {fmt(totals.cashOut)}
                      </span>
                    </div>
                    <div className='mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden'>
                      <div
                        className='h-full rounded-full transition-all'
                        style={{ width: `${share}%`, backgroundColor: color }}
                      />
                    </div>
                    <p className='mt-1.5 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity'>
                      Click to view details →
                    </p>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Activity Details */}
      <Card className='min-w-0'>
        <CardHeader>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
            <div>
              <CardTitle>All Activities</CardTitle>
              <CardDescription>
                {moduleFilter === 'all'
                  ? 'Each module shown in a separate section with its own totals'
                  : 'Complete detail of every transaction in the selected module'}
              </CardDescription>
            </div>
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
              <div className='relative'>
                <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
                <Input
                  placeholder='Search reference, party, description...'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className='pl-8 w-full sm:w-[240px]'
                />
              </div>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger className='w-full sm:w-[200px]'>
                  <Filter className='mr-2 h-4 w-4' />
                  <SelectValue placeholder='All Modules' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Modules</SelectItem>
                  {byModule.map((row) => (
                    <SelectItem key={row.module} value={row.module}>
                      {row.module} ({row.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-6 min-w-0'>
          {filteredEntries.length === 0 ? (
            <div className='flex flex-col items-center justify-center py-16 text-muted-foreground'>
              <Wallet className='h-12 w-12 mb-3 opacity-40' />
              <p className='text-sm'>No activities found for the selected period</p>
            </div>
          ) : moduleFilter === 'all' ? (
            <div className='space-y-6 min-w-0'>
              {groupedSections.map(({ section, entries, totals }) => (
                <div
                  key={section}
                  ref={(el) => {
                    sectionRefs.current[section] = el
                  }}
                  className={cn(
                    'rounded-xl border bg-card shadow-sm min-w-0 scroll-mt-24 transition-all',
                    activeSection === section && 'ring-2 ring-primary border-primary',
                  )}
                >
                  <div className='flex flex-col gap-2 border-b bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between'>
                    <div className='flex items-center gap-2'>
                      <Badge className={cn('text-sm', getSectionModuleColor(section))}>
                        {section}
                      </Badge>
                      <span className='text-sm text-muted-foreground'>
                        {totals.count} {totals.count === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>
                    <div className='flex flex-wrap gap-4 text-sm'>
                      <span>
                        <span className='text-muted-foreground'>Total: </span>
                        <span className='font-semibold'>{fmt(totals.totalAmount)}</span>
                      </span>
                      <span className='text-green-600 dark:text-green-400'>
                        In: {fmt(totals.cashIn)}
                      </span>
                      <span className='text-red-600 dark:text-red-400'>
                        Out: {fmt(totals.cashOut)}
                      </span>
                    </div>
                  </div>
                  <div className='min-w-0'>
                    <ActivityTable entries={entries} fmt={fmt} embedded />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <ActivityTable entries={filteredEntries} fmt={fmt} showModuleColumn />
          )}
          {filteredEntries.length > 0 && (
            <p className='text-xs text-muted-foreground'>
              Showing {filteredEntries.length} of {allEntries.length} activities
              {moduleFilter === 'all' && groupedSections.length > 0
                ? ` across ${groupedSections.length} sections`
                : ''}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
})

ActivitySummaryReport.displayName = 'ActivitySummaryReport'
