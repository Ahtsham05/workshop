export const BUSINESS_TYPE_OPTIONS = [
  { value: 'mobile_shop', label: 'Mobile Shop' },
  { value: 'pharmacy', label: 'Pharmacy' },
  { value: 'factory', label: 'Manufacturing / Factory' },
  { value: 'retail', label: 'Retail' },
  { value: 'wholesale', label: 'Wholesale' },
  { value: 'wholesale_retail', label: 'Wholesale to Retail' },
  { value: 'distributor', label: 'Wholesaler / Distributors' },
  { value: 'services', label: 'Services' },
  { value: 'restaurant', label: 'Restaurant / Food & Beverage' },
  { value: 'education', label: 'Education' },
  { value: 'school', label: 'School' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'other', label: 'Other' },
] as const

/**
 * What a brand-new account picks during onboarding. Deliberately a few choices, not
 * twelve: the value only decides which module set you get — the mobile-dealer tools, the
 * school tools, manufacturing, the lean wholesale/distribution set, and the standard
 * ERP everyone else uses. The full BUSINESS_TYPE_OPTIONS list above still exists for accounts created
 * before this and for editing the business profile later.
 */
export const ONBOARDING_BUSINESS_TYPES = [
  {
    value: 'retail',
    label: 'Retail & Commerce',
    description: 'Shops, stores and service businesses — invoicing, inventory, purchasing and accounting.',
  },
  {
    value: 'distributor',
    label: 'Wholesale & Distribution',
    description: 'Wholesalers and distributors — bulk invoicing, stock, purchasing, credit control and ledgers, without the payroll, salesman and messaging tools.',
  },
  {
    value: 'mobile_shop',
    label: 'Mobile & Communication',
    description: 'Phone dealers — IMEI/serial tracking, SIM sales, device trade-ins and carrier load.',
  },
  {
    value: 'factory',
    label: 'Manufacturing',
    description: 'Factories and workshops — bills of materials, production orders, material issue, finished goods and quality control.',
  },
  {
    value: 'school',
    label: 'Education',
    description: 'Schools and academies — students, tuition billing, attendance, exams and the parent portal.',
  },
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
  wholesaler: 'distributor',
  distributors: 'distributor',
  'wholesaler distributors': 'distributor',
  'wholesaler / distributors': 'distributor',
  'wholesale & distribution': 'distributor',
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

export const isDistributorBusiness = (value?: string | null) => {
  return normalizeBusinessType(value) === 'distributor'
}

/**
 * Wholesale / distribution businesses only sell to known accounts: New Invoice and Fast
 * Billing hide "Walk-in Customer" (and its free-text name field) and won't save until a
 * registered customer is picked. Old walk-in invoices still open and edit as before.
 */
export const requiresRegisteredCustomer = (value?: string | null) => {
  const type = normalizeBusinessType(value)
  return type === 'distributor' || type === 'wholesale'
}

/**
 * Wholesale / distribution keep City, State and Country on every customer and supplier
 * (Add/Edit forms, lists, Excel import, invoice "Sold To" block). Other types keep the
 * single free-text address.
 */
export const usesContactLocation = (value?: string | null) => requiresRegisteredCustomer(value)

/**
 * Wholesale / distribution get a "With logo / Without logo" choice next to every invoice Print
 * button, whatever the invoice template — lib/print-branding.
 */
export const usesPrintBrandingChoice = (value?: string | null) => requiresRegisteredCustomer(value)

/**
 * Which menu pages an organization shows — two layers:
 *  1. Business-type defaults: whole modules a type doesn't use start switched off
 *     (BUSINESS_TYPE_HIDDEN_MODULES).
 *  2. The organization's own choices from Settings → Menu & Pages (`menuVisibility` on the
 *     Organization: page URL → on/off). These always win over the defaults.
 * When several rules match a page, the most specific one decides (so switching off
 * "/hr" doesn't also switch off "/hr/employees" if that page was left on).
 * Applied to the sidebar, direct URLs (route guard), Reports/Accounts tabs, the Roles &
 * Permissions screen and Quick Links. Server mirror: server/src/config/businessTypes.js.
 * Nothing is ever deleted — switching a page back on brings it back as it was.
 */
export type HideableModule = 'hr' | 'branches' | 'salesmen' | 'communications'

/** Page URL (as in the sidebar, query string included) → shown (true) / hidden (false). */
export type MenuVisibility = Record<string, boolean>

export const BUSINESS_TYPE_HIDDEN_MODULES: Record<string, readonly HideableModule[]> = {
  distributor: ['salesmen', 'communications'],
}

/** App paths that belong to each hideable module. A `?tab=` entry matches that tab only. */
export const HIDEABLE_MODULE_PATHS: Record<HideableModule, readonly string[]> = {
  hr: ['/hr'],
  branches: ['/branches', '/branch-overview'],
  salesmen: ['/salesmen', '/reports?tab=salesman-commission'],
  communications: ['/whatsapp', '/sms/log'],
}

/** Permission groups (lib/permission-registry.ts) each hideable module owns. */
export const HIDEABLE_MODULE_PERMISSION_GROUPS: Record<HideableModule, readonly string[]> = {
  hr: ['hr_employees', 'hr_departments', 'hr_designations', 'hr_attendance', 'hr_leaves', 'hr_payroll'],
  branches: ['branches'],
  salesmen: ['salesmen', 'commission_rules', 'commission_ledger'],
  // The 'whatsapp' group stays: it also covers connecting WhatsApp to send invoices.
  communications: ['sms', 'communication_log'],
}

export const getHiddenModules = (businessType?: string | null): readonly HideableModule[] =>
  BUSINESS_TYPE_HIDDEN_MODULES[normalizeBusinessType(businessType)] ?? []

/** Does `url` fall under `rule`? A rule without a query also covers sub-paths; one with a query needs those params. */
export const menuPathMatches = (url: string, rule: string) => {
  const [path, query = ''] = url.split('?')
  const [basePath, baseQuery] = rule.split('?')
  const cleanPath = path.replace(/\/+$/, '') || '/'
  if (!baseQuery) return cleanPath === basePath || (basePath !== '/' && cleanPath.startsWith(`${basePath}/`))
  if (cleanPath !== basePath) return false
  const params = new URLSearchParams(query)
  return [...new URLSearchParams(baseQuery)].every(([key, value]) => params.get(key) === value)
}

/**
 * True when `url` (path, optionally with a query string) is switched off for this
 * organization — by its business-type defaults or by its own Menu & Pages settings.
 */
export const isPathHiddenForBusiness = (
  businessType: string | null | undefined,
  url?: string | null,
  overrides?: MenuVisibility | null,
) => {
  if (!url) return false
  let best: { length: number; hidden: boolean; override: boolean } | null = null
  const consider = (rule: string, hidden: boolean, override: boolean) => {
    if (!menuPathMatches(url, rule)) return
    if (!best || rule.length > best.length || (rule.length === best.length && override && !best.override)) {
      best = { length: rule.length, hidden, override }
    }
  }
  for (const module of getHiddenModules(businessType)) {
    for (const rule of HIDEABLE_MODULE_PATHS[module]) consider(rule, true, false)
  }
  for (const [rule, shown] of Object.entries(overrides ?? {})) consider(rule, !shown, true)
  return (best as { hidden: boolean } | null)?.hidden ?? false
}

/** A module counts as off only when every one of its pages is off. */
export const isModuleHiddenForBusiness = (
  businessType: string | null | undefined,
  module: HideableModule,
  overrides?: MenuVisibility | null,
) => HIDEABLE_MODULE_PATHS[module].every((path) => isPathHiddenForBusiness(businessType, path, overrides))

/** True when a permission group belongs to a module that is off for this organization. */
export const isPermissionGroupHiddenForBusiness = (
  businessType: string | null | undefined,
  groupId: string,
  overrides?: MenuVisibility | null,
) =>
  (Object.keys(HIDEABLE_MODULE_PERMISSION_GROUPS) as HideableModule[]).some(
    (module) =>
      HIDEABLE_MODULE_PERMISSION_GROUPS[module].includes(groupId) &&
      isModuleHiddenForBusiness(businessType, module, overrides),
  )

/**
 * Normalizes the Settings → Menu & Pages draft into what gets saved: only pages that
 * differ from the business-type default, plus explicit entries for any listed page a
 * broader entry would otherwise flip (e.g. "/hr" off but "/hr/employees" left on).
 */
export const buildMenuVisibility = (
  businessType: string | null | undefined,
  pageUrls: readonly string[],
  shown: (url: string) => boolean,
): MenuVisibility => {
  const out: MenuVisibility = {}
  for (const url of pageUrls) {
    const isShown = shown(url)
    if (isShown === !isPathHiddenForBusiness(businessType, url)) continue
    out[url] = isShown
  }
  let changed = true
  while (changed) {
    changed = false
    for (const url of pageUrls) {
      if (url in out) continue
      const isShown = shown(url)
      if (isPathHiddenForBusiness(businessType, url, out) === isShown) {
        out[url] = isShown
        changed = true
      }
    }
  }
  return out
}
