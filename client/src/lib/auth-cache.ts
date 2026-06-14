import { getElectronAPI, isElectronApp } from '@/lib/sync/electron'
import { ENCRYPTED_TOKEN_PREFIX, looksLikeJwt } from '@/lib/auth-token'

export const AUTH_CACHE_KEYS = {
  user: 'cached_user',
  token: 'cached_token',
  email: 'cached_email',
} as const

export { ENCRYPTED_TOKEN_PREFIX, looksLikeJwt, isEncryptedStoredToken } from '@/lib/auth-token'

async function protectCachedToken(token: string): Promise<string> {
  if (!isElectronApp()) return token
  const electron = getElectronAPI()
  if (!electron?.secure?.encrypt) return token
  try {
    const encrypted = await electron.secure.encrypt(token)
    return encrypted ? `${ENCRYPTED_TOKEN_PREFIX}${encrypted}` : token
  } catch {
    return token
  }
}

async function unprotectCachedToken(stored: string): Promise<string> {
  if (!stored.startsWith(ENCRYPTED_TOKEN_PREFIX)) {
    return looksLikeJwt(stored) ? stored : ''
  }
  const payload = stored.slice(ENCRYPTED_TOKEN_PREFIX.length)
  if (!isElectronApp()) return ''
  const electron = getElectronAPI()
  if (!electron?.secure?.decrypt) return ''
  try {
    const decrypted = await electron.secure.decrypt(payload)
    return looksLikeJwt(decrypted) ? decrypted : ''
  } catch {
    return ''
  }
}

export async function saveAuthCache(user: unknown, token: string, email: string): Promise<void> {
  const storedToken = await protectCachedToken(token)
  localStorage.setItem(AUTH_CACHE_KEYS.user, JSON.stringify(user))
  localStorage.setItem(AUTH_CACHE_KEYS.token, storedToken)
  localStorage.setItem(AUTH_CACHE_KEYS.email, email.trim().toLowerCase())
}

export async function getAuthCache(): Promise<{
  user: Record<string, unknown>
  token: string
  email: string | null
} | null> {
  try {
    const userStr = localStorage.getItem(AUTH_CACHE_KEYS.user)
    const storedToken = localStorage.getItem(AUTH_CACHE_KEYS.token)
    if (!userStr || !storedToken) return null
    const user = JSON.parse(userStr)
    if (!user?.id) return null
    const token = await unprotectCachedToken(storedToken)
    return {
      user,
      token,
      email: localStorage.getItem(AUTH_CACHE_KEYS.email),
    }
  } catch {
    return null
  }
}

export async function restoreSessionFromCache(): Promise<boolean> {
  const cache = await getAuthCache()
  if (!cache || !looksLikeJwt(cache.token)) return false

  localStorage.setItem('accessToken', cache.token)
  localStorage.setItem('user', JSON.stringify(cache.user))
  return true
}

/** Remove offline/cached credentials so logout cannot auto-restore the session. */
export function clearAuthCache(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(AUTH_CACHE_KEYS.user)
  localStorage.removeItem(AUTH_CACHE_KEYS.token)
  localStorage.removeItem(AUTH_CACHE_KEYS.email)
}

/** Clear all client-side auth/session keys used by login, offline mode, and branch scope. */
export function clearAllAuthStorage(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  localStorage.removeItem('user')
  localStorage.removeItem('activeBranchId')
  localStorage.removeItem('activeBranchName')
  localStorage.removeItem('offlineMode')
  clearAuthCache()
}

function normalizeLoginIdentifier(value: string): string {
  return value.trim().toLowerCase()
}

export function emailMatchesCache(
  inputEmail: string,
  cache: { email: string | null; user: Record<string, unknown> },
): boolean {
  const normalizedInput = normalizeLoginIdentifier(inputEmail)
  const cachedEmail = cache.email ? normalizeLoginIdentifier(cache.email) : null
  if (cachedEmail && cachedEmail === normalizedInput) return true

  const userEmail =
    typeof cache.user.email === 'string' ? normalizeLoginIdentifier(cache.user.email) : null
  if (userEmail && userEmail === normalizedInput) return true

  const userId = cache.user.id != null ? String(cache.user.id) : null
  if (userId && userId === inputEmail.trim()) return true

  return false
}

export async function tryOfflineLogin(
  email: string,
): Promise<{ user: Record<string, unknown>; token: string } | null> {
  const cache = await getAuthCache()
  if (!cache || !emailMatchesCache(email, cache)) return null
  return { user: cache.user, token: cache.token }
}

export function isNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const err = error as { message?: string; code?: string; response?: unknown }
  if (err.message === 'Network Error') return true
  if (err.code === 'ERR_NETWORK' || err.code === 'ECONNABORTED') return true
  if (!err.response && err.message?.toLowerCase().includes('abort')) return true
  return false
}

export function isApiUnreachable(error: unknown): boolean {
  if (isNetworkError(error)) return true
  if (!error || typeof error !== 'object') return false

  const err = error as {
    status?: number
    data?: { message?: string }
    message?: string
    code?: string
    response?: { status?: number; data?: { message?: string } }
  }

  const status = err.status ?? err.response?.status
  if (typeof status === 'number' && status >= 500) return true

  const message = (
    err.message ||
    err.data?.message ||
    err.response?.data?.message ||
    ''
  ).toLowerCase()

  if (
    message.includes('econnreset') ||
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('internal server error')
  ) {
    return true
  }

  return err.code === 'ECONNRESET'
}
