/**
 * State for one price-update session — the review step's rows, what the user has confirmed,
 * changed or unchecked, and everything derived from that. Pure (no React): the rules for "what is
 * pre-selected", "what still needs a human look" and "what is actually sent" are safety rules, so
 * they live where they can be checked without a browser.
 */

import type { AnalyzedRow, ApplyItem, CatalogEntry } from '@/stores/priceUpdate.api'
import {
  computeRow,
  type ListType,
  type PricingRule,
  type RowComputation,
  type RowFlag,
  type ProposalNote,
} from '@/lib/price-update-rules'

export interface RowState {
  /** Row index within the analysis (AnalyzedRow.index). */
  index: number
  /** The catalog entry this line is linked to, or null when unmatched. */
  entryId: string | null
  /** True once a human has confirmed or chosen the link — a review-grade match never applies without it. */
  confirmed: boolean
  /** Whether the line is ticked for applying. */
  included: boolean
  costOverride: number | null
  priceOverride: number | null
}

export interface SessionState {
  rows: RowState[]
  /** Every catalog entry seen so far (matches, alternatives, manual picks), by entry id. */
  entries: Record<string, CatalogEntry>
}

export type SessionAction =
  | { type: 'init'; analyzed: AnalyzedRow[] }
  | { type: 'toggle'; index: number }
  | { type: 'setIncluded'; indices: number[]; included: boolean }
  | { type: 'confirm'; index: number }
  | { type: 'confirmAllReview' }
  | { type: 'link'; index: number; entry: CatalogEntry }
  | { type: 'unlink'; index: number }
  | { type: 'setCost'; index: number; value: number | null }
  | { type: 'setPrice'; index: number; value: number | null }
  | { type: 'resetOverrides' }

/**
 * Starting state. Only HIGH-confidence matches are ticked: a "review" match is shown with its
 * suggestion but waits for a human, and an unmatched line has nothing to apply to.
 */
export function initSession(analyzed: AnalyzedRow[]): SessionState {
  const entries: Record<string, CatalogEntry> = {}
  const rows = analyzed.map((row): RowState => {
    const linked = row.match.status === 'none' ? null : row.match.entry
    if (row.match.entry) entries[row.match.entry.id] = row.match.entry
    row.match.alternatives.forEach((alt) => {
      entries[alt.entry.id] = alt.entry
    })
    return {
      index: row.index,
      entryId: linked ? linked.id : null,
      confirmed: false,
      included: row.match.status === 'high',
      costOverride: null,
      priceOverride: null,
    }
  })
  return { rows, entries }
}

const patch = (state: SessionState, index: number, change: Partial<RowState>): SessionState => ({
  ...state,
  rows: state.rows.map((r) => (r.index === index ? { ...r, ...change } : r)),
})

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'init':
      return initSession(action.analyzed)
    case 'toggle':
      return { ...state, rows: state.rows.map((r) => (r.index === action.index ? { ...r, included: !r.included } : r)) }
    case 'setIncluded': {
      const set = new Set(action.indices)
      return { ...state, rows: state.rows.map((r) => (set.has(r.index) ? { ...r, included: action.included } : r)) }
    }
    case 'confirm':
      return patch(state, action.index, { confirmed: true, included: true })
    case 'confirmAllReview':
      // Only rows that have a suggestion and haven't been confirmed. Never touches unmatched rows.
      return {
        ...state,
        rows: state.rows.map((r) => (r.entryId && !r.confirmed ? { ...r, confirmed: true, included: true } : r)),
      }
    case 'link':
      return {
        ...state,
        entries: { ...state.entries, [action.entry.id]: action.entry },
        rows: state.rows.map((r) =>
          r.index === action.index
            ? { ...r, entryId: action.entry.id, confirmed: true, included: true, costOverride: null, priceOverride: null }
            : r,
        ),
      }
    case 'unlink':
      return patch(state, action.index, { entryId: null, confirmed: false, included: false, costOverride: null, priceOverride: null })
    case 'setCost':
      return patch(state, action.index, { costOverride: action.value })
    case 'setPrice':
      return patch(state, action.index, { priceOverride: action.value })
    case 'resetOverrides':
      return { ...state, rows: state.rows.map((r) => ({ ...r, costOverride: null, priceOverride: null })) }
    default:
      return state
  }
}

// ─── Derived view ────────────────────────────────────────────────────────────

export type RowStatus =
  | 'ready' // linked, confirmed/high, has a change, ticked
  | 'review' // has a suggested match that no human has confirmed yet
  | 'unmatched' // nothing linked
  | 'unchanged' // linked but the list changes nothing
  | 'excluded' // linked with a change, but unticked
  | 'superseded' // the same product appears again later in the list — the later line wins

export type RowIssue = RowFlag | ProposalNote | 'duplicate_target' | 'pack_price' | 'range' | 'signed_change' | 'no_list_price'

export interface DerivedRow {
  row: AnalyzedRow
  state: RowState
  entry: CatalogEntry | null
  calc: RowComputation | null
  status: RowStatus
  issues: RowIssue[]
  /** Line number of the later row that supersedes this one. */
  supersededByLine?: number
}

const PARSER_WARNINGS: RowIssue[] = ['pack_price', 'range', 'signed_change']

