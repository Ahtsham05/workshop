import type {
  OperationStatus,
  ProductionOrder,
} from '@/stores/manufacturing.api'
import { fmtQty } from '../../lib/constants'

/*
 * Helpers shared by the production-order detail tabs (components live in shared.tsx).
 */

export const EPS = 1e-6

export type DetailTab =
  | 'overview'
  | 'materials'
  | 'operations'
  | 'assemblies'
  | 'wip'
  | 'quality'
  | 'scrap'
  | 'costs'
  | 'documents'
  | 'activity'

export const DETAIL_TABS: DetailTab[] = [
  'overview',
  'materials',
  'operations',
  'assemblies',
  'wip',
  'quality',
  'scrap',
  'costs',
  'documents',
  'activity',
]

export const isDetailTab = (v: unknown): v is DetailTab =>
  typeof v === 'string' && (DETAIL_TABS as string[]).includes(v)

/** What the order still owes: planned minus produced (output reported). */
export const remainingQty = (order: ProductionOrder) =>
  Math.max(0, order.plannedQuantity - order.producedQuantity)

/** Good units against plan — the same completion % as the order list. */
export const completionPct = (order: ProductionOrder) =>
  order.plannedQuantity > 0
    ? Math.min(
        100,
        Math.round((order.completedQuantity / order.plannedQuantity) * 100)
      )
    : 0

/** 75 → "1h 15m", 40 → "40m", 0 → "0m". */
export const fmtMinutes = (minutes: number | null | undefined) => {
  const m = Math.max(0, Math.round(Number(minutes) || 0))
  const h = Math.floor(m / 60)
  const rest = m % 60
  if (!h) return `${rest}m`
  return rest ? `${h}h ${rest}m` : `${h}h`
}

export const fmtDateTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—'

export const fmtTime = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      })
    : '—'

/** `<input type="datetime-local">` value for a date, in local time. */
export const toLocalInput = (date: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export const OPERATION_STATUS_META: Record<
  OperationStatus,
  { label: string; text: string }
> = {
  pending: { label: 'Pending', text: 'text-muted-foreground' },
  in_progress: {
    label: 'In progress',
    text: 'text-amber-700 dark:text-amber-400',
  },
  completed: {
    label: 'Completed',
    text: 'text-emerald-700 dark:text-emerald-400',
  },
  skipped: { label: 'Skipped', text: 'text-muted-foreground' },
}

export interface SystemStage {
  key: 'qc' | 'fg'
  name: string
  status: OperationStatus
  detail: string
}

/**
 * Quality check and finished goods close every routing; they aren't steps anyone ticks
 * off — they follow the output, inspections and receipts already posted on the order.
 */
export const systemStages = (
  order: ProductionOrder,
  t: (s: string) => string,
  qualityChecks: boolean
): SystemStage[] => {
  const done = order.status === 'completed'
  // Output that has been through inspection. Not good + rejected: a reworked unit that
  // passed is counted in both.
  const inspected = Math.max(
    0,
    order.producedQuantity - order.qcPendingQuantity
  )
  const qcStatus: OperationStatus = !qualityChecks
    ? done || order.completedQuantity > EPS
      ? 'completed'
      : 'skipped'
    : done
      ? 'completed'
      : order.producedQuantity > EPS
        ? order.qcPendingQuantity > EPS ||
          order.producedQuantity < order.plannedQuantity - EPS
          ? 'in_progress'
          : 'completed'
        : 'pending'
  const fgStatus: OperationStatus = done
    ? 'completed'
    : order.completedQuantity > EPS
      ? order.completedQuantity >= order.plannedQuantity - EPS
        ? 'completed'
        : 'in_progress'
      : 'pending'
  return [
    {
      key: 'qc',
      name: t('Quality check'),
      status: qcStatus,
      detail: !qualityChecks
        ? t('Quality checks are off — output goes straight to stock')
        : order.producedQuantity > EPS
          ? `${fmtQty(inspected)} ${t('inspected')} · ${fmtQty(order.qcPendingQuantity)} ${t('waiting')}${
              order.rejectedQuantity > EPS
                ? ` · ${fmtQty(order.rejectedQuantity)} ${t('rejected')}`
                : ''
            }`
          : t('Starts when output is reported'),
    },
    {
      key: 'fg',
      name: t('Finished goods'),
      status: fgStatus,
      detail:
        order.completedQuantity > EPS
          ? `${fmtQty(order.completedQuantity)} ${t('of')} ${fmtQty(order.plannedQuantity)} ${order.unit} ${t('received into stock')}`
          : t('Good units are received into stock after QC'),
    },
  ]
}
