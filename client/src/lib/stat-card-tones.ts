/** Shared gradient/tint styles for dashboard StatCards and report KPI cards */

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

export const STAT_CARD_TONE_STYLES: Record<
  StatCardTone,
  { card: string; iconWrap: string; skeleton: string }
> = {
  emerald: {
    card:
      'border-emerald-200/70 bg-gradient-to-br from-emerald-50/95 via-white to-white dark:border-emerald-800/35 dark:from-emerald-950/45 dark:via-card dark:to-card shadow-sm shadow-emerald-500/[0.07]',
    iconWrap:
      'rounded-xl bg-emerald-500/15 p-2 text-emerald-700 [&_svg]:text-current dark:bg-emerald-400/10 dark:text-emerald-300',
    skeleton: 'bg-emerald-200/70 dark:bg-emerald-800/50',
  },
  cyan: {
    card:
      'border-cyan-200/70 bg-gradient-to-br from-cyan-50/95 via-white to-white dark:border-cyan-800/35 dark:from-cyan-950/40 dark:via-card dark:to-card shadow-sm shadow-cyan-500/[0.07]',
    iconWrap:
      'rounded-xl bg-cyan-500/15 p-2 text-cyan-700 [&_svg]:text-current dark:bg-cyan-400/10 dark:text-cyan-300',
    skeleton: 'bg-cyan-200/70 dark:bg-cyan-800/50',
  },
  violet: {
    card:
      'border-violet-200/70 bg-gradient-to-br from-violet-50/95 via-white to-white dark:border-violet-800/35 dark:from-violet-950/40 dark:via-card dark:to-card shadow-sm shadow-violet-500/[0.07]',
    iconWrap:
      'rounded-xl bg-violet-500/15 p-2 text-violet-700 [&_svg]:text-current dark:bg-violet-400/10 dark:text-violet-300',
    skeleton: 'bg-violet-200/70 dark:bg-violet-800/50',
  },
  sky: {
    card:
      'border-sky-200/70 bg-gradient-to-br from-sky-50/95 via-white to-white dark:border-sky-800/35 dark:from-sky-950/40 dark:via-card dark:to-card shadow-sm shadow-sky-500/[0.07]',
    iconWrap:
      'rounded-xl bg-sky-500/15 p-2 text-sky-700 [&_svg]:text-current dark:bg-sky-400/10 dark:text-sky-300',
    skeleton: 'bg-sky-200/70 dark:bg-sky-800/50',
  },
  orange: {
    card:
      'border-orange-200/70 bg-gradient-to-br from-orange-50/95 via-white to-white dark:border-orange-800/35 dark:from-orange-950/40 dark:via-card dark:to-card shadow-sm shadow-orange-500/[0.07]',
    iconWrap:
      'rounded-xl bg-orange-500/15 p-2 text-orange-700 [&_svg]:text-current dark:bg-orange-400/10 dark:text-orange-300',
    skeleton: 'bg-orange-200/70 dark:bg-orange-800/50',
  },
  indigo: {
    card:
      'border-indigo-200/70 bg-gradient-to-br from-indigo-50/95 via-white to-white dark:border-indigo-800/35 dark:from-indigo-950/40 dark:via-card dark:to-card shadow-sm shadow-indigo-500/[0.07]',
    iconWrap:
      'rounded-xl bg-indigo-500/15 p-2 text-indigo-700 [&_svg]:text-current dark:bg-indigo-400/10 dark:text-indigo-300',
    skeleton: 'bg-indigo-200/70 dark:bg-indigo-800/50',
  },
  amber: {
    card:
      'border-amber-200/70 bg-gradient-to-br from-amber-50/95 via-white to-white dark:border-amber-800/35 dark:from-amber-950/40 dark:via-card dark:to-card shadow-sm shadow-amber-500/[0.07]',
    iconWrap:
      'rounded-xl bg-amber-500/15 p-2 text-amber-800 [&_svg]:text-current dark:bg-amber-400/10 dark:text-amber-200',
    skeleton: 'bg-amber-200/70 dark:bg-amber-800/50',
  },
  rose: {
    card:
      'border-rose-200/70 bg-gradient-to-br from-rose-50/95 via-white to-white dark:border-rose-800/35 dark:from-rose-950/40 dark:via-card dark:to-card shadow-sm shadow-rose-500/[0.07]',
    iconWrap:
      'rounded-xl bg-rose-500/15 p-2 text-rose-700 [&_svg]:text-current dark:bg-rose-400/10 dark:text-rose-300',
    skeleton: 'bg-rose-200/70 dark:bg-rose-800/50',
  },
  slate: {
    card:
      'border-border/80 bg-gradient-to-br from-muted/50 via-card to-card dark:from-muted/25 dark:via-card dark:to-card shadow-sm',
    iconWrap:
      'rounded-xl bg-muted p-2 text-muted-foreground [&_svg]:text-current',
    skeleton: 'bg-muted',
  },
}

export function toneCardClass(tone: StatCardTone): string {
  return STAT_CARD_TONE_STYLES[tone].card
}

export function toneIconWrapClass(tone: StatCardTone): string {
  return STAT_CARD_TONE_STYLES[tone].iconWrap
}

/** Card + hover shadow used on KPI tiles */
export function kpiCardClass(tone: StatCardTone): string {
  return `${toneCardClass(tone)} hover:shadow-md transition-shadow duration-200`
}
