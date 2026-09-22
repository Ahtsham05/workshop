import { CheckCircle2, Clock, AlertCircle, AlertTriangle, XCircle } from 'lucide-react'

export type AgingBucketSize = 3 | 7 | 15 | 30

export const AGING_BUCKET_SIZES: AgingBucketSize[] = [3, 7, 15, 30]

export const DEFAULT_AGING_BUCKET_SIZE: AgingBucketSize = 30

export type BucketKey = 'current' | 'bucket1' | 'bucket2' | 'bucket3' | 'bucket4'

export interface AgingBucketMeta {
  key: BucketKey
  label: string
  shortLabel: string
  tone: 'emerald' | 'amber' | 'orange' | 'rose' | 'slate'
  icon: typeof CheckCircle2
  badge: string
}

/** Builds the 5 aging buckets (Current + 4 age tiers) for a given period length.
 * e.g. bucketSize=30 → Current, 1-30, 31-60, 61-90, 90+ (the original fixed layout).
 * bucketSize=7 → Current, 1-7, 8-14, 15-21, 21+ — for tighter, faster follow-up. */
export function buildAgingBuckets(bucketSize: AgingBucketSize): AgingBucketMeta[] {
  const b1 = bucketSize
  const b2 = bucketSize * 2
  const b3 = bucketSize * 3

  return [
    {
      key: 'current',
      label: 'Current',
      shortLabel: 'Current',
      tone: 'emerald',
      icon: CheckCircle2,
      badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    },
    {
      key: 'bucket1',
      label: `1-${b1} Days`,
      shortLabel: `1-${b1}`,
      tone: 'amber',
      icon: Clock,
      badge: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200',
    },
    {
      key: 'bucket2',
      label: `${b1 + 1}-${b2} Days`,
      shortLabel: `${b1 + 1}-${b2}`,
      tone: 'orange',
      icon: AlertCircle,
      badge: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    },
    {
      key: 'bucket3',
      label: `${b2 + 1}-${b3} Days`,
      shortLabel: `${b2 + 1}-${b3}`,
      tone: 'rose',
      icon: AlertTriangle,
      badge: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
    },
    {
      key: 'bucket4',
      label: `${b3}+ Days`,
      shortLabel: `${b3}+`,
      tone: 'slate',
      icon: XCircle,
      badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400',
    },
  ]
}
