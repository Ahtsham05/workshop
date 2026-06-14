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

const TONE_ICON_BG: Record<StatCardTone, string> = {
  emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  cyan: 'bg-cyan-500/12 text-cyan-600 dark:text-cyan-400',
  violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  sky: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  orange: 'bg-orange-500/12 text-orange-600 dark:text-orange-400',
  indigo: 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-400',
  amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
  slate: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
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
