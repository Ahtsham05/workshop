import { normalizeBusinessType } from '@/lib/business-types'

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
