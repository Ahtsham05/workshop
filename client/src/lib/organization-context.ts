import { type MenuVisibility, normalizeBusinessType } from '@/lib/business-types'

const ORG_BUSINESS_TYPE_KEY = 'activeOrganizationBusinessType'

export function setActiveOrganizationBusinessType(value: string | null | undefined) {
  if (!value) return
  try {
    localStorage.setItem(ORG_BUSINESS_TYPE_KEY, value)
  } catch {
    // ignore quota / private mode
  }
}

export function getActiveOrganizationBusinessType(): string | null {
  try {
    return localStorage.getItem(ORG_BUSINESS_TYPE_KEY)
  } catch {
    return null
  }
}

/** Prefer org business type (sidebar / guards) over stale user profile field. */
export function resolveActiveBusinessType(userBusinessType?: string | null): string {
  const orgType = getActiveOrganizationBusinessType()
  return normalizeBusinessType(orgType || userBusinessType)
}

const ORG_MENU_VISIBILITY_KEY = 'activeOrganizationMenuVisibility'

/** Cached copy of the org's Settings → Menu & Pages choices, for the synchronous route guard. */
export function setActiveOrganizationMenuVisibility(value: MenuVisibility | null | undefined) {
  try {
    localStorage.setItem(ORG_MENU_VISIBILITY_KEY, JSON.stringify(value ?? {}))
  } catch {
    // ignore quota / private mode
  }
}

export function getActiveOrganizationMenuVisibility(): MenuVisibility {
  try {
    const raw = localStorage.getItem(ORG_MENU_VISIBILITY_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}
