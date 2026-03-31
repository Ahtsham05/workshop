export const BUSINESS_TYPE_OPTIONS = [
  { value: 'mobile_shop', label: 'Mobile Shop' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'factory', label: 'Factory' },
  { value: 'retail', label: 'Retail' },
  { value: 'wholesale', label: 'Wholesale' },
  { value: 'services', label: 'Services' },
  { value: 'restaurant', label: 'Restaurant / Food & Beverage' },
  { value: 'education', label: 'Education' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'other', label: 'Other' },
] as const

const BUSINESS_TYPE_ALIASES: Record<string, string> = {
  mobileshope: 'mobile_shop',
  'mobile shop': 'mobile_shop',
  'mobile-shop': 'mobile_shop',
  manufacturing: 'factory',
}

export const normalizeBusinessType = (value?: string | null) => {
  if (!value) {
    return 'other'
  }

  const normalizedValue = value.trim().toLowerCase()
  return BUSINESS_TYPE_ALIASES[normalizedValue] || normalizedValue
}

export const isMobileShopBusiness = (value?: string | null) => {
  return normalizeBusinessType(value) === 'mobile_shop'
}