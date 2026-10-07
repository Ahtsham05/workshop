import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import {
  Boxes,
  ClipboardList,
  Cog,
  Factory,
  FileStack,
  Gauge,
  Layers,
  PackageCheck,
  PackageMinus,
  Recycle,
  Workflow,
  ListChecks,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useBranchName } from '@/hooks/use-branch-name'

const MANUFACTURING_SECTIONS = [
  { to: '/manufacturing', label: 'Dashboard', icon: Gauge, exact: true },
  { to: '/manufacturing/products', label: 'Products', icon: Boxes },
  { to: '/manufacturing/boms', label: 'Bills of Materials', icon: FileStack },
  {
    to: '/manufacturing/production-orders',
    label: 'Production Orders',
    icon: ClipboardList,
  },
  {
    to: '/manufacturing/requirements',
    label: 'Material Requirements',
    icon: ListChecks,
  },
  {
    to: '/manufacturing/material-issues',
    label: 'Material Issues',
    icon: PackageMinus,
  },
  { to: '/manufacturing/wip', label: 'WIP', icon: Workflow },
  { to: '/manufacturing/assemblies', label: 'Assemblies', icon: Layers },
  {
    to: '/manufacturing/finished-goods',
    label: 'Finished Goods',
    icon: PackageCheck,
  },
  { to: '/manufacturing/scrap', label: 'Scrap', icon: Recycle },
  {
    to: '/manufacturing/settings',
    label: 'Settings',
    icon: Cog,
    permission: 'manageManufacturingSettings' as const,
  },
] as const

/**
 * Module frame for every /manufacturing page: a compact identity band (module, branch)
 * and one horizontal section rail, so the whole module reads as one workspace instead of
 * a dozen disconnected admin screens.
 */
export default function ManufacturingShell() {
  const { t } = useLanguage()
  const branchName = useBranchName()
  const { hasPermission } = usePermissions()
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  const sections = MANUFACTURING_SECTIONS.filter(
    (s) => !('permission' in s) || hasPermission(s.permission)
  )
  const isActive = (to: string, exact?: boolean) =>
    exact
      ? pathname === to || pathname === `${to}/`
      : pathname === to || pathname.startsWith(`${to}/`)

  return (
    <div className='space-y-5 max-sm:space-y-4'>
      <div className='from-primary/[0.07] via-background to-background relative overflow-hidden rounded-2xl border bg-gradient-to-br px-5 py-4 max-sm:px-4'>
        <div
          className='bg-primary/10 pointer-events-none absolute -top-16 -right-10 h-44 w-44 rounded-full blur-3xl'
          aria-hidden
        />
        <div className='relative flex flex-wrap items-center gap-3'>
          <div className='bg-primary text-primary-foreground flex h-10 w-10 items-center justify-center rounded-xl shadow-sm'>
            <Factory className='h-5 w-5' />
          </div>
          <div className='min-w-0'>
            <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase'>
              {t('Operations')}
            </p>
            <h1 className='text-xl font-semibold tracking-tight'>
              {t('Manufacturing')}
            </h1>
          </div>
          {branchName && (
            <span className='bg-background/70 text-muted-foreground ml-auto rounded-full border px-3 py-1 text-xs backdrop-blur'>
              {t('Branch')}:{' '}
              <span className='text-foreground font-medium'>{branchName}</span>
            </span>
          )}
        </div>
        <nav
          className='relative -mx-1 mt-4 flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none]'
          aria-label={t('Manufacturing sections')}
        >
          {sections.map((section) => {
            const active = isActive(
              section.to,
              'exact' in section ? section.exact : false
            )
            const Icon = section.icon
            return (
              <Link
                key={section.to}
                to={section.to as never}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
                  active
                    ? 'bg-foreground text-background shadow-sm'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className='h-3.5 w-3.5' />
                {t(section.label)}
              </Link>
            )
          })}
        </nav>
      </div>
      <Outlet />
    </div>
  )
}

/** Consistent page heading inside the shell. */
export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className='flex flex-wrap items-end justify-between gap-3'>
      <div>
        <h2 className='text-lg font-semibold tracking-tight'>{title}</h2>
        {description && (
          <p className='text-muted-foreground text-sm'>{description}</p>
        )}
      </div>
      {actions && (
        <div className='flex flex-wrap items-center gap-2 max-sm:w-full'>
          {actions}
        </div>
      )}
    </div>
  )
}

/** Quiet empty state with an optional call to action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className='flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center'>
      <div className='bg-muted flex h-11 w-11 items-center justify-center rounded-full'>
        <Icon className='text-muted-foreground h-5 w-5' />
      </div>
      <p className='font-medium'>{title}</p>
      {description && (
        <p className='text-muted-foreground max-w-sm text-sm'>{description}</p>
      )}
      {action && <div className='mt-2'>{action}</div>}
    </div>
  )
}
