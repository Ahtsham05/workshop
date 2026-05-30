import type { ExpenseCategory } from '@/stores/expenseCategory.api'

/** One list for Add and Edit: API catalog + names from ledger + current field value */
export function mergeWalletCategoriesForPicker(
  catalog: ExpenseCategory[],
  extraNames: string[],
  currentValue = '',
): ExpenseCategory[] {
  const byKey = new Map<string, ExpenseCategory>()
  const add = (cat: ExpenseCategory) => {
    const key = cat.name.trim().toLowerCase()
    if (!key) return
    if (!byKey.has(key)) byKey.set(key, cat)
  }

  for (const cat of catalog) add(cat)
  for (const name of extraNames) {
    const trimmed = name.trim()
    if (!trimmed) continue
    add({
      id: `ledger-${trimmed.toLowerCase()}`,
      name: trimmed,
      color: '#94a3b8',
      isDefault: false,
    })
  }
  const current = currentValue.trim()
  if (current) {
    add({
      id: `current-${current.toLowerCase()}`,
      name: current,
      color: '#94a3b8',
      isDefault: false,
    })
  }

  const list = Array.from(byKey.values())
  list.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? 1 : -1
    return a.name.localeCompare(b.name)
  })
  return list
}
