import type { Product } from '@/features/invoice'
import type { Supplier } from '../index'

/** API uses `id` (mongoose toJSON); legacy UI types use `_id`. */
export function resolveEntityId(
  entity: { id?: string; _id?: string } | null | undefined,
): string {
  if (!entity) return ''
  const id = entity.id ?? entity._id
  return id != null ? String(id) : ''
}

/** Redux supplier slice may store `{ results }` or a plain array. */
export function normalizeSuppliersList(data: unknown): Supplier[] {
  if (!data) return []
  if (Array.isArray(data)) return data as Supplier[]
  if (typeof data === 'object' && data !== null) {
    const results = (data as { results?: unknown }).results
    if (Array.isArray(results)) return results as Supplier[]
  }
  return []
}

export function normalizeProductsList(items: unknown): Product[] {
  if (!items) return []
  if (Array.isArray(items)) return items as Product[]
  return []
}

export function extractFirstPhone(raw: string | undefined | null): string {
  const text = String(raw || '')
  const matches = text.match(/(?:\+92|0)?3\d{9}|\d{10,11}/g)
  if (matches?.length) return matches[0]
  return text.split(/[,;|]/)[0]?.trim() || text.trim()
}
