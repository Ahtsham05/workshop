/** Series colours (CSS variables from viz.css) and chart text helpers. */
export const VIZ = {
  production: 'var(--viz-1)',
  scrap: 'var(--viz-2)',
  muted: 'var(--viz-muted)',
  grid: 'var(--border)',
  ink: 'var(--muted-foreground)',
  surface: 'var(--card)',
} as const

export const axisTick = { fontSize: 11, fill: 'var(--muted-foreground)' }

const compactFmt = new Intl.NumberFormat(undefined, {
  notation: 'compact',
  maximumFractionDigits: 1,
})
export const compact = (n: number) => compactFmt.format(n || 0)
