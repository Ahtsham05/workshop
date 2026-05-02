import { RestaurantShell } from '@/features/restaurant/shell'
import { useGetRestaurantStatsQuery } from '@/stores/restaurant.api'
import type { ReactNode } from 'react'
import {
  UtensilsCrossed,
  Banknote,
  ClipboardList,
  Armchair,
  LayoutGrid,
  ChefHat,
} from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'

const statTones = {
  sky: {
    card: 'from-sky-500 via-sky-600 to-blue-700 dark:from-sky-600 dark:via-blue-700 dark:to-indigo-900',
    iconWrap: 'bg-white/25 text-white ring-1 ring-white/30',
    skeleton: 'bg-white/30',
  },
  emerald: {
    card: 'from-emerald-500 via-teal-600 to-cyan-700 dark:from-emerald-600 dark:via-teal-700 dark:to-cyan-900',
    iconWrap: 'bg-white/25 text-white ring-1 ring-white/30',
    skeleton: 'bg-white/30',
  },
  amber: {
    card: 'from-amber-500 via-orange-500 to-rose-600 dark:from-amber-600 dark:via-orange-600 dark:to-rose-800',
    iconWrap: 'bg-white/25 text-white ring-1 ring-white/30',
    skeleton: 'bg-white/30',
  },
  violet: {
    card: 'from-violet-500 via-purple-600 to-fuchsia-700 dark:from-violet-600 dark:via-purple-700 dark:to-fuchsia-900',
    iconWrap: 'bg-white/25 text-white ring-1 ring-white/30',
    skeleton: 'bg-white/30',
  },
} as const

type StatTone = keyof typeof statTones

export default function RestaurantDashboardPage() {
  const { data: stats, isLoading } = useGetRestaurantStatsQuery()

  return (
    <RestaurantShell
      title='Restaurant overview'
      description='Live service snapshot for your venue — covers, revenue, and floor status.'
    >
      <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
        <StatCard
          title='Orders today'
          value={stats?.todayOrders}
          loading={isLoading}
          tone='sky'
          icon={<ClipboardList className='h-6 w-6' strokeWidth={2.25} />}
        />
        <StatCard
          title='Revenue today'
          value={
            stats != null
              ? stats.todayRevenue.toLocaleString(undefined, {
                  style: 'currency',
                  currency: 'PKR',
                })
              : undefined
          }
          loading={isLoading}
          tone='emerald'
          icon={<Banknote className='h-6 w-6' strokeWidth={2.25} />}
        />
        <StatCard
          title='Open tickets'
          value={stats?.openOrders}
          loading={isLoading}
          tone='amber'
          icon={<UtensilsCrossed className='h-6 w-6' strokeWidth={2.25} />}
        />
        <StatCard
          title='Tables in service'
          value={stats?.tablesOccupied}
          loading={isLoading}
          tone='violet'
          icon={<Armchair className='h-6 w-6' strokeWidth={2.25} />}
        />
      </div>

      <div className='mt-8 grid gap-5 md:grid-cols-2'>
        <ActionPanel
          title='Front of house'
          subtitle='Service, tables, and guest flow'
          gradient='from-rose-500/15 via-background to-amber-500/10 dark:from-rose-500/20 dark:via-card dark:to-amber-500/15'
          border='border-rose-200/60 dark:border-rose-500/25'
          icon={<LayoutGrid className='h-5 w-5' />}
          actions={[
            { to: '/restaurant/pos', label: 'Open POS', className: 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-500/25' },
            { to: '/restaurant/tables', label: 'Floor plan', className: 'bg-white/80 hover:bg-white dark:bg-white/10 dark:hover:bg-white/15 text-rose-900 dark:text-rose-100 border border-rose-200/80 dark:border-rose-400/30' },
            { to: '/restaurant/reservations', label: 'Reservations', className: 'bg-amber-500/90 hover:bg-amber-400 text-white shadow-md shadow-amber-500/20' },
          ]}
        />
        <ActionPanel
          title='Back of house'
          subtitle='Kitchen, QR, and reporting'
          gradient='from-cyan-500/12 via-background to-indigo-500/12 dark:from-cyan-500/18 dark:via-card dark:to-indigo-500/15'
          border='border-cyan-200/60 dark:border-cyan-500/25'
          icon={<ChefHat className='h-5 w-5' />}
          actions={[
            { to: '/restaurant/kitchen', label: 'Kitchen display', className: 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-500/25' },
            { to: '/restaurant/qr', label: 'QR & print', className: 'bg-white/80 hover:bg-white dark:bg-white/10 dark:hover:bg-white/15 text-cyan-900 dark:text-cyan-100 border border-cyan-200/80 dark:border-cyan-400/30' },
            { to: '/restaurant/reports', label: 'Service reports', className: 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/25' },
          ]}
        />
      </div>
    </RestaurantShell>
  )
}

function StatCard({
  title,
  value,
  loading,
  icon,
  tone,
}: {
  title: string
  value?: string | number
  loading: boolean
  icon: ReactNode
  tone: StatTone
}) {
  const t = statTones[tone]
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-lg shadow-black/10 ring-1 ring-black/5 dark:shadow-black/30',
        t.card,
      )}
    >
      <div className='absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-2xl' />
      <div className='absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-white/5 blur-xl' />
      <div className='relative flex items-start justify-between gap-3'>
        <p className='text-sm font-medium text-white/90'>{title}</p>
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl backdrop-blur-sm',
            t.iconWrap,
          )}
        >
          {icon}
        </div>
      </div>
      <div className='relative mt-4'>
        {loading ? (
          <Skeleton className={cn('h-9 w-28 rounded-lg', t.skeleton)} />
        ) : (
          <p className='text-3xl font-bold tabular-nums tracking-tight text-white drop-shadow-sm'>
            {value ?? '—'}
          </p>
        )}
      </div>
    </div>
  )
}

function ActionPanel({
  title,
  subtitle,
  gradient,
  border,
  icon,
  actions,
}: {
  title: string
  subtitle: string
  gradient: string
  border: string
  icon: ReactNode
  actions: { to: string; label: string; className: string }[]
}) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-6 shadow-lg shadow-black/5 transition-shadow hover:shadow-xl dark:shadow-black/20',
        border,
        gradient,
      )}
    >
      <div className='absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/40 via-transparent to-transparent opacity-50 dark:from-white/5' />
      <div className='relative flex items-start gap-3'>
        <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-foreground/10 to-foreground/5 text-foreground shadow-inner'>
          {icon}
        </div>
        <div>
          <h3 className='text-lg font-semibold tracking-tight'>{title}</h3>
          <p className='text-sm text-muted-foreground'>{subtitle}</p>
        </div>
      </div>
      <div className='relative mt-5 flex flex-wrap gap-2.5'>
        {actions.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className={cn(
              'inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]',
              a.className,
            )}
          >
            {a.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
