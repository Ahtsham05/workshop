export const PKR_DENOMINATIONS = [
  { value: 5000, kind: 'note' as const, label: 'Rs 5,000 note' },
  { value: 1000, kind: 'note' as const, label: 'Rs 1,000 note' },
  { value: 500, kind: 'note' as const, label: 'Rs 500 note' },
  { value: 100, kind: 'note' as const, label: 'Rs 100 note' },
  { value: 50, kind: 'note' as const, label: 'Rs 50 note' },
  { value: 20, kind: 'note' as const, label: 'Rs 20 note' },
  { value: 10, kind: 'note' as const, label: 'Rs 10 note' },
  { value: 10, kind: 'coin' as const, label: 'Rs 10 coin' },
  { value: 5, kind: 'coin' as const, label: 'Rs 5 coin' },
  { value: 2, kind: 'coin' as const, label: 'Rs 2 coin' },
  { value: 1, kind: 'coin' as const, label: 'Rs 1 coin' },
] as const

export type DenominationKind = 'note' | 'coin'

export interface DenominationCount {
  value: number
  kind: DenominationKind
  quantity: number
}

export const denominationKey = (value: number, kind: DenominationKind) => `${kind}:${value}`

export const computeTotalFromCounts = (counts: DenominationCount[]) =>
  counts.reduce((sum, row) => sum + Number(row.value || 0) * Number(row.quantity || 0), 0)

export const emptyCounts = (): DenominationCount[] =>
  PKR_DENOMINATIONS.map((d) => ({ value: d.value, kind: d.kind, quantity: 0 }))

export const normalizeCounts = (counts: DenominationCount[] = []): DenominationCount[] => {
  const map = new Map<string, DenominationCount>()
  counts.forEach((row) => {
    const kind: DenominationKind = row.kind === 'coin' ? 'coin' : 'note'
    const key = denominationKey(Number(row.value), kind)
    map.set(key, {
      value: Number(row.value),
      kind,
      quantity: Math.max(0, Math.floor(Number(row.quantity || 0))),
    })
  })
  return PKR_DENOMINATIONS.map((d) => {
    const key = denominationKey(d.value, d.kind)
    return map.get(key) || { value: d.value, kind: d.kind, quantity: 0 }
  })
}

export const formatMoney = (value: number) =>
  `Rs ${Number(value || 0).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

export const getDenominationLabel = (value: number, kind: DenominationKind) => {
  const match = PKR_DENOMINATIONS.find((d) => d.value === value && d.kind === kind)
  return match?.label || `Rs ${value} ${kind}`
}
