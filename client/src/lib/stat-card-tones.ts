/** Neutral KPI / StatCard styles — tone keys kept for call-site compatibility */

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

const NEUTRAL_CARD =
  'border bg-card text-card-foreground shadow-sm'

const NEUTRAL_ICON_WRAP =
  'rounded-xl bg-muted p-2 text-muted-foreground [&_svg]:text-current'

const NEUTRAL_SKELETON = 'bg-muted'

const neutral = {
  card: NEUTRAL_CARD,
  iconWrap: NEUTRAL_ICON_WRAP,
  skeleton: NEUTRAL_SKELETON,
} as const

export const STAT_CARD_TONE_STYLES: Record<
  StatCardTone,
  { card: string; iconWrap: string; skeleton: string }
> = {
  emerald: neutral,
  cyan: neutral,
  violet: neutral,
  sky: neutral,
  orange: neutral,
  indigo: neutral,
  amber: neutral,
  rose: neutral,
  slate: neutral,
}

export function toneCardClass(tone: StatCardTone): string {
  return STAT_CARD_TONE_STYLES[tone].card
}

export function toneIconWrapClass(tone: StatCardTone): string {
  return STAT_CARD_TONE_STYLES[tone].iconWrap
}

/** Card + hover used on KPI tiles */
export function kpiCardClass(tone: StatCardTone): string {
  return `${toneCardClass(tone)} hover:shadow-md transition-shadow duration-200`
}
