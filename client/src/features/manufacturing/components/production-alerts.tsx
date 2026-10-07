import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
} from 'lucide-react'
import type { AlertSeverity, ProductionAlert } from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { orderPath } from '../lib/constants'
import { Panel } from './page'

/* Status colours are reserved for state and always travel with an icon and a word. */
const SEVERITY: Record<
  AlertSeverity,
  { icon: React.ElementType; className: string; label: string }
> = {
  critical: {
    icon: AlertOctagon,
    className: 'text-rose-600 dark:text-rose-400',
    label: 'Critical',
  },
  warning: {
    icon: AlertTriangle,
    className: 'text-amber-600 dark:text-amber-400',
    label: 'Warning',
  },
  success: {
    icon: CheckCircle2,
    className: 'text-emerald-600 dark:text-emerald-400',
    label: 'Done',
  },
  info: {
    icon: Info,
    className: 'text-sky-600 dark:text-sky-400',
    label: 'Info',
  },
}

const rtf =
  typeof Intl !== 'undefined' && 'RelativeTimeFormat' in Intl
    ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
    : null

function ago(iso?: string) {
  if (!iso || !rtf) return null
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (Math.abs(days) >= 1) return rtf.format(days, 'day')
  const hours = Math.round((new Date(iso).getTime() - Date.now()) / 3_600_000)
  return rtf.format(hours, 'hour')
}

const COLLAPSED = 5

/** Exceptions first (shortages, delays, high scrap, QC backlog), then recent completions. */
export function ProductionAlerts({
  alerts,
  counts,
  loading,
  className,
}: {
  alerts?: ProductionAlert[]
  counts?: Partial<Record<AlertSeverity, number>>
  loading?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  const [expanded, setExpanded] = useState(false)
  const list = alerts || []
  const shown = expanded ? list : list.slice(0, COLLAPSED)
  const problems = (counts?.critical || 0) + (counts?.warning || 0)

  return (
    <Panel
      className={className}
      title={t('Production alerts')}
      description={
        loading
          ? t('Checking orders, stock and quality…')
          : problems
            ? t('{{n}} need attention').replace('{{n}}', String(problems))
            : t('No problems detected')
      }
      flush
    >
      {loading ? (
        <div className='space-y-4 p-5'>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className='flex gap-3'>
              <Skeleton className='h-4 w-4 rounded-full' />
              <div className='flex-1 space-y-1.5'>
                <Skeleton className='h-3.5 w-1/3' />
                <Skeleton className='h-3.5 w-4/5' />
              </div>
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        <div className='flex items-center gap-3 px-5 py-8 text-sm'>
          <CheckCircle2 className='h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400' />
          <span className='text-muted-foreground'>
            {t('No shortages, delays, scrap spikes or QC backlog right now.')}
          </span>
        </div>
      ) : (
        <>
          <ul className='divide-y' aria-label={t('Production alerts')}>
            {shown.map((a) => {
              const meta = SEVERITY[a.severity]
              const Icon = meta.icon
              const to = a.link.order
                ? orderPath({ id: a.link.order, orderType: a.link.orderType })
                : a.link.to || '/manufacturing'
              const when = ago(a.at)
              return (
                <li key={a.id}>
                  <Link
                    to={to as never}
                    className='hover:bg-muted/40 focus-visible:ring-ring flex min-h-14 items-start gap-3 px-5 py-3 outline-none focus-visible:ring-2 focus-visible:ring-inset max-sm:px-4'
                  >
                    <Icon
                      className={cn('mt-0.5 h-4 w-4 shrink-0', meta.className)}
                      aria-hidden
                    />
                    <span className='min-w-0 flex-1'>
                      <span className='flex items-baseline justify-between gap-2'>
                        <span className='text-sm font-medium'>
                          <span className='sr-only'>{t(meta.label)}: </span>
                          {t(a.title)}
                        </span>
                        {when && (
                          <span className='text-muted-foreground shrink-0 text-xs'>
                            {when}
                          </span>
                        )}
                      </span>
                      <span className='text-muted-foreground block text-sm'>
                        {a.message}
                      </span>
                    </span>
                    <ChevronRight
                      className='text-muted-foreground mt-0.5 h-4 w-4 shrink-0'
                      aria-hidden
                    />
                  </Link>
                </li>
              )
            })}
          </ul>
          {list.length > COLLAPSED && (
            <div className='border-t px-3 py-2'>
              <Button
                variant='ghost'
                size='sm'
                className='w-full'
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
              >
                {expanded
                  ? t('Show fewer')
                  : t('Show all {{n}} alerts').replace(
                      '{{n}}',
                      String(list.length)
                    )}
              </Button>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}
