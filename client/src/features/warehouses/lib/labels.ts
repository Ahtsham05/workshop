import type { LocationType, MoveType, TransferStatus, WarehouseType } from '@/stores/warehouse.api'

export const WAREHOUSE_TYPE_LABELS: Record<WarehouseType, string> = {
  main: 'Main warehouse',
  store: 'Store room',
  showroom: 'Shop / showroom',
  production: 'Production',
  transit: 'In transit',
  returns: 'Returns',
  damaged: 'Damaged / quarantine',
  other: 'Other',
}

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  zone: 'Zone',
  aisle: 'Aisle',
  rack: 'Rack',
  shelf: 'Shelf',
  bin: 'Bin',
}

export const TRANSFER_STATUS_META: Record<TransferStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  done: { label: 'Done', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  cancelled: { label: 'Cancelled', className: 'border-slate-500/30 bg-slate-500/10 text-slate-600 dark:text-slate-300' },
}

export const MOVE_TYPE_LABELS: Record<MoveType, string> = {
  receipt: 'Purchase received',
  delivery: 'Sold / delivered',
  transfer_in: 'Transfer in',
  transfer_out: 'Transfer out',
  return_in: 'Customer return',
  return_out: 'Returned to supplier',
  adjustment: 'Stock adjustment',
  branch_out: 'Sent to another branch',
  branch_in: 'Received from another branch',
}

/** Accent colours a warehouse can carry (cards, chips, column headers). */
export const WAREHOUSE_COLORS: Record<string, { dot: string; soft: string; text: string; bar: string }> = {
  blue: { dot: 'bg-blue-500', soft: 'bg-blue-500/10', text: 'text-blue-700 dark:text-blue-300', bar: 'from-blue-500 to-blue-400' },
  emerald: { dot: 'bg-emerald-500', soft: 'bg-emerald-500/10', text: 'text-emerald-700 dark:text-emerald-300', bar: 'from-emerald-500 to-emerald-400' },
  amber: { dot: 'bg-amber-500', soft: 'bg-amber-500/10', text: 'text-amber-700 dark:text-amber-300', bar: 'from-amber-500 to-amber-400' },
  violet: { dot: 'bg-violet-500', soft: 'bg-violet-500/10', text: 'text-violet-700 dark:text-violet-300', bar: 'from-violet-500 to-violet-400' },
  rose: { dot: 'bg-rose-500', soft: 'bg-rose-500/10', text: 'text-rose-700 dark:text-rose-300', bar: 'from-rose-500 to-rose-400' },
  teal: { dot: 'bg-teal-500', soft: 'bg-teal-500/10', text: 'text-teal-700 dark:text-teal-300', bar: 'from-teal-500 to-teal-400' },
  orange: { dot: 'bg-orange-500', soft: 'bg-orange-500/10', text: 'text-orange-700 dark:text-orange-300', bar: 'from-orange-500 to-orange-400' },
  slate: { dot: 'bg-slate-500', soft: 'bg-slate-500/10', text: 'text-slate-700 dark:text-slate-300', bar: 'from-slate-500 to-slate-400' },
}

export const colorOf = (key?: string) => WAREHOUSE_COLORS[key || 'blue'] || WAREHOUSE_COLORS.blue

export const fmtQty = (n: number | undefined | null) => {
  const v = Number(n || 0)
  return Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 3 })
}

export const fmtDate = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export const fmtDateTime = (iso?: string | null) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export const refId = (v: unknown): string => {
  if (!v) return ''
  if (typeof v === 'string') return v
  const o = v as { id?: string; _id?: string }
  return o.id || o._id || ''
}

export const WAREHOUSE_PERMS = {
  view: ['viewWarehouses', 'manageWarehouses', 'manageWarehouseTransfers', 'viewProducts'] as const,
  manage: ['manageWarehouses', 'editProducts'] as const,
  transfer: ['manageWarehouseTransfers', 'manageWarehouses', 'manageStockTransfers', 'editProducts'] as const,
  settings: ['editSettings', 'manageBusinessProfile', 'manageWarehouses'] as const,
}

/** Short money for tight tiles: 1,730,000 → 1.73M (the exact amount goes in a tooltip). */
export const compactMoney = (formatMoney: (n: number) => string, n: number) => {
  const abs = Math.abs(n)
  if (abs < 100000) return formatMoney(n)
  const exact = formatMoney(n)
  const digits = exact.match(/[\d.,\s]+/)?.[0] || ''
  const short = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(n)
  return digits ? exact.replace(digits.trim(), short) : short
}
