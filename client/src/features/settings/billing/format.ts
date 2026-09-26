import type { SubscriptionStatus } from '@/stores/billing.api'

const PKT = 'Asia/Karachi'

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: PKT }).format(
    new Date(value)
  )
}

export const formatUsd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
export const formatPkr = (n: number) => `PKR ${Math.round(n).toLocaleString('en-PK')}`

/** -1 means unlimited on the server. */
export const formatLimit = (n: number) => (n === -1 ? 'Unlimited' : n.toLocaleString())

export const STATUS_META: Record<SubscriptionStatus, { label: string; tone: string }> = {
  trialing: { label: 'Free trial', tone: 'bg-sky-600 text-white' },
  active: { label: 'Active', tone: 'bg-emerald-600 text-white' },
  pastDue: { label: 'Payment failed', tone: 'bg-amber-600 text-white' },
  gracePeriod: { label: 'Grace period', tone: 'bg-amber-600 text-white' },
  canceled: { label: 'Cancels at period end', tone: 'bg-zinc-600 text-white' },
  expired: { label: 'Read-only', tone: 'bg-red-600 text-white' },
}
