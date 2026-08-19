/** Every money amount in this app is Pakistani Rupees — see aiAssistant.service.js businessContext. */
export function formatMoney(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return 'Rs 0'
  return `Rs ${Math.round(value).toLocaleString()}`
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '0'
  return value.toLocaleString()
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return ''
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}
