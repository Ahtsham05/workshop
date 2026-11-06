import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  CircleCheckBig,
  ClipboardList,
  ShoppingCart,
  Timer,
  Wallet,
  Wrench,
} from 'lucide-react'
import {
  useGetRepairStatsQuery,
  useGetRepairStockSummaryQuery,
  type RepairJobRecord,
} from '@/stores/mobile-shop.api'
import { formatMoneyWithMeta, useCurrencyMeta } from '@/lib/format-money'
import { MOBILE_FORM_KEYBOARD_HINT } from '@/lib/mobile-form-keyboard'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/context/permission-context'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { MobilePageShell } from '../components/mobile-page-shell'
import { IntakeForm } from './components/intake-form'
import { JobSheet } from './components/job-sheet'
import { PartsUsageCard } from './components/parts-usage-card'
import { RepairQueue, type QueueTab } from './components/repair-queue'
import {
  PurchaseRepairPartsCard,
  RepairStockLedgerCard,
} from './components/repair-stock-cards'
import { useRepairPrint } from './lib/use-repair-print'

/**
 * Repair center: phones, tablets, laptops, PCs, printers, TVs, consoles… Intake on the
 * left, the live queue (list or board) on the right, every job opens in a side sheet.
 */
const SECTION_KEY = 'repair-page-section'

