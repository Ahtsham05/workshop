import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRight, Eye, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import { applyOrder, DASHBOARD_SECTIONS, useDashboardLayout } from '@/features/dashboard/lib/dashboard-layout'
import {
  DASHBOARD_CARD_GROUPS,
  DASHBOARD_SECTION_INFO,
  useDashboardItemAvailable,
  type DashboardItem,
} from '@/features/dashboard/lib/dashboard-items'
import ContentSection from '../components/content-section'

/**
 * Settings → Dashboard: switch any section, chart or key-figure card of the main dashboard
 * on or off. Saved on the person's account (User.uiPreferences.dashboardLayout.hidden), so it
 * follows them to every device and nobody else is affected. Items their role can't see, or
 * that don't apply to the business type, aren't listed at all.
 */

function ItemSwitch({
  item,
  checked,
  disabled,
  onChange,
  compact,
}: {
  item: DashboardItem
  checked: boolean
  disabled?: boolean
  onChange: (on: boolean) => void
  compact?: boolean
}) {
  const { t } = useLanguage()
  const id = `dash-item-${item.id}`
  return (
    <div className={cn('flex items-start justify-between gap-3', compact ? 'py-1' : 'py-1.5', disabled && 'opacity-50')}>
      <div className='min-w-0'>
        <Label htmlFor={id} className={cn('text-sm font-normal', !disabled && 'cursor-pointer')}>
          {t(item.label)}
        </Label>
        {item.hint && !compact && <p className='text-muted-foreground mt-0.5 text-xs'>{t(item.hint)}</p>}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  )
}

export default function SettingsDashboard() {
  const { t } = useLanguage()
  const { layout, isOn, setOn, showEverything, hiddenCount } = useDashboardLayout()
  const available = useDashboardItemAvailable()

  const cardGroups = useMemo(
    () =>
      DASHBOARD_CARD_GROUPS.map((group) => ({ ...group, items: group.items.filter(available) })).filter(
        (group) => group.items.length > 0
      ),
    [available]
  )

  const sections = useMemo(
    () =>
      applyOrder(DASHBOARD_SECTIONS, layout.sections)
        .map((id) => {
          const info = DASHBOARD_SECTION_INFO[id]
          return { ...info, widgets: info.widgets?.filter(available) }
        })
        // A section whose every part is off-limits for this role never shows, so no switch for it.
        .filter((s) => (s.id === 'kpis' ? cardGroups.length > 0 : !s.widgets || s.widgets.length > 0)),
    [layout.sections, available, cardGroups.length]
  )

  // "12 of 40 showing" counts what the person would actually see.
  const allCards = cardGroups.flatMap((g) => g.items)
  const totals = sections.reduce(
    (acc, s) => {
      const parts = s.id === 'kpis' ? allCards : s.widgets ?? [{ id: s.id, label: s.label }]
      acc.total += parts.length
      if (isOn(s.id)) acc.shown += parts.filter((p) => p.id === s.id || isOn(p.id)).length
      return acc
    },
    { shown: 0, total: 0 }
  )

  return (
    <ContentSection
      title={t('Dashboard')}
      desc={t('Choose what your dashboard shows. Switch off a whole section, a single chart or any number card. Only you see these choices, on every device.')}
    >
      <div className='space-y-4'>
        <div className='bg-muted/40 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5'>
          <div className='flex items-center gap-2 text-sm'>
            <Eye className='text-muted-foreground size-4' aria-hidden />
            <span>
              <span className='font-semibold tabular-nums'>{totals.shown}</span>{' '}
              {t('of {{total}} items showing', { total: totals.total })}
            </span>
          </div>
          <div className='flex items-center gap-1'>
            <Button type='button' variant='ghost' size='sm' className='gap-1.5' onClick={showEverything} disabled={hiddenCount === 0}>
              <RotateCcw className='size-3.5' aria-hidden />
              {t('Show everything')}
            </Button>
            <Button asChild variant='outline' size='sm' className='gap-1.5'>
              <Link to='/'>
                {t('Open dashboard')}
                <ArrowUpRight className='size-3.5' aria-hidden />
              </Link>
            </Button>
          </div>
        </div>

        {sections.map((section) => {
          const sectionOn = isOn(section.id)
          return (
            <div key={section.id} className={cn('rounded-lg border p-3 transition-colors', !sectionOn && 'bg-muted/30')}>
              <ItemSwitch
                item={{ id: section.id, label: section.label, hint: section.hint }}
                checked={sectionOn}
                onChange={(on) => setOn(section.id, on)}
              />

              {section.widgets && section.widgets.length > 1 && (
                <div className='mt-2 ml-1 border-l pl-3'>
                  {section.widgets.map((widget) => (
                    <ItemSwitch
                      key={widget.id}
                      item={widget}
                      checked={isOn(widget.id)}
                      disabled={!sectionOn}
                      onChange={(on) => setOn(widget.id, on)}
                    />
                  ))}
                </div>
              )}

              {section.id === 'kpis' && (
                <div className={cn('mt-3 space-y-4', !sectionOn && 'pointer-events-none opacity-50')} aria-disabled={!sectionOn}>
                  {cardGroups.map((group) => {
                    const ids = group.items.map((i) => i.id)
                    const onCount = ids.filter(isOn).length
                    return (
                      <div key={group.label}>
                        <div className='mb-1 flex items-center justify-between gap-2'>
                          <p className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
                            {t(group.label)}{' '}
                            <span className='tabular-nums normal-case'>
                              ({onCount}/{ids.length})
                            </span>
                          </p>
                          <div className='flex items-center gap-1 text-xs'>
                            <button
                              type='button'
                              className='text-primary rounded px-1.5 py-0.5 hover:underline disabled:opacity-40 disabled:no-underline'
                              disabled={!sectionOn || onCount === ids.length}
                              onClick={() => setOn(ids, true)}
                            >
                              {t('All on')}
                            </button>
                            <span className='text-muted-foreground'>·</span>
                            <button
                              type='button'
                              className='text-primary rounded px-1.5 py-0.5 hover:underline disabled:opacity-40 disabled:no-underline'
                              disabled={!sectionOn || onCount === 0}
                              onClick={() => setOn(ids, false)}
                            >
                              {t('All off')}
                            </button>
                          </div>
                        </div>
                        <div className='grid grid-cols-1 gap-x-6 border-l pl-3 sm:grid-cols-2'>
                          {group.items.map((item) => (
                            <ItemSwitch
                              key={item.id}
                              item={item}
                              compact
                              checked={isOn(item.id)}
                              disabled={!sectionOn}
                              onChange={(on) => setOn(item.id, on)}
                            />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        <p className='text-muted-foreground text-xs'>
          {t('Changing the order? Use Arrange on the dashboard. Reset layout there puts the order back but keeps these choices.')}
        </p>
      </div>
    </ContentSection>
  )
}
