import { Link } from '@tanstack/react-router'
import { Settings2, X } from 'lucide-react'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import type { LedgerStatusBoard } from '@/stores/ledgerAlerts.api'
import { bandRangeText, hexToRgba, type LedgerColorFilter } from '../lib/ledger-colors'

/**
 * Colour key above a customer list: one chip per overdue band (customers · amount), due
 * today and due soon. Clicking a chip filters the list to those customers; the active chip
 * shows an ✕ to clear.
 */
export function LedgerColorLegend({
  board,
  filter,
  onFilterChange,
  className,
  compact = false,
}: {
  board: LedgerStatusBoard | undefined
  filter?: LedgerColorFilter
  onFilterChange?: (filter: LedgerColorFilter) => void
  className?: string
  compact?: boolean
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { hasAnyPermission } = usePermissions()
  if (!board || !board.settings.colorsEnabled) return null
  const { settings, totals } = board

  const chips: { key: string; color: string; label: string; hint: string; customers: number; amount: number }[] = [
    ...totals.bands.map((band) => ({
      key: `band:${band.index}`,
      color: band.color,
      label: band.label,
      hint: bandRangeText(settings.bands, band.index),
      customers: band.customers,
      amount: band.amount,
    })),
    {
      key: 'due_today',
      color: settings.dueTodayColor,
      label: settings.dueTodayLabel,
      hint: t('Falls due today'),
      customers: totals.dueTodayCustomers,
      amount: totals.dueTodayAmount,
    },
    ...(settings.dueSoonEnabled
      ? [
          {
            key: 'due_soon',
            color: settings.dueSoonColor,
            label: settings.dueSoonLabel,
            hint: `${t('Within')} ${settings.dueSoonDays} ${t('days')}`,
            customers: totals.dueSoonCustomers,
            amount: totals.dueSoonAmount,
          },
        ]
      : []),
  ]

  const interactive = Boolean(onFilterChange)
  const canConfigure = hasAnyPermission('editSettings', 'manageBusinessProfile')

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {chips.map((chip) => {
        const active = filter === chip.key
        const empty = chip.customers === 0
        return (
          <button
            key={chip.key}
            type='button'
            disabled={!interactive || (empty && !active)}
            onClick={() => onFilterChange?.(active ? 'all' : chip.key)}
            title={`${t(chip.label)} — ${chip.hint}`}
            className={cn(
              'group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
              interactive && !empty && 'hover:shadow-sm',
              empty && !active && 'opacity-45',
              active && 'ring-2 ring-offset-1 ring-offset-background'
            )}
            style={{
              backgroundColor: hexToRgba(chip.color, active ? 0.22 : 0.1),
              borderColor: hexToRgba(chip.color, 0.5),
              ...(active ? ({ '--tw-ring-color': chip.color } as React.CSSProperties) : {}),
            }}
          >
            <span className='h-2.5 w-2.5 shrink-0 rounded-full' style={{ backgroundColor: chip.color }} />
            <span className='whitespace-nowrap'>{t(chip.label)}</span>
            <span className='rounded-full bg-background/70 px-1.5 tabular-nums'>{chip.customers}</span>
            {!compact && chip.amount > 0 ? (
              <span className='hidden whitespace-nowrap tabular-nums text-muted-foreground sm:inline'>{formatMoney(chip.amount)}</span>
            ) : null}
            {active ? <X className='h-3 w-3' /> : null}
          </button>
        )
      })}
      {canConfigure ? (
        <Link
          to='/settings/ledger-alerts'
          className='inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground'
          title={t('Due dates & ledger colours settings')}
        >
          <Settings2 className='h-3.5 w-3.5' />
          {!compact ? <span className='hidden sm:inline'>{t('Colours')}</span> : null}
        </Link>
      ) : null}
    </div>
  )
}
