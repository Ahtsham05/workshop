export interface SelectedAttribute {
  name: string
  values: string[]
}

export interface VariantDraftRow {
  key: string
  attributes: Record<string, string>
  label: string
  sku: string
  barcode: string
  cost: number
  price: number
  quantity: number
  trackBatchOrExpiry: boolean
  // Only used when trackBatchOrExpiry is true and quantity > 0 — gives the opening
  // stock a real batch identity instead of a bare Inventory.quantity number.
  batchNumber: string
  expiryDate: string
}

/** Short, readable SKU from the variant's attribute values, e.g. "TSHIRT-S-BLACK". */
function generateSku(skuPrefix: string, attributes: Record<string, string>, usable: SelectedAttribute[]): string {
  const parts = usable.map((attr) => attributes[attr.name].toUpperCase().replace(/[^A-Z0-9]+/g, ''))
  return [skuPrefix, ...parts].filter(Boolean).join('-')
}

/** 13-digit numeric barcode, same shape as the main product barcode generator, offset per
 *  row so a whole batch of variants generated together don't collide on the same millisecond. */
function generateVariantBarcode(offset: number): string {
  const timestamp = (Date.now() + offset).toString()
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `${timestamp.slice(-10)}${random}`
}

/** Readable opening-stock batch number, e.g. "BATCH-250625-042" (date + random suffix so
 *  rows checked in the same session don't collide). */
export function generateBatchNumber(): string {
  const now = new Date()
  const y = String(now.getFullYear()).slice(-2)
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `BATCH-${y}${m}${d}-${random}`
}

/**
 * Cartesian product of every selected attribute's values.
 * Size: S,M,L  x  Color: Black,White  ->  S/Black, S/White, M/Black, M/White, L/Black, L/White
 */
export function generateVariantCombinations(
  selected: SelectedAttribute[],
  skuPrefix = ''
): VariantDraftRow[] {
  const usable = selected.filter((attr) => attr.values.length > 0)
  if (usable.length === 0) return []

  let combinations: Record<string, string>[] = [{}]
  for (const attr of usable) {
    const next: Record<string, string>[] = []
    for (const combo of combinations) {
      for (const value of attr.values) {
        next.push({ ...combo, [attr.name]: value })
      }
    }
    combinations = next
  }

  return combinations.map((attributes, index) => {
    const label = usable.map((attr) => attributes[attr.name]).join(' / ')
    return {
      key: label,
      attributes,
      label,
      sku: generateSku(skuPrefix, attributes, usable),
      barcode: generateVariantBarcode(index),
      cost: 0,
      price: 0,
      quantity: 0,
      trackBatchOrExpiry: false,
      batchNumber: '',
      expiryDate: '',
    }
  })
}
