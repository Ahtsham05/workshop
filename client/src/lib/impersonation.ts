import { clearStoredAppearance } from '@/lib/appearance'

/**
 * "Login as user" (platform support) on the client.
 *
 * Starting a session parks the admin's own login (tokens, user, branch) in localStorage,
 * swaps in the customer's short-lived support token, and hard-reloads so every store and
 * RTK Query cache starts clean as that user. Ending restores the admin's login exactly as it
 * was and reloads back to where the admin started. Nothing here ever sees a password.
 */
const BACKUP_KEY = 'impersonation:admin-backup'
const STATE_KEY = 'impersonation:state'
const AUTH_KEYS = ['accessToken', 'refreshToken', 'user', 'activeBranchId', 'activeBranchName'] as const

export type ImpersonationState = {
  id: string
  expiresAt: string
  targetName: string
  organizationName: string
  adminName: string
}

export type ImpersonationStartResult = {
  user: { id: string; name?: string; email?: string } & Record<string, unknown>
  tokens: { access: { token: string; expires: string } }
  session: ImpersonationState
}

const apiBase = () => (import.meta.env.VITE_BACKEND_URL as string | undefined) || 'http://localhost:3000/v1'

export function getImpersonation(): ImpersonationState | null {
  try {
    if (!localStorage.getItem(BACKUP_KEY)) return null
    const raw = localStorage.getItem(STATE_KEY)
    return raw ? (JSON.parse(raw) as ImpersonationState) : null
  } catch {
    return null
  }
}

export function startImpersonation(result: ImpersonationStartResult, returnTo: string) {
  if (getImpersonation()) throw new Error('Already in a support session — return to your admin account first.')
  const backup: Record<string, string | null> = { returnTo }
  AUTH_KEYS.forEach((k) => {
    backup[k] = localStorage.getItem(k)
  })
  localStorage.setItem(BACKUP_KEY, JSON.stringify(backup))
  localStorage.setItem(STATE_KEY, JSON.stringify(result.session))
  localStorage.setItem('accessToken', result.tokens.access.token)
  localStorage.setItem('user', JSON.stringify(result.user))
  // No refresh token on purpose: the support session cannot be extended.
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('activeBranchId')
  localStorage.removeItem('activeBranchName')
  clearStoredAppearance()
  window.location.assign('/')
}

/** Return to the admin's own account. `notifyServer` ends the session server-side too. */
export function endImpersonation({ notifyServer = true }: { notifyServer?: boolean } = {}) {
  let backup: Record<string, string | null> | null = null
  try {
    backup = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null')
  } catch {
    backup = null
  }
  const token = localStorage.getItem('accessToken')
  if (notifyServer && token) {
    // keepalive: the request survives the reload below.
    fetch(`${apiBase()}/auth/impersonation/end`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
      keepalive: true,
    }).catch(() => {})
  }
  AUTH_KEYS.forEach((k) => {
    const v = backup?.[k]
    if (v == null) localStorage.removeItem(k)
    else localStorage.setItem(k, v)
  })
  localStorage.removeItem(BACKUP_KEY)
  localStorage.removeItem(STATE_KEY)
  clearStoredAppearance()
  window.location.assign(backup?.returnTo || '/admin?tab=users')
}

/** Drop any parked session (used when the whole login is cleared, e.g. sign-out). */
export function clearImpersonationStorage() {
  localStorage.removeItem(BACKUP_KEY)
  localStorage.removeItem(STATE_KEY)
}
