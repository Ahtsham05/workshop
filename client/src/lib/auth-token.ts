export const ENCRYPTED_TOKEN_PREFIX = 'enc:v1:'

export function looksLikeJwt(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return false
  if (token.startsWith(ENCRYPTED_TOKEN_PREFIX)) return false
  return token.split('.').length === 3
}

export function isEncryptedStoredToken(token: string | null | undefined): boolean {
  return Boolean(token && token.startsWith(ENCRYPTED_TOKEN_PREFIX))
}
