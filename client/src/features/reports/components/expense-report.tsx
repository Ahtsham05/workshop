import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import {
  useGetExpenseReportQuery,
  useLazyGetExpenseReportQuery,
} from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { format } from 'date-fns'
import { toast } from 'sonner'
import * as XLSX from 'xlsx'
import {
  TrendingDown,
  Receipt,
  BarChart2,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  X,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'

interface ExpenseReportProps {
  startDate: string
  endDate: string
  mode?: 'full' | 'categories'
  refreshTrigger?: number
}

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#94a3b8',
]

const fmt = (v: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 }).format(v)

export const ExpenseReport = forwardRef<{ exportToExcel: () => void }, ExpenseReportProps>(
  ({ startDate, endDate, mode = 'full', refreshTrigger = 0 }, ref) => {
    const categoriesOnly = mode === 'categories'
    const { t } = useLanguage()
    const { data, isLoading, refetch } = useGetExpenseReportQuery({ startDate, endDate })
    const [fetchCategory] = useLazyGetExpenseReportQuery()

    const [sheetOpen, setSheetOpen] = useState(false)
    const [activeCategory, setActiveCategory] = useState<string | null>(null)
    const [detailData, setDetailData] = useState<any[]>([])
    const [detailLoading, setDetailLoading] = useState(false)
    const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

    useEffect(() => {
      if (refreshTrigger > 0) {
        refetch()
      }
    }, [refreshTrigger, refetch])

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data?.categoryBreakdown?.length) {
            toast.error(t('No data available to export'))
            return
          }
          const wb = XLSX.utils.book_new()

          // Sheet 1 — Category Summary
          const summarySheet = XLSX.utils.json_to_sheet(
            data.categoryBreakdown.map((c) => ({
              [t('category')]: c._id,
              [t('count')]: c.expenseCount,
              [t('total_amount')]: c.totalAmount,
              [t('avg_amount')]: c.avgAmount?.toFixed(2),
              [t('percentage')]: `${((c.totalAmount / (data.summary?.totalExpenses || 1)) * 100).toFixed(1)}%`,
            })),
          )
          XLSX.utils.book_append_sheet(wb, summarySheet, 'Category Summary')

          XLSX.writeFile(wb, `expense-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch {
          toast.error(t('Failed to export data'))
        }
      },
    }))

    const openCategoryDetail = useCallback(
      async (catName: string) => {
        setActiveCategory(catName)
        setSheetOpen(true)
        setExpandedRows(new Set())
        setDetailLoading(true)
        try {
          const result = await fetchCategory({ startDate, endDate, category: catName }).unwrap()
          setDetailData(result.categoryExpenses || [])
        } catch {
          toast.error(t('Failed to load category details'))
        } finally {
          setDetailLoading(false)
        }
      },
      [fetchCategory, startDate, endDate, t],
    )

    const toggleRow = useCallback((i: number) => {
      setExpandedRows((prev) => {
        const next = new Set(prev)
        next.has(i) ? next.delete(i) : next.add(i)
        return next
      })
    }, [])

    const toggleAll = useCallback(() => {
      if (expandedRows.size === detailData.length) {
        setExpandedRows(new Set())
      } else {
        setExpandedRows(new Set(detailData.map((_, i) => i)))
      }
    }, [expandedRows.size, detailData])

    if (isLoading) {
      return <Skeleton className={categoriesOnly ? 'h-[480px] w-full' : 'h-[500px] w-full'} />
    }

    const categories = data?.categoryBreakdown || []
    const totalExpenses = data?.summary?.totalExpenses || 0

    const trendData = Object.entries(
      (data?.data || []).reduce<Record<string, number>>((acc, row: any) => {
        const d = row._id?.date || ''
        acc[d] = (acc[d] || 0) + row.totalAmount
        return acc
      }, {}),
    )
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date: format(new Date(date), 'dd MMM'), amount }))

    const pieData = categories.map((c) => ({ name: c._id, value: c.totalAmount }))

    const detailTotal = detailData.reduce((s, e) => s + (e.amount || 0), 0)

    const totalEntryCount = data?.summary?.expenseCount || 0
    const avgExpense = data?.summary?.avgExpense || 0

    const categoryTotalBar = categoriesOnly && categories.length > 0 && (
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50/60 px-5 py-4 dark:border-rose-900 dark:bg-rose-950/30">
        <div className="flex items-center gap-3">
          <div className={cn('rounded-xl p-3', toneIconWrapClass('rose'))}>
            <TrendingDown className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-muted-foreground">{t('total_expenses')}</p>
            <p className="text-3xl font-bold text-rose-600 tabular-nums">{fmt(totalExpenses)}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-6 sm:gap-10">
          <div>
            <p className="text-sm text-muted-foreground">{t('expense_count')}</p>
            <p className="text-xl font-bold tabular-nums">{totalEntryCount}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t('avg_expense')}</p>
            <p className="text-xl font-bold tabular-nums">{fmt(avgExpense)}</p>
          </div>
        </div>
      </div>
    )

    const categoryCards = (
      <div className="space-y-4">
        {categoryTotalBar}
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {categories.map((cat, idx) => {
            const share = totalExpenses ? ((cat.totalAmount / totalExpenses) * 100).toFixed(1) : '0'
            const color = COLORS[idx % COLORS.length]
            return (
              <button
                key={cat._id}
                onClick={() => openCategoryDetail(cat._id)}
                className="text-left rounded-xl border bg-card p-4 shadow-sm hover:shadow-md hover:border-primary/50 transition-all group"
              >
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white text-xs font-bold"
                    style={{ backgroundColor: color }}
                  >
                    {cat._id.charAt(0).toUpperCase()}
                  </span>
                  <Badge variant="secondary" className="text-xs">{share}%</Badge>
                </div>
                <p className="font-semibold text-sm leading-tight mb-0.5">{cat._id}</p>
                <p className="text-xl font-bold" style={{ color }}>{fmt(cat.totalAmount)}</p>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{cat.expenseCount} {t('entries')}</span>
                  <span>{t('avg')} {fmt(cat.avgAmount || 0)}</span>
                </div>
                <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${share}%`, backgroundColor: color }}
                  />
                </div>
                <p className="mt-1.5 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  {t('Click to view details →')}
                </p>
              </button>
            )
          })}

        </div>
      </div>
    )

    const emptyCategoryState = (
      <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
        <Receipt className="h-10 w-10 mb-2 opacity-30" />
        <p>{t('No expense data available')}</p>
      </div>
    )

    return (
      <div className="space-y-6">
        {/* ── Summary KPI bar ── */}
        {!categoriesOnly && <div className="grid gap-4 md:grid-cols-3">
          <Card className={kpiCardClass('rose')}>
            <CardContent className="pt-5 flex items-center gap-4">
              <div className={cn('rounded-xl p-3', toneIconWrapClass('rose'))}>
                <TrendingDown className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('total_expenses')}</p>
                <p className="text-2xl font-bold">{fmt(totalExpenses)}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('sky')}>
            <CardContent className="pt-5 flex items-center gap-4">
              <div className={cn('rounded-xl p-3', toneIconWrapClass('sky'))}>
                <Receipt className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('expense_count')}</p>
                <p className="text-2xl font-bold">{data?.summary?.expenseCount || 0}</p>
              </div>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('emerald')}>
            <CardContent className="pt-5 flex items-center gap-4">
              <div className={cn('rounded-xl p-3', toneIconWrapClass('emerald'))}>
                <BarChart2 className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('avg_expense')}</p>
                <p className="text-2xl font-bold">{fmt(data?.summary?.avgExpense || 0)}</p>
              </div>
            </CardContent>
          </Card>
        </div>}

        {/* ── Category Cards ── */}
        {(categories.length > 0 || categoriesOnly) && (
          categoriesOnly ? (
            categories.length === 0 ? emptyCategoryState : categoryCards
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>{t('expense_by_category')}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t('Click a category to view its details')}
                </p>
              </CardHeader>
              <CardContent>{categoryCards}</CardContent>
            </Card>
          )
        )}

        {/* ── Charts Row ── */}
        {!categoriesOnly && trendData.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('Daily Expense Trend')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={trendData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: any) => fmt(v)} />
                    <Bar dataKey="amount" fill="#ef4444" radius={[3, 3, 0, 0]} name={t('Amount')} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">{t('Category Distribution')}</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      dataKey="value"
                      labelLine={false}
                    >
                      {pieData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => fmt(v)} />
                    <Legend iconSize={10} iconType="circle" />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Category Detail Sheet ── */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="right"
            className="w-full sm:max-w-2xl p-0 flex flex-col"
          >
            <SheetHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <SheetTitle className="text-lg">
                  {activeCategory} — {t('Expense Details')}
                </SheetTitle>
                <Button variant="ghost" size="icon" onClick={() => setSheetOpen(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              {!detailLoading && detailData.length > 0 && (
                <div className="flex items-center justify-between mt-2">
                  <p className="text-sm text-muted-foreground">
                    {detailData.length} {t('entries')} · {fmt(detailTotal)} {t('total')}
                  </p>
                  <Button variant="outline" size="sm" onClick={toggleAll} className="h-7 text-xs gap-1">
                    <ChevronsUpDown className="h-3 w-3" />
                    {expandedRows.size === detailData.length ? t('Collapse All') : t('Expand All')}
                  </Button>
                </div>
              )}
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {detailLoading ? (
                <div className="space-y-2">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : detailData.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
                  <Receipt className="h-10 w-10 mb-2 opacity-30" />
                  <p>{t('No expenses found for this category')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8" />
                      <TableHead>{t('Date')}</TableHead>
                      <TableHead>{t('Description')}</TableHead>
                      <TableHead>{t('Vendor')}</TableHead>
                      <TableHead>{t('Payment')}</TableHead>
                      <TableHead className="text-right">{t('Amount')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detailData.map((exp, idx) => (
                      <>
                        <TableRow
                          key={exp._id || idx}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => toggleRow(idx)}
                        >
                          <TableCell className="py-2">
                            {expandedRows.has(idx)
                              ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                              : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                          </TableCell>
                          <TableCell className="py-2 text-sm whitespace-nowrap">
                            {exp.date ? format(new Date(exp.date), 'dd MMM yyyy') : '—'}
                          </TableCell>
                          <TableCell className="py-2 text-sm font-medium">{exp.description}</TableCell>
                          <TableCell className="py-2 text-sm text-muted-foreground">{exp.vendor || '—'}</TableCell>
                          <TableCell className="py-2">
                            <Badge variant="outline" className="text-xs">{exp.paymentMethod}</Badge>
                          </TableCell>
                          <TableCell className="py-2 text-right font-semibold text-sm">
                            {fmt(exp.amount)}
                          </TableCell>
                        </TableRow>

                        {expandedRows.has(idx) && (
                          <TableRow key={`${exp._id}-detail`} className="bg-muted/30 hover:bg-muted/30">
                            <TableCell />
                            <TableCell colSpan={5} className="py-3 px-4">
                              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground">
                                <div>
                                  <span className="font-medium text-foreground">{t('Expense #')}: </span>
                                  {exp.expenseNumber || '—'}
                                </div>
                                <div>
                                  <span className="font-medium text-foreground">{t('Reference')}: </span>
                                  {exp.reference || '—'}
                                </div>
                                {exp.notes && (
                                  <div className="col-span-2">
                                    <span className="font-medium text-foreground">{t('Notes')}: </span>
                                    {exp.notes}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={5} className="font-semibold">
                        {t('Total')}
                      </TableCell>
                      <TableCell className="text-right font-bold text-base">
                        {fmt(detailTotal)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              )}
            </div>

            {/* Footer summary */}
            {!detailLoading && detailData.length > 0 && (
              <div className="border-t px-6 py-4 flex-shrink-0">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">
                    {format(new Date(startDate), 'dd MMM yyyy')} — {format(new Date(endDate), 'dd MMM yyyy')}
                  </span>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">{t('Total Expense')}</p>
                    <p className="font-bold text-lg">{fmt(detailTotal)}</p>
                  </div>
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    )
  },
)
