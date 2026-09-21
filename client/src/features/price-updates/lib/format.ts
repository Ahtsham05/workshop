import type { UserRef } from '@/stores/priceUpdate.api'

export const userName = (u: UserRef | string | null | undefined): string =>
  !u ? '' : typeof u === 'string' ? '' : u.name || u.email || ''

export const formatNumber = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: 2 })
