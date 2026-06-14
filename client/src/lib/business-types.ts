export const BUSINESS_TYPE_OPTIONS = [
  { value: 'mobile_shop', label: 'Mobile Shop' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'factory', label: 'Factory' },
  { value: 'retail', label: 'Retail' },
  { value: 'wholesale', label: 'Wholesale' },
  { value: 'wholesale_retail', label: 'Wholesale to Retail' },
  { value: 'services', label: 'Services' },
  { value: 'restaurant', label: 'Restaurant / Food & Beverage' },
  { value: 'education', label: 'Education' },
  { value: 'school', label: 'School' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'other', label: 'Other' },
] as const

const BUSINESS_TYPE_ALIASES: Record<string, string> = {
  mobileshope: 'mobile_shop',
  'mobile shop': 'mobile_shop',
  'mobile-shop': 'mobile_shop',
  'wholesale to retail': 'wholesale_retail',
  'wholesaler to retail': 'wholesale_retail',
  'whole saler to retail': 'wholesale_retail',
  'wholesale-retail': 'wholesale_retail',
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

export const isSchoolBusiness = (value?: string | null) => {
  return normalizeBusinessType(value) === 'school'
}

export const isWholesaleRetailBusiness = (value?: string | null) => {
  return normalizeBusinessType(value) === 'wholesale_retail'
}

export const isRestaurantBusiness = (value?: string | null) => {
  return normalizeBusinessType(value) === 'restaurant'
}

/** Cash Book & Track Cash — available for all org types except school and restaurant */
export const CASH_BOOK_EXCLUDED_BUSINESS_TYPES = ['school', 'restaurant'] as const

export const isCashBookBusiness = (value?: string | null) => {
  const type = normalizeBusinessType(value)
  return !CASH_BOOK_EXCLUDED_BUSINESS_TYPES.includes(
    type as (typeof CASH_BOOK_EXCLUDED_BUSINESS_TYPES)[number],
  )
}