export function deriveRows(
  analyzed: AnalyzedRow[],
  state: SessionState,
  listType: ListType,
  rule: PricingRule,
): DerivedRow[] {
  const byIndex = new Map(state.rows.map((r) => [r.index, r]))
  const derived: DerivedRow[] = analyzed.map((row) => {
    const rs = byIndex.get(row.index) as RowState
    const entry = rs.entryId ? state.entries[rs.entryId] || null : null
    const calc = entry
      ? computeRow(entry, row.values, listType, rule, { cost: rs.costOverride, price: rs.priceOverride })
      : null

    const issues: RowIssue[] = []
    row.warnings.forEach((w) => {
      if ((PARSER_WARNINGS as string[]).includes(w)) issues.push(w as RowIssue)
    })
    if (calc) {
      issues.push(...calc.flags, ...calc.notes)
      if (calc.newCost === undefined && calc.newPrice === undefined) issues.push('no_list_price')
    }

    let status: RowStatus
    if (!entry) status = 'unmatched'
    else if (!rs.confirmed && row.match.status !== 'high') status = 'review'
    else if (!calc || (!calc.costChanged && !calc.priceChanged)) status = 'unchanged'
    else if (!rs.included) status = 'excluded'
    else status = 'ready'

    return { row, state: rs, entry, calc, status, issues }
  })

  // The same product on two lines: the LAST ticked one is applied, earlier ones are marked.
  const lastByEntry = new Map<string, DerivedRow>()
  derived.forEach((d) => {
    if (!d.entry || d.status === 'unmatched' || d.status === 'review') return
    const prev = lastByEntry.get(d.entry.id)
    if (prev) {
      prev.issues.push('duplicate_target')
      d.issues.push('duplicate_target')
      if (prev.status === 'ready' || prev.status === 'excluded') {
        prev.status = 'superseded'
        prev.supersededByLine = d.row.line
      }
    }
    lastByEntry.set(d.entry.id, d)
  })

  return derived
}

/** The payload for /apply: only ticked, ready lines, and only the fields that actually change. */
export function buildApplyItems(derived: DerivedRow[]): ApplyItem[] {
  const items: ApplyItem[] = []
  derived.forEach((d) => {
    if (d.status !== 'ready' || !d.entry || !d.calc) return
    const { entry, calc, row, state } = d
    // A human decision (confirmed, or linked by hand) is recorded as 'manual' — the only kind the
    // server will turn into a remembered match. An unreviewed high-confidence match keeps its own method.
    const method = state.confirmed ? 'manual' : row.match.method || 'name'
    items.push({
      productId: entry.productId,
      variantId: entry.variantId,
      newCost: calc.costChanged ? calc.newCost : undefined,
      newPrice: calc.priceChanged ? calc.newPrice : undefined,
      expectedOldCost: calc.costChanged ? entry.cost : undefined,
      expectedOldPrice: calc.priceChanged ? entry.price : undefined,
      sourceLine: row.raw.slice(0, 500),
      listName: row.name,
      matchMethod: method,
      matchScore: row.match.score,
    })
  })
  return items
}

export interface SessionSummary {
  lines: number
  ready: number
  review: number
  unmatched: number
  unchanged: number
  excluded: number
  superseded: number
  /** Products that would be written. */
  updating: number
  costUp: number
  costDown: number
  avgCostPercent: number
  avgPricePercent: number
  belowCost: number
  bigChanges: number
}

export function summarize(derived: DerivedRow[]): SessionSummary {
  const s: SessionSummary = {
    lines: derived.length,
    ready: 0,
    review: 0,
    unmatched: 0,
    unchanged: 0,
    excluded: 0,
    superseded: 0,
    updating: 0,
    costUp: 0,
    costDown: 0,
    avgCostPercent: 0,
    avgPricePercent: 0,
    belowCost: 0,
    bigChanges: 0,
  }
  const costPcts: number[] = []
  const pricePcts: number[] = []
  derived.forEach((d) => {
    s[d.status] += 1
    if (d.status !== 'ready' || !d.calc) return
    s.updating += 1
    if (d.calc.costChanged && d.calc.costPercent !== null) {
      costPcts.push(d.calc.costPercent)
      if (d.calc.costPercent > 0) s.costUp += 1
      else s.costDown += 1
    }
    if (d.calc.priceChanged && d.calc.pricePercent !== null) pricePcts.push(d.calc.pricePercent)
    if (d.issues.includes('below_cost')) s.belowCost += 1
    if (d.issues.includes('big_cost_change') || d.issues.includes('big_price_change')) s.bigChanges += 1
  })
  const avg = (list: number[]) => (list.length ? Math.round((list.reduce((a, b) => a + b, 0) / list.length) * 100) / 100 : 0)
  s.avgCostPercent = avg(costPcts)
  s.avgPricePercent = avg(pricePcts)
  return s
}

/** Filter chips on the review screen. */
export type ReviewFilter = 'all' | 'ready' | 'review' | 'unmatched' | 'unchanged' | 'warnings'

export function matchesFilter(d: DerivedRow, filter: ReviewFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'ready':
      return d.status === 'ready' || d.status === 'excluded' || d.status === 'superseded'
    case 'review':
      return d.status === 'review'
    case 'unmatched':
      return d.status === 'unmatched'
    case 'unchanged':
      return d.status === 'unchanged'
    case 'warnings':
      return d.issues.some((i) => i === 'below_cost' || i === 'big_cost_change' || i === 'big_price_change' || i === 'duplicate_target' || (PARSER_WARNINGS as string[]).includes(i))
    default:
      return true
  }
}
