/** Shared dark-tint styles for dashboard StatCards and report KPI cards */

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

/** Ensures labels and common semantic colors stay readable on dark KPI tiles */
const KPI_DESCENDANT_OVERRIDES =
  '[&_[data-slot=card-title]]:text-white/95 [&_.text-muted-foreground]:text-white/70 [&_.text-green-600]:text-emerald-200 [&_.text-red-600]:text-rose-200 [&_.text-orange-600]:text-orange-200'

function cnDarkCard(surface: string): string {
  return `${surface} ${KPI_DESCENDANT_OVERRIDES}`
}

export const STAT_CARD_TONE_STYLES: Record<
  StatCardTone,
  { card: string; iconWrap: string; skeleton: string }
> = {
  emerald: {
    card: cnDarkCard(
      'border-emerald-500/35 bg-gradient-to-br from-emerald-600 via-emerald-800 to-emerald-950 text-white shadow-md shadow-emerald-950/25'
    ),
    iconWrap:
      'rounded-xl bg-white/15 p-2 text-white ring-1 ring-white/20 [&_svg]:text-current',
    skeleton: 'bg-white/25',
  },
  cyan: {
    card: cnDarkCard(
      'border-cyan-500/35 bg-gradient-to-br from-cyan-600 via-cyan-800 to-cyan-950 text-white shadow-md shadow-cyan-950/25'
    ),
    iconWrap:
      'rounded-xl bg-white/15 p-2 text-white ring-1 ring-white/20 [&_svg]:text-current',
    skeleton: 'bg-white/25',
  },
  violet: {
    card: cnDarkCard(
      'border-violet-500/35 bg-gradient-to-br from-violet-600 via-violet-800 to-violet-950 text-white shadow-md shadow-violet-950/25'
    ),
    iconWrap:
      'rounded-xl bg-white/15 p-2 text-white ring-1 ring-white/20 [&_svg]:text-current',
    skeleton: 'bg-white/25',
  },
  sky: {
    card: cnDarkCard(
      'border-sky-500/35 bg-gradient-to-br from-sky-600 via-sky-800 to-sky-950 text-white shadow-md shadow-sky-950/25'
    ),
    iconWrap:
      'rounded-xl bg-white/15 p-2 text-white ring-1 ring-white/20 [&_svg]:text-current',
    skeleton: 'bg-white/25',
  },
  orange: {
    card: cnDarkCard(
      'border-orange-500/35 bg-gradient-to-br from-orange-600 via-orange-800 to-orange-950 text-white shadow-md shadow-orange-950/25'
    ),
    iconWrap:
      'rounded-xl bg-white/15 p-2 text-white ring-1 ring-white/20 [&_svg]:text-current',
    skeleton: 'bg-white/25',
  },
  indigo: {
    card: cnDarkCard(
      'border-indigo-500/35 bg-gradient-to-br from-indigo-600 via-indigo-800 to-indigo-950 text-white shadow-md shadow-indigo-950/25'
    ),
    iconWrap:
      'rounded-xl bg-white/15 p-2 text-white ring-1 ring-white/20 [&_svg]:text-current',
    skeleton: 'bg-white/25',
  },
  amber: {
    card: cnDarkCard(
      'border-amber-500/40 bg-gradient-to-br from-amber-600 via-amber-800 to-amber-950 text-white shadow-md shadow-amber-950/25'
    ),
    iconWrap:
      'rounded-xl bg-white/15 p-2 text-white ring-1 ring-white/20 [&_svg]:text-current',
    skeleton: 'bg-white/25',
  },
  rose: {
    card: cnDarkCard(
      'border-rose-500/35 bg-gradient-to-br from-rose-600 via-rose-800 to-rose-950 text-white shadow-md shadow-rose-950/25'
    ),
    iconWrap:
      'rounded-xl bg-white/15 p-2 text-white ring-1 ring-white/20 [&_svg]:text-current',
    skeleton: 'bg-white/25',
  },
  slate: {
    card: cnDarkCard(
      'border-slate-500/30 bg-gradient-to-br from-slate-600 via-slate-800 to-slate-950 text-white shadow-md shadow-black/20'
    ),
    iconWrap:
      'rounded-xl bg-white/15 p-2 text-white ring-1 ring-white/20 [&_svg]:text-current',
    skeleton: 'bg-white/25',
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
  return `${toneCardClass(tone)} hover:shadow-lg hover:brightness-[1.03] transition-shadow duration-200`
}
