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
}

/**
 * Cartesian product of every selected attribute's values.
 * Size: S,M,L  x  Color: Black,White  ->  S/Black, S/White, M/Black, M/White, L/Black, L/White
 */
export function generateVariantCombinations(selected: SelectedAttribute[]): VariantDraftRow[] {
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

  return combinations.map((attributes) => {
    const label = usable.map((attr) => attributes[attr.name]).join(' / ')
    return {
      key: label,
      attributes,
      label,
      sku: '',
      barcode: '',
      cost: 0,
      price: 0,
      quantity: 0,
    }
  })
}
