import { CalendarCheck, ClipboardList, PackageOpen, ShieldQuestion } from 'lucide-react'
import type { AbcClass, StockCountStatus, StockCountType, VarianceReason } from '@/stores/stockCount.api'

export const COUNT_TYPE_META: Record<StockCountType, { label: string; icon: typeof CalendarCheck; description: string }> = {
  cycle: {
    label: 'Cycle count',
    icon: CalendarCheck,
    description: "Today's scheduled items: A items most often, C items least.",
  },
  surprise: {
    label: 'Surprise audit',
    icon: ShieldQuestion,
    description: 'An unannounced, always-blind count of a random sample (valuable items more likely).',
  },
  initial: {
    label: 'Initial count',
    icon: PackageOpen,
    description: 'Count everything once to set the opening stock. Can fill in missing costs.',
  },
  custom: {
    label: 'Custom count',
    icon: ClipboardList,
    description: 'Pick what to count: by class, category, or specific products.',
  },
}

export const STATUS_META: Record<StockCountStatus, { label: string; className: string }> = {
  counting: { label: 'Counting', className: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  review: { label: 'Awaiting review', className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  posting: { label: 'Posting…', className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  posted: { label: 'Posted', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  cancelled: { label: 'Cancelled', className: 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300' },
}

export const CLASS_META: Record<AbcClass, { label: string; className: string; hint: string }> = {
  A: { label: 'A', className: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300', hint: 'High value — counted most often' },
  B: { label: 'B', className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300', hint: 'Mid value' },
  C: { label: 'C', className: 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300', hint: 'Low value / bulk — counted least often' },
}

export const REASON_LABELS: Record<VarianceReason | 'unexplained', string> = {
  miscount: 'Earlier miscount',
  damage: 'Damaged',
  theft: 'Theft',
  expired: 'Expired',
  unrecorded_sale: 'Sale not recorded',
  unrecorded_receipt: 'Receipt not recorded',
  supplier_short: 'Supplier short delivery',
  wrong_item: 'Wrong item sold / received',
  other: 'Other',
  unexplained: 'No reason given',
}

export const REASON_ORDER: VarianceReason[] = [
  'miscount',
  'unrecorded_sale',
  'unrecorded_receipt',
  'damage',
  'theft',
  'expired',
  'supplier_short',
  'wrong_item',
  'other',
]

/** Common interval choices, in days. */
export const INTERVAL_PRESETS = [
  { days: 1, label: 'Daily' },
  { days: 7, label: 'Weekly' },
  { days: 14, label: 'Every 2 weeks' },
  { days: 30, label: 'Monthly' },
  { days: 90, label: 'Quarterly' },
  { days: 180, label: 'Every 6 months' },
]

export const intervalLabel = (days: number) => INTERVAL_PRESETS.find((p) => p.days === days)?.label ?? `Every ${days} days`

export const fmtQty = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
}

export const signed = (value: number) => (value > 0 ? `+${fmtQty(value)}` : value < 0 ? `−${fmtQty(-value)}` : '0')

export const apiError = (err: unknown, fallback: string) => (err as { data?: { message?: string } })?.data?.message || fallback
