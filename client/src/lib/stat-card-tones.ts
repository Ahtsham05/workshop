/** KPI / StatCard tone colors — simple accent palette (expense-category style) */

export type StatCardTone =
  | 'emerald'
  | 'cyan'
  | 'violet'
  | 'sky'
  | 'orange'
  | 'indigo'
  | 'amber'
  | 'rose'
  | 'slate'

export const TONE_COLORS: Record<StatCardTone, string> = {
  emerald: '#10b981',
  cyan: '#14b8a6',
  violet: '#8b5cf6',
  sky: '#3b82f6',
  orange: '#f97316',
  indigo: '#6366f1',
  amber: '#f59e0b',
  rose: '#ef4444',
  slate: '#64748b',
}

/**
 * Each entry still falls back to its own distinct hue (byte-identical to before this
 * feature existed) via the `var(--chart-theme-primary, <original>)` fallback — but once
 * a theme colour is picked (Settings → Appearance), `--chart-theme-primary` is set, and
 * every one of these collapses to that same colour: the explicit outcome the user chose
 * ("KPI icon badges + status tags should follow the theme, not stay individually
 * coloured") over keeping each tone visually distinct.
 */
const TONE_ICON_BG: Record<StatCardTone, string> = {
  emerald:
    'bg-[var(--chart-theme-primary,var(--color-emerald-500))]/12 text-[var(--chart-theme-primary,var(--color-emerald-600))] dark:text-[var(--chart-theme-primary,var(--color-emerald-400))]',
  cyan: 'bg-[var(--chart-theme-primary,var(--color-cyan-500))]/12 text-[var(--chart-theme-primary,var(--color-cyan-600))] dark:text-[var(--chart-theme-primary,var(--color-cyan-400))]',
  violet:
    'bg-[var(--chart-theme-primary,var(--color-violet-500))]/12 text-[var(--chart-theme-primary,var(--color-violet-600))] dark:text-[var(--chart-theme-primary,var(--color-violet-400))]',
  sky: 'bg-[var(--chart-theme-primary,var(--color-sky-500))]/12 text-[var(--chart-theme-primary,var(--color-sky-600))] dark:text-[var(--chart-theme-primary,var(--color-sky-400))]',
  orange:
    'bg-[var(--chart-theme-primary,var(--color-orange-500))]/12 text-[var(--chart-theme-primary,var(--color-orange-600))] dark:text-[var(--chart-theme-primary,var(--color-orange-400))]',
  indigo:
    'bg-[var(--chart-theme-primary,var(--color-indigo-500))]/12 text-[var(--chart-theme-primary,var(--color-indigo-600))] dark:text-[var(--chart-theme-primary,var(--color-indigo-400))]',
  amber:
    'bg-[var(--chart-theme-primary,var(--color-amber-500))]/12 text-[var(--chart-theme-primary,var(--color-amber-600))] dark:text-[var(--chart-theme-primary,var(--color-amber-400))]',
  rose: 'bg-[var(--chart-theme-primary,var(--color-rose-500))]/12 text-[var(--chart-theme-primary,var(--color-rose-600))] dark:text-[var(--chart-theme-primary,var(--color-rose-400))]',
  slate:
    'bg-[var(--chart-theme-primary,var(--color-slate-500))]/10 text-[var(--chart-theme-primary,var(--color-slate-600))] dark:text-[var(--chart-theme-primary,var(--color-slate-400))]',
}

export function toneColor(toneKey: StatCardTone): string {
  return TONE_COLORS[toneKey]
}

/** Plain card shell — matches expense category tiles */
export function kpiCardClass(_toneKey?: StatCardTone): string {
  return 'rounded-xl border bg-card shadow-sm'
}

/** Tinted icon wrap for horizontal report KPI rows */
export function toneIconWrapClass(toneKey: StatCardTone): string {
  return `rounded-xl p-3 ${TONE_ICON_BG[toneKey]}`
}

/** @deprecated use toneColor — kept for any legacy imports */
export function toneCardClass(_toneKey: StatCardTone): string {
  return kpiCardClass()
}

export function toneValueClass(_toneKey: StatCardTone): string {
  return 'font-bold tabular-nums'
}
