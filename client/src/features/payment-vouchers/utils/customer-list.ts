export type CustomerLike = { id?: string; _id?: string; name: string; phone?: string; picture?: { url?: string; publicId?: string } }

/** Redux customer slice may store `{ results }` or a plain array — same shape as suppliers. */
export function normalizeCustomersList(data: unknown): CustomerLike[] {
  if (!data) return []
  if (Array.isArray(data)) return data as CustomerLike[]
  if (typeof data === 'object' && data !== null) {
    const results = (data as { results?: unknown }).results
    if (Array.isArray(results)) return results as CustomerLike[]
  }
  return []
}
