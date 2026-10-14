import type { BomOperation } from '@/stores/manufacturing.api'

/* Editable rows of a BOM routing (see components/routing-editor.tsx). */

export type RoutingDraft = {
  key: string
  _id?: string
  name: string
  workCenter: string
  setupMinutes: string
  runMinutesPerUnit: string
  costPerHour: string
  instructions: string
}

let seq = 0
export const nextKey = () => `op-${++seq}`

export const toRoutingDraft = (ops?: BomOperation[] | null): RoutingDraft[] =>
  (ops || []).map((op) => ({
    key: nextKey(),
    _id: op._id,
    name: op.name,
    workCenter: op.workCenter || '',
    setupMinutes: String(op.setupMinutes || 0),
    runMinutesPerUnit: String(op.runMinutesPerUnit || 0),
    costPerHour: String(op.costPerHour || 0),
    instructions: op.instructions || '',
  }))

/** Rows with a name, in order, as the API expects them. */
export const fromRoutingDraft = (
  rows: RoutingDraft[],
  keepIds: boolean
): BomOperation[] =>
  rows
    .filter((r) => r.name.trim())
    .map((r) => ({
      ...(keepIds && r._id ? { _id: r._id } : {}),
      name: r.name.trim(),
      workCenter: r.workCenter.trim(),
      setupMinutes: Number(r.setupMinutes) || 0,
      runMinutesPerUnit: Number(r.runMinutesPerUnit) || 0,
      costPerHour: Number(r.costPerHour) || 0,
      instructions: r.instructions.trim(),
    }))

export const newRoutingRow = (name = ''): RoutingDraft => ({
  key: nextKey(),
  name,
  workCenter: '',
  setupMinutes: '0',
  runMinutesPerUnit: '0',
  costPerHour: '0',
  instructions: '',
})

/** Enter walks these left to right; from the last one it moves to the next step. */
export const STEP_FIELDS = [
  'name',
  'workCenter',
  'setupMinutes',
  'runMinutesPerUnit',
  'costPerHour',
  'instructions',
] as const
export type StepField = (typeof STEP_FIELDS)[number]

export const stepFieldSelector = (key: string, field: StepField) =>
  `[data-field="step:${key}:${field}"]`
export const ROUTING_ADD_SELECTOR = '[data-field="routing:add"]'
