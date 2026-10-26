import type { PackSizeDto, PackingLineInput } from '@/stores/manufacturing.api'

const EPS = 1e-6
const round = (n: number) => Math.round(n * 1e6) / 1e6

export type PackCounts = Record<string, number | null | undefined>

export interface PackingSummary {
  /** Lines with a count, ready to post. */
  lines: PackingLineInput[]
  packs: number
  /** Bulk the packs hold, in the bulk unit. */
  packed: number
  /** What is left unpacked of `available` (the sheet's "extra packing"); < 0 = over. */
  loose: number
  over: boolean
  materials: {
    id: string
    name: string
    unit: string
    need: number
    available: number
    short: number
    /** Kept in production stock: what is on the floor (used first). */
    inProduction?: number
  }[]
  shortMaterials: string[]
}

/**
 * What a set of pack counts means against `available` bulk: the bulk packed, what stays
 * loose, and the packing material it uses (with shortages). Mirrors the server
 * (packing.service.js#planLines) so the screen never promises what posting refuses.
 */
export function packingSummary(
  sizes: PackSizeDto[],
  counts: PackCounts,
  available: number
): PackingSummary {
  const lines: PackingLineInput[] = []
  let packed = 0
  let packs = 0
  const materials = new Map<string, PackingSummary['materials'][number]>()
  sizes.forEach((s) => {
    const qty = Number(counts[s.id]) || 0
    if (qty <= 0) return
    lines.push({ packSizeId: s.id, quantity: qty })
    packs += qty
    packed += qty * s.contentQuantity
    s.materials.forEach((m) => {
      const entry = materials.get(m.id) || {
        id: m.id,
        name: m.name,
        unit: m.unit,
        need: 0,
        available: m.available,
        short: 0,
        inProduction: m.fromProductionStock ? (m.inProduction ?? 0) : undefined,
      }
      entry.need = round(entry.need + qty * m.quantity)
      materials.set(m.id, entry)
    })
  })
  const list = [...materials.values()].map((m) => ({
    ...m,
    short: Math.max(0, round(m.need - m.available)),
  }))
  packed = round(packed)
  return {
    lines,
    packs: round(packs),
    packed,
    loose: round(available - packed),
    over: packed > available + EPS,
    materials: list,
    shortMaterials: list.filter((m) => m.short > EPS).map((m) => m.name),
  }
}

/** Most whole packs of `size` that fit in what the other sizes leave of `available`. */
export function maxPacks(
  sizes: PackSizeDto[],
  counts: PackCounts,
  available: number,
  size: PackSizeDto
) {
  const others = sizes.reduce(
    (s, x) =>
      x.id === size.id
        ? s
        : s + (Number(counts[x.id]) || 0) * x.contentQuantity,
    0
  )
  return Math.max(
    0,
    Math.floor((available - others + EPS) / size.contentQuantity)
  )
}

/** "20 × 1 KG pouch" — what one pack holds, for labels. */
export const packInner = (s: Pick<PackSizeDto, 'innerCount' | 'innerName'>) =>
  s.innerCount > 1 || s.innerName
    ? `${s.innerCount > 1 ? `${s.innerCount} × ` : ''}${s.innerName || ''}`.trim()
    : ''
