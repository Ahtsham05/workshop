import type {
  ProcurementType,
  ProductType,
  ProductionPriority,
  ProductionStatus,
  ScrapReason,
  ScrapStage,
  StockBucket,
} from '@/stores/manufacturing.api'

/** Mirrors server/src/config/manufacturing.js — keep the two in sync. */
export const PRODUCT_TYPE_META: Record<
  ProductType,
  { label: string; short: string; className: string }
> = {
  raw_material: {
    label: 'Raw Material',
    short: 'RM',
    className:
      'bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300',
  },
  component: {
    label: 'Component',
    short: 'CMP',
    className: 'bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-300',
  },
  packaging_material: {
    label: 'Packaging Material',
    short: 'PKG',
    className:
      'bg-stone-500/10 text-stone-700 border-stone-500/25 dark:text-stone-300',
  },
  sub_assembly: {
    label: 'Sub-Assembly',
    short: 'SUB',
    className:
      'bg-violet-500/10 text-violet-700 border-violet-500/25 dark:text-violet-300',
  },
  wip: {
    label: 'WIP',
    short: 'WIP',
    className:
      'bg-orange-500/10 text-orange-700 border-orange-500/25 dark:text-orange-300',
  },
  finished_good: {
    label: 'Finished Good',
    short: 'FG',
    className:
      'bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300',
  },
  by_product: {
    label: 'By-Product',
    short: 'BYP',
    className:
      'bg-teal-500/10 text-teal-700 border-teal-500/25 dark:text-teal-300',
  },
  scrap: {
    label: 'Scrap',
    short: 'SCR',
    className:
      'bg-rose-500/10 text-rose-700 border-rose-500/25 dark:text-rose-300',
  },
  service: {
    label: 'Service',
    short: 'SVC',
    className:
      'bg-slate-500/10 text-slate-700 border-slate-500/25 dark:text-slate-300',
  },
}
export const PRODUCT_TYPES = Object.keys(PRODUCT_TYPE_META) as ProductType[]

export const PROCUREMENT_LABELS: Record<ProcurementType, string> = {
  buy: 'Buy',
  make: 'Make',
  buy_or_make: 'Buy or Make',
}

export const STATUS_META: Record<
  ProductionStatus,
  { label: string; dot: string; className: string }
> = {
  draft: {
    label: 'Draft',
    dot: 'bg-slate-400',
    className:
      'bg-slate-500/10 text-slate-700 border-slate-500/20 dark:text-slate-300',
  },
  planned: {
    label: 'Planned',
    dot: 'bg-sky-500',
    className: 'bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-300',
  },
  released: {
    label: 'Released',
    dot: 'bg-indigo-500',
    className:
      'bg-indigo-500/10 text-indigo-700 border-indigo-500/25 dark:text-indigo-300',
  },
  in_production: {
    label: 'In Production',
    dot: 'bg-amber-500',
    className:
      'bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300',
  },
  paused: {
    label: 'Paused',
    dot: 'bg-orange-500',
    className:
      'bg-orange-500/10 text-orange-700 border-orange-500/25 dark:text-orange-300',
  },
  completed: {
    label: 'Completed',
    dot: 'bg-emerald-500',
    className:
      'bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300',
  },
  cancelled: {
    label: 'Cancelled',
    dot: 'bg-rose-500',
    className:
      'bg-rose-500/10 text-rose-700 border-rose-500/25 dark:text-rose-300',
  },
}
export const PRODUCTION_STATUSES = Object.keys(
  STATUS_META
) as ProductionStatus[]

/** Mirrors PRODUCTION_STATUS_TRANSITIONS on the server — drives which action buttons show. */
export const STATUS_TRANSITIONS: Record<ProductionStatus, ProductionStatus[]> =
  {
    draft: ['planned', 'released', 'cancelled'],
    planned: ['draft', 'released', 'cancelled'],
    released: ['planned', 'in_production', 'cancelled'],
    in_production: ['paused', 'completed'],
    paused: ['in_production', 'completed'],
    completed: [],
    cancelled: [],
  }

export const TRANSITION_LABELS: Partial<Record<ProductionStatus, string>> = {
  draft: 'Back to Draft',
  planned: 'Mark Planned',
  released: 'Release',
  in_production: 'Start / Resume',
  paused: 'Pause',
  completed: 'Complete',
  cancelled: 'Cancel Order',
}

export const PRIORITY_META: Record<
  ProductionPriority,
  { label: string; className: string }
> = {
  low: { label: 'Low', className: 'text-muted-foreground' },
  normal: { label: 'Normal', className: 'text-foreground' },
  high: { label: 'High', className: 'text-orange-600 dark:text-orange-400' },
  urgent: {
    label: 'Urgent',
    className: 'text-rose-600 dark:text-rose-400 font-semibold',
  },
}
export const PRIORITIES = Object.keys(PRIORITY_META) as ProductionPriority[]

export const SCRAP_STAGE_LABELS: Record<ScrapStage, string> = {
  material: 'Material (from WIP)',
  wip: 'Work in Progress',
  qc_reject: 'Rejected at QC',
  rework: 'Failed rework',
  finished_good: 'Finished Stock',
}

/** Ledger movement types written by manufacturing (InventoryTransaction.type). */
export const MOVEMENT_LABELS: Record<string, string> = {
  production_issue: 'Issued to production',
  wip_in: 'Into WIP',
  wip_return: 'Returned from WIP',
  production_return: 'Returned to stock',
  wip_consume: 'Consumed by output',
  wip_scrap: 'Scrapped from WIP',
  qc_in: 'Into QC hold',
  qc_out: 'Inspected',
  production_receipt: 'Finished goods received',
  rework_in: 'Sent to rework',
  rework_out: 'Rework resolved',
  production_scrap: 'Finished stock scrapped',
}

export const BUCKET_META: Record<
  StockBucket,
  { label: string; className: string }
> = {
  available: {
    label: 'Stock',
    className:
      'bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300',
  },
  wip: {
    label: 'WIP',
    className:
      'bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300',
  },
  qc: {
    label: 'QC',
    className: 'bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-300',
  },
  rework: {
    label: 'Rework',
    className:
      'bg-violet-500/10 text-violet-700 border-violet-500/25 dark:text-violet-300',
  },
}

export const SCRAP_REASON_LABELS: Record<ScrapReason, string> = {
  defect: 'Defect',
  damage: 'Damage',
  process_loss: 'Process Loss',
  expired: 'Expired',
  setup: 'Setup / Trial',
  rework: 'Rework',
  other: 'Other',
}

export const fmtQty = (value: number | null | undefined) =>
  (Number(value) || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })

export const fmtDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—'

export const refName = (ref: unknown): string => {
  if (!ref || typeof ref !== 'object') return ''
  return (ref as { name?: string }).name || ''
}
