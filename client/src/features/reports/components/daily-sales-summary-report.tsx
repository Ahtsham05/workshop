import { forwardRef, useImperativeHandle, type ComponentType } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { format } from 'date-fns'
import {
  Package,
  Smartphone,
  Recycle,
  Wifi,
  IdCard,
  Wrench,
  Briefcase,
  Receipt,
  CreditCard,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  TrendingDown,
  Truck,
  Wallet,
  Landmark,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useGetDailySalesSummaryReportQuery, type DailySalesSummaryModule } from '@/stores/reports.api'
import { useBranchName } from '@/hooks/use-branch-name'
import { toneIconWrapClass, type StatCardTone } from '@/lib/stat-card-tones'
import { cn } from '@/lib/utils'

interface DailySalesSummaryReportProps {
  startDate: string
  endDate: string
}

const MODULE_STYLE: Record<string, { icon: ComponentType<{ className?: string }>; tone: StatCardTone }> = {
  products: { icon: Package, tone: 'sky' },
  newMobiles: { icon: Smartphone, tone: 'violet' },
  usedMobiles: { icon: Recycle, tone: 'cyan' },
  load: { icon: Wifi, tone: 'indigo' },
  simSale: { icon: IdCard, tone: 'violet' },
  repairing: { icon: Wrench, tone: 'orange' },
  services: { icon: Briefcase, tone: 'emerald' },
  billPayments: { icon: Receipt, tone: 'amber' },
  installments: { icon: CreditCard, tone: 'rose' },
  cashSent: { icon: ArrowUpRight, tone: 'emerald' },
  cashReceived: { icon: ArrowDownLeft, tone: 'rose' },
  purchases: { icon: Truck, tone: 'rose' },
  expenses: { icon: Wallet, tone: 'rose' },
  loadPurchase: { icon: Truck, tone: 'rose' },
}

const fmt = (v: number) => `Rs ${Math.round(v || 0).toLocaleString('en-PK')}`

function SummaryRow({ module: m }: { module: DailySalesSummaryModule }) {
  const style = MODULE_STYLE[m.key] ?? { icon: Package, tone: 'slate' as StatCardTone }
  const Icon = style.icon
  return (
    <div className='flex items-center justify-between gap-3 border-b border-dashed py-2.5 last:border-0'>
      <div className='flex min-w-0 items-center gap-2.5'>
        <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg p-0', toneIconWrapClass(style.tone))}>
          <Icon className='h-4 w-4' />
        </span>
        <span className='truncate text-sm font-medium'>{m.label}</span>
        {m.count != null && <span className='shrink-0 text-xs text-muted-foreground'>({m.count})</span>}
      </div>
      <div className='shrink-0 text-right'>
        <div className={cn('text-sm font-semibold tabular-nums', m.moneyOut && 'text-rose-600 dark:text-rose-400')}>
          {m.moneyOut ? '− ' : ''}{fmt(m.amount)}
        </div>
      </div>
    </div>
  )
}

