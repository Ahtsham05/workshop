export const formatMoney = (n: unknown) => `Rs${Math.round(Number(n) || 0).toLocaleString()}`
export const formatNumber = (n: unknown): number => {
  const num = Number(n)
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0
}

export const DEAD_STOCK_ACTION_THEME: Record<string, { label: string; bg: string; text: string }> = {
  discount: { label: 'Discount', bg: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-400' },
  bundle: { label: 'Bundle', bg: 'bg-blue-100 dark:bg-blue-950/40', text: 'text-blue-700 dark:text-blue-400' },
  liquidation: { label: 'Liquidate', bg: 'bg-red-100 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-400' },
}

export const TREND_THEME: Record<string, { label: string; bg: string; text: string }> = {
  rising: { label: 'Rising', bg: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-400' },
  falling: { label: 'Falling', bg: 'bg-red-100 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-400' },
  stable: { label: 'Stable', bg: 'bg-slate-100 dark:bg-slate-800/40', text: 'text-slate-700 dark:text-slate-300' },
}

export const urgencyTheme = (daysRemaining: number | null) => {
  if (daysRemaining === null) return { bg: 'bg-slate-50 dark:bg-slate-900/30', text: 'text-slate-700 dark:text-slate-300', ring: 'ring-slate-500/20' }
  if (daysRemaining <= 3) return { bg: 'bg-red-50 dark:bg-red-950/30', text: 'text-red-700 dark:text-red-400', ring: 'ring-red-500/20' }
  if (daysRemaining <= 7) return { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', ring: 'ring-amber-500/20' }
  return { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-400', ring: 'ring-blue-500/20' }
}
