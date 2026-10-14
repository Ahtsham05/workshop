import type { ProductionPriority } from '@/stores/manufacturing.api'
import {
  getBusinessToday,
  shiftBusinessCalendarDate,
} from '@/lib/business-timezone'
import type { BatchHeader } from './production-order-batch'

/*
 * What the New production orders screen fills in by itself, and the Quick Templates menu.
 * Both live on this device, per user: they only pre-fill the form, and every value is
 * still checked by the server when the orders are created.
 */

/** Days from planned start to planned completion when nothing better is known. */
export const DEFAULT_LEAD_DAYS = 7

/** Calendar days from a to b (both YYYY-MM-DD); null when either is missing. */
export function daysBetween(a?: string | null, b?: string | null) {
  if (!a || !b) return null
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null
}

export const isCalendarDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Planned start / completion for a lead time, starting today (+ an offset). */
export function plannedDates(leadDays: number, startOffset = 0) {
  const start = shiftBusinessCalendarDate(getBusinessToday(), startOffset)
  return {
    plannedStartDate: start,
    plannedCompletionDate: shiftBusinessCalendarDate(
      start,
      Math.max(0, leadDays)
    ),
  }
}

// ── Last used header (operator and lead time) ───────────────────────────────────

type Remembered = Partial<Pick<BatchHeader, 'operatorId'>> & {
  leadDays?: number
}

const lastKey = (userKey: string) => `mfg:po-batch:last:${userKey}`

export function loadLastUsed(userKey: string): Remembered {
  try {
    const raw = localStorage.getItem(lastKey(userKey))
    const parsed = raw ? (JSON.parse(raw) as Remembered) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function rememberLastUsed(userKey: string, header: BatchHeader) {
  const lead = daysBetween(
    header.plannedStartDate,
    header.plannedCompletionDate
  )
  const value: Remembered = {
    operatorId: header.operatorId,
    leadDays: lead !== null && lead >= 0 ? lead : undefined,
  }
  try {
    localStorage.setItem(lastKey(userKey), JSON.stringify(value))
  } catch {
    // Private mode / storage full: the next list simply starts unassigned.
  }
}

// ── Quick templates ─────────────────────────────────────────────────────────────

export interface TemplateRow {
  productKey: string
  quantity: number | null
  bomId: string | null
}

export interface OrderTemplate {
  id: string
  name: string
  description?: string
  builtIn?: boolean
  priority?: ProductionPriority
  /** Planned completion = planned start + this many days. */
  leadDays?: number
  /** Planned start = today + this many days. */
  startOffset?: number
  header?: Partial<
    Pick<
      BatchHeader,
      | 'operatorId'
      | 'teamMemberIds'
      | 'sourceLocation'
      | 'wipLocation'
      | 'finishedGoodsLocation'
      | 'notes'
    >
  >
  rows?: TemplateRow[]
}

export const BUILT_IN_TEMPLATES: OrderTemplate[] = [
  {
    id: 'standard',
    name: 'Standard run',
    description: 'Normal priority · starts today · due in 7 days',
    builtIn: true,
    priority: 'normal',
    leadDays: 7,
  },
  {
    id: 'rush',
    name: 'Rush order',
    description: 'Urgent · starts today · due tomorrow',
    builtIn: true,
    priority: 'urgent',
    leadDays: 1,
  },
  {
    id: 'high',
    name: 'High priority',
    description: 'High priority · starts today · due in 3 days',
    builtIn: true,
    priority: 'high',
    leadDays: 3,
  },
  {
    id: 'next-week',
    name: 'Next week',
    description: 'Low priority · starts in 7 days · 14 days to finish',
    builtIn: true,
    priority: 'low',
    startOffset: 7,
    leadDays: 14,
  },
]

const templatesKey = (userKey: string) => `mfg:po-batch:templates:${userKey}`
const MAX_TEMPLATES = 20

export function loadTemplates(userKey: string): OrderTemplate[] {
  try {
    const raw = localStorage.getItem(templatesKey(userKey))
    const list = raw ? (JSON.parse(raw) as OrderTemplate[]) : []
    return Array.isArray(list) ? list.filter((t) => t && t.id && t.name) : []
  } catch {
    return []
  }
}

export function saveTemplates(userKey: string, list: OrderTemplate[]) {
  try {
    localStorage.setItem(
      templatesKey(userKey),
      JSON.stringify(list.slice(0, MAX_TEMPLATES))
    )
    return true
  } catch {
    return false
  }
}

/** The form as it stands → a template (dates kept as a lead time, not fixed days). */
export function templateFromEntry(
  name: string,
  header: BatchHeader,
  rows: TemplateRow[]
): OrderTemplate {
  const lead = daysBetween(
    header.plannedStartDate,
    header.plannedCompletionDate
  )
  const offset = daysBetween(getBusinessToday(), header.plannedStartDate)
  return {
    id: `t${Date.now().toString(36)}`,
    name,
    priority: header.priority,
    leadDays: lead !== null && lead >= 0 ? lead : undefined,
    startOffset: offset !== null && offset > 0 ? offset : undefined,
    header: {
      operatorId: header.operatorId,
      teamMemberIds: header.teamMemberIds,
      sourceLocation: header.sourceLocation,
      wipLocation: header.wipLocation,
      finishedGoodsLocation: header.finishedGoodsLocation,
      notes: header.notes,
    },
    rows,
  }
}
