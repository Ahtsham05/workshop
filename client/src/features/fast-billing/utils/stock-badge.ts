/** Same thresholds/colors as the Invoice item row's stock pill, for visual consistency. */
export function stockBadgeClasses(remaining: number) {
  if (remaining <= 0) return 'bg-red-100 text-red-700'
  if (remaining <= 5) return 'bg-red-50 text-red-500'
  if (remaining <= 20) return 'bg-amber-50 text-amber-600'
  return 'bg-green-50 text-green-700'
}

export function stockDotClasses(remaining: number) {
  if (remaining <= 0) return 'bg-red-500'
  if (remaining <= 5) return 'bg-red-400'
  if (remaining <= 20) return 'bg-amber-400'
  return 'bg-green-500'
}

export function stockLabel(remaining: number) {
  if (remaining < 0) return `${Math.abs(remaining)} over stock`
  if (remaining === 0) return 'Out of stock'
  return `${remaining} left`
}
