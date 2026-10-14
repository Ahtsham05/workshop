import type { EntryProduct, PastedLine, ProductSource } from './types'

export interface PasteResult {
  resolved: { product: EntryProduct; line: PastedLine }[]
  unresolved: PastedLine[]
}

/** Barcode / SKU first, then the exact product name. */
export async function resolvePasted(
  lines: PastedLine[],
  products: ProductSource
): Promise<PasteResult> {
  const resolved: PasteResult['resolved'] = []
  const unresolved: PastedLine[] = []
  for (const line of lines) {
    const product =
      (await products.lookupCode(line.productText)) ??
      (await products.lookupName?.(line.productText)) ??
      null
    if (product) resolved.push({ product, line })
    else unresolved.push(line)
  }
  return { resolved, unresolved }
}