export default function RepairPage() {
  const currencyMeta = useCurrencyMeta()
  const fmt = (n?: number) => formatMoneyWithMeta(n ?? 0, currencyMeta)
  const { hasExplicitPermission } = usePermissions()
  const canManage = hasExplicitPermission('manageRepairs')
  const { data: stats, isLoading: statsLoading } = useGetRepairStatsQuery()
  const { printReceipt, printTag } = useRepairPrint()
  const [openJobId, setOpenJobIdState] = useState<string | null>(null)
  const [autoComplete, setAutoComplete] = useState(false)
  const setOpenJobId = (id: string | null, action?: 'complete') => {
    setAutoComplete(action === 'complete')
    setOpenJobIdState(id)
  }
  const intakeRef = useRef<HTMLDivElement>(null)
  const queueRef = useRef<HTMLDivElement>(null)
  const [queueTab, setQueueTab] = useState<QueueTab>('open')
  const [section, setSectionState] = useState<'jobs' | 'stock'>(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('section')
      if (fromUrl === 'stock' || fromUrl === 'jobs') return fromUrl
      return localStorage.getItem(SECTION_KEY) === 'stock' ? 'stock' : 'jobs'
    } catch {
      return 'jobs'
    }
  })
  const setSection = (next: 'jobs' | 'stock') => {
    setSectionState(next)
    try {
      localStorage.setItem(SECTION_KEY, next)
    } catch {
      /* not remembered */
    }
  }
  const { data: stockSummary } = useGetRepairStockSummaryQuery()
  /** A summary card filters the queue below (on the jobs tab) and brings it into view. */
  const filterQueue = (tab: QueueTab) => {
    setSection('jobs')
    setQueueTab(tab)
    window.setTimeout(
      () =>
        queueRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        }),
      50
    )
  }

  // ?job=<id> deep link (e.g. from a report) opens that job.
  useEffect(() => {
    try {
      const id = new URLSearchParams(window.location.search).get('job')
      if (id) setOpenJobId(id)
    } catch {
      /* ignore */
    }
  }, [])

  const onCreated = (
    job: RepairJobRecord,
    print: { card: boolean; tag: boolean }
  ) => {
    if (print.card) printReceipt(job, 'job_card')
    if (print.tag) window.setTimeout(() => printTag(job), print.card ? 600 : 0)
  }

  const focusIntake = () => {
    setSection('jobs')
    intakeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    window.setTimeout(
      () => document.getElementById('ri-customer')?.focus(),
      300
    )
  }

  return (
    <MobilePageShell
      title='Repair Management'
      description={`Phones, tablets, laptops, PCs, printers, TVs and more — intake, parts, payments and delivery. · ${MOBILE_FORM_KEYBOARD_HINT}`}
    >
      <div className='mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6'>
        <div
          className={cn(
            'h-full rounded-xl transition-shadow',
            section === 'jobs' && queueTab === 'open' && 'ring-primary ring-2'
          )}
        >
          <StatCard
            inlineHeaderOnMobile
            onClick={() => filterQueue('open')}
            title='Open jobs'
            value={stats?.open ?? 0}
            icon={<Wrench className='h-5 w-5' />}
            tone='sky'
            isLoading={statsLoading}
            description={`${stats?.receivedToday ?? 0} received today`}
          />
        </div>
        <div
          className={cn(
            'h-full rounded-xl transition-shadow',
            section === 'jobs' &&
              queueTab === 'completed' &&
              'ring-primary ring-2'
          )}
        >
          <StatCard
            inlineHeaderOnMobile
            onClick={() => filterQueue('completed')}
            title='Ready for pickup'
            value={stats?.readyForPickup ?? 0}
            icon={<CircleCheckBig className='h-5 w-5' />}
            tone='emerald'
            isLoading={statsLoading}
            description='Waiting for the customer'
          />
        </div>
        <div
          className={cn(
            'h-full rounded-xl transition-shadow',
            section === 'jobs' &&
              queueTab === 'overdue' &&
              'ring-primary ring-2'
          )}
        >
          <StatCard
            inlineHeaderOnMobile
            onClick={() => filterQueue('overdue')}
            title='Overdue'
            value={stats?.overdue ?? 0}
            icon={<AlertTriangle className='h-5 w-5' />}
            tone='rose'
            isLoading={statsLoading}
            description='Past the promised date'
          />
        </div>
        <div
          className={cn(
            'h-full rounded-xl transition-shadow',
            section === 'jobs' &&
              queueTab === 'waiting' &&
              'ring-primary ring-2'
          )}
        >
          <StatCard
            inlineHeaderOnMobile
            onClick={() => filterQueue('waiting')}
            title='Waiting'
            value={
              (stats?.counts?.waiting_approval ?? 0) +
              (stats?.counts?.waiting_parts ?? 0)
            }
            icon={<Timer className='h-5 w-5' />}
            tone='amber'
            isLoading={statsLoading}
            description={`${stats?.counts?.waiting_approval ?? 0} approval · ${stats?.counts?.waiting_parts ?? 0} parts`}
          />
        </div>
        <div
          className={cn(
            'h-full rounded-xl transition-shadow',
            section === 'jobs' && queueTab === 'unpaid' && 'ring-primary ring-2'
          )}
        >
          <StatCard
            inlineHeaderOnMobile
            onClick={() => filterQueue('unpaid')}
            title='Outstanding'
            value={fmt(stats?.outstanding)}
            icon={<Wallet className='h-5 w-5' />}
            tone='orange'
            isLoading={statsLoading}
            description='Unpaid on finished jobs'
          />
        </div>
        <div
          className={cn(
            'h-full rounded-xl transition-shadow',
            section === 'jobs' &&
              queueTab === 'delivered' &&
              'ring-primary ring-2'
          )}
        >
          <StatCard
            inlineHeaderOnMobile
            onClick={() => filterQueue('delivered')}
            title='Delivered this month'
            value={stats?.deliveredThisMonth ?? 0}
            icon={<ClipboardList className='h-5 w-5' />}
            tone='violet'
            isLoading={statsLoading}
            description={
              stats
                ? `${fmt(stats.revenueThisMonth)} billed${stats.avgTurnaroundHours != null ? ` · ~${stats.avgTurnaroundHours < 48 ? `${stats.avgTurnaroundHours}h` : `${Math.round(stats.avgTurnaroundHours / 24)}d`} turnaround` : ''}`
                : undefined
            }
          />
        </div>
      </div>

      {/* Jobs and the repair stock (purchases + ledger) live on separate tabs. */}
      <div
        role='tablist'
        aria-label='Repair sections'
        className='bg-muted mb-4 inline-flex rounded-lg p-1'
      >
        {(
          [
            [
              'jobs',
              'Repair jobs',
              Wrench,
              stats ? `${stats.open} open` : null,
            ],
            [
              'stock',
              'Repair stock & purchases',
              ShoppingCart,
              stockSummary ? `${fmt(stockSummary.balance)} left` : null,
            ],
          ] as const
        ).map(([value, label, Icon, badge]) => (
          <button
            key={value}
            type='button'
            role='tab'
            aria-selected={section === value}
            onClick={() => setSection(value)}
            className={cn(
              'inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors sm:px-4',
              section === value
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className='h-4 w-4' aria-hidden />
            <span>{label}</span>
            {badge && (
              <span
                className={cn(
                  'hidden rounded-full px-2 py-0.5 text-xs sm:inline',
                  section === value
                    ? 'bg-primary/10 text-primary'
                    : 'bg-background/60'
                )}
              >
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {section === 'jobs' ? (
        <div className='grid grid-cols-1 gap-6 xl:grid-cols-[440px_minmax(0,1fr)]'>
          {canManage ? (
            <div ref={intakeRef} className='scroll-mt-4'>
              <IntakeForm onCreated={(job, print) => onCreated(job, print)} />
            </div>
          ) : null}
          <div ref={queueRef} className='min-w-0 scroll-mt-4'>
            <RepairQueue
              tab={queueTab}
              onTabChange={setQueueTab}
              stats={stats}
              canManage={canManage}
              onOpenJob={(id, action) => setOpenJobId(id, action)}
              onNewJob={canManage ? focusIntake : undefined}
            />
          </div>
        </div>
      ) : (
        // Repair stock bought as a lump — jobs draw from it with their Repair cost.
        <div className='grid grid-cols-1 gap-6 xl:grid-cols-[440px_minmax(0,1fr)]'>
          {canManage ? <PurchaseRepairPartsCard /> : null}
          <div className='min-w-0 space-y-6'>
            <RepairStockLedgerCard
              canManage={canManage}
              onOpenJob={(id) => setOpenJobId(id)}
            />
            <PartsUsageCard onOpenJob={(id) => setOpenJobId(id)} />
          </div>
        </div>
      )}

      <JobSheet
        jobId={openJobId}
        canManage={canManage}
        autoComplete={autoComplete}
        onOpenChange={(o) => !o && setOpenJobId(null)}
      />
    </MobilePageShell>
  )
}