function ModuleDetailCard({ module: m }: { module: DailySalesSummaryModule }) {
  const style = MODULE_STYLE[m.key] ?? { icon: Package, tone: 'slate' as StatCardTone }
  const Icon = style.icon
  return (
    <Card className='min-w-0'>
      <CardHeader className='flex flex-row items-center justify-between gap-2 space-y-0 pb-2'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg p-0', toneIconWrapClass(style.tone))}>
            <Icon className='h-3.5 w-3.5' />
          </span>
          <CardTitle className='truncate text-sm font-semibold'>{m.label}</CardTitle>
        </div>
        <span className='shrink-0 text-xs text-muted-foreground'>
          {m.items.length} {m.items.length === 1 ? 'entry' : 'entries'}
        </span>
      </CardHeader>
      <CardContent className='pt-0'>
        <div className='max-h-72 space-y-0 overflow-y-auto pr-1'>
          {m.items.map((item, idx) => (
            <div
              key={idx}
              className='flex items-center justify-between gap-2 border-b border-dashed py-1.5 text-sm last:border-0'
            >
              <div className='min-w-0'>
                <p className='truncate font-medium'>
                  {item.name}
                  {item.qty != null ? ` × ${item.qty}` : ''}
                </p>
                {item.detail && <p className='truncate text-xs text-muted-foreground'>{item.detail}</p>}
              </div>
              <span className='shrink-0 tabular-nums font-semibold'>{fmt(item.amount)}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

/** Compact, single-glance "what did I sell today" card — designed to be screenshotted and
 * sent to a salesman/owner, not scrolled through. Products/Load/Sim Sale/Repairing/Services/
 * Bill Payments/Installments make up the real Total Sales; New/Used Mobiles are shown as a
 * sub-breakdown of Products (they're regular invoices under the hood) so they aren't double
 * counted, and Cash Sent/Received are shown for the day's wallet activity with their commission. */
export const DailySalesSummaryReport = forwardRef<{ exportToExcel: () => void }, DailySalesSummaryReportProps>(
  ({ startDate, endDate }, ref) => {
    const branchName = useBranchName()
    const { data, isFetching: isLoading } = useGetDailySalesSummaryReportQuery({ startDate, endDate })

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        if (!data) {
          toast.error('No data available to export')
          return
        }
        const wb = XLSX.utils.book_new()
        const sheet = XLSX.utils.json_to_sheet([
          ...data.modules.map((m) => ({
            Module: m.label,
            Amount: m.amount,
            Count: m.count ?? '',
            Profit: m.profit,
            Note: m.includedIn ? `Included in ${m.includedIn}` : '',
          })),
          { Module: 'TOTAL SALES', Amount: data.totalSales, Count: '', Profit: data.totalProfit, Note: '' },
          { Module: 'TOTAL MONEY OUT', Amount: -data.totalMoneyOut, Count: '', Profit: '', Note: 'Purchases + Expenses paid' },
          { Module: 'CASH IN HAND — Opening Balance', Amount: data.cashInHand.opening, Count: '', Profit: '', Note: '' },
          { Module: 'CASH IN HAND — Total Income', Amount: data.cashInHand.totalIn, Count: '', Profit: '', Note: '' },
          { Module: 'CASH IN HAND — Total Expense', Amount: -data.cashInHand.totalOut, Count: '', Profit: '', Note: '' },
          { Module: 'CASH IN HAND — Closing', Amount: data.cashInHand.closing, Count: '', Profit: '', Note: '' },
        ])
        XLSX.utils.book_append_sheet(wb, sheet, 'Daily Summary')

        data.modules
          .filter((m) => m.items.length > 0)
          .forEach((m) => {
            const safeName = m.label.replace(/[\\/*?:[\]]/g, '').slice(0, 28)
            const itemSheet = XLSX.utils.json_to_sheet(
              m.items.map((item) => ({
                Name: item.name,
                Detail: item.detail || '',
                Qty: item.qty ?? '',
                Amount: item.amount,
                Date: item.date ? format(new Date(item.date), 'yyyy-MM-dd HH:mm') : '',
                Status: item.status || '',
              })),
            )
            XLSX.utils.book_append_sheet(wb, itemSheet, safeName)
          })

        XLSX.writeFile(wb, `daily-sales-summary-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
        toast.success('Data exported successfully')
      },
    }))

    if (isLoading) {
      return (
        <div className='mx-auto max-w-xl'>
          <Skeleton className='h-[560px] w-full' />
        </div>
      )
    }

    const modules = data?.modules ?? []
    // Hide rows with nothing to show — a zero-amount module is just noise on a report
    // meant to be screenshotted and shared as-is.
    const primaryModules = modules.filter((m) => !m.includedIn && !m.moneyOut && m.amount !== 0)
    const subModules = modules.filter((m) => m.includedIn && m.amount !== 0)
    const moneyOutModules = modules.filter((m) => m.moneyOut && m.amount !== 0)
    const cashInHand = data?.cashInHand
    const sameDay = startDate === endDate

    return (
      <div className='space-y-6'>
        {modules.some((m) => m.items.length > 0) && (
          <div className='space-y-3'>
            <h3 className='text-sm font-semibold text-muted-foreground'>Details — who bought what</h3>
            <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3'>
              {modules
                .filter((m) => m.items.length > 0)
                .map((m) => (
                  <ModuleDetailCard key={m.key} module={m} />
                ))}
            </div>
          </div>
        )}

        <Card className='mx-auto max-w-xl border-2 shadow-md'>
          <CardHeader className='items-center border-b bg-muted/30 pb-4 text-center'>
            {branchName && (
              <p className='text-sm font-semibold uppercase tracking-wide text-muted-foreground'>{branchName}</p>
            )}
            <CardTitle className='text-xl'>Daily Sales Summary</CardTitle>
            <CardDescription>
              {sameDay
                ? format(new Date(startDate), 'dd MMM yyyy')
                : `${format(new Date(startDate), 'dd MMM yyyy')} — ${format(new Date(endDate), 'dd MMM yyyy')}`}
            </CardDescription>
          </CardHeader>
          <CardContent className='pt-4'>
            {primaryModules.map((m) => (
              <SummaryRow key={m.key} module={m} />
            ))}

            <div className='mt-3 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-3'>
              <div className='flex items-center gap-2'>
                <TrendingUp className='h-4 w-4 text-emerald-600 dark:text-emerald-400' />
                <span className='text-base font-bold'>Total Sales</span>
              </div>
              <span className='text-lg font-bold tabular-nums'>{fmt(data?.totalSales ?? 0)}</span>
            </div>

            {subModules.length > 0 && (
              <div className='mt-4 rounded-md border border-dashed p-3'>
                <p className='mb-2 text-xs font-medium text-muted-foreground'>Included in Products —</p>
                {subModules.map((m) => (
                  <div key={m.key} className='flex items-center justify-between py-0.5 text-sm'>
                    <span className='flex items-center gap-1.5 text-muted-foreground'>
                      {m.label}
                      {m.count != null && <span className='text-xs'>({m.count})</span>}
                    </span>
                    <span className='tabular-nums'>{fmt(m.amount)}</span>
                  </div>
                ))}
              </div>
            )}

            {moneyOutModules.length > 0 && (
              <div className='mt-4 border-t pt-3'>
                <p className='mb-1 text-xs font-medium text-muted-foreground'>Money Out —</p>
                {moneyOutModules.map((m) => (
                  <SummaryRow key={m.key} module={m} />
                ))}
                <div className='mt-3 flex items-center justify-between rounded-lg bg-rose-50 px-3 py-3 dark:bg-rose-500/10'>
                  <div className='flex items-center gap-2'>
                    <TrendingDown className='h-4 w-4 text-rose-600 dark:text-rose-400' />
                    <span className='text-base font-bold'>Total Money Out</span>
                  </div>
                  <span className='text-lg font-bold tabular-nums text-rose-600 dark:text-rose-400'>
                    − {fmt(data?.totalMoneyOut ?? 0)}
                  </span>
                </div>
              </div>
            )}

            {cashInHand && (
              <div
                className={cn(
                  'mt-4 flex items-center justify-between rounded-lg border-2 px-3 py-3',
                  cashInHand.closing >= 0
                    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-500/10'
                    : 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-500/10',
                )}
              >
                <div className='flex items-center gap-2'>
                  <Landmark className={cn('h-4 w-4', cashInHand.closing >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')} />
                  <span className='text-base font-bold'>Cash In Hand</span>
                </div>
                <span
                  className={cn(
                    'text-lg font-bold tabular-nums',
                    cashInHand.closing >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
                  )}
                >
                  {fmt(cashInHand.closing)}
                </span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  },
)

DailySalesSummaryReport.displayName = 'DailySalesSummaryReport'
