import type { FetchArgs } from '@reduxjs/toolkit/query'

/** Default timeout for read-only API requests. */
export const DEFAULT_API_TIMEOUT_MS = 30_000

/** Timeout for create/update/delete requests. */
export const MUTATION_API_TIMEOUT_MS = 60_000

/** Timeout for bulk/batch endpoints that process many records sequentially. */
export const BATCH_API_TIMEOUT_MS = 120_000

/** @deprecated Use DEFAULT_API_TIMEOUT_MS */
export const API_TIMEOUT_MS = DEFAULT_API_TIMEOUT_MS

export function resolveRequestTimeoutMs(
  url: string,
  method = 'GET',
  explicitTimeout?: number,
): number {
  if (typeof explicitTimeout === 'number' && explicitTimeout > 0) {
    return explicitTimeout
  }

  const path = url.toLowerCase()
  if (path.includes('/batch') || path.includes('send-bulk') || path.includes('send-to-all')) {
    return BATCH_API_TIMEOUT_MS
  }

  const normalizedMethod = method.toUpperCase()
  if (normalizedMethod !== 'GET' && normalizedMethod !== 'HEAD') {
    return MUTATION_API_TIMEOUT_MS
  }

  return DEFAULT_API_TIMEOUT_MS
}

export function applyRequestTimeout(args: string): string
export function applyRequestTimeout(args: FetchArgs): FetchArgs
export function applyRequestTimeout(args: string | FetchArgs): string | FetchArgs {
  if (typeof args === 'string') return args

  const method = (args.method || 'GET').toUpperCase()
  return {
    ...args,
    timeout: args.timeout ?? resolveRequestTimeoutMs(args.url, method),
  }
}

export function createTimeoutSignal(
  existingSignal?: AbortSignal | null | undefined,
  timeoutMs: number = DEFAULT_API_TIMEOUT_MS,
): AbortSignal {
  if (typeof AbortSignal.timeout === 'function') {
    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    if (!existingSignal) return timeoutSignal
    return AbortSignal.any([timeoutSignal, existingSignal])
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  const onAbort = () => {
    clearTimeout(timeoutId)
    controller.abort()
  }

  if (existingSignal) {
    if (existingSignal.aborted) {
      onAbort()
    } else {
      existingSignal.addEventListener('abort', onAbort, { once: true })
    }
  }

  controller.signal.addEventListener(
    'abort',
    () => clearTimeout(timeoutId),
    { once: true },
  )

  return controller.signal
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url
  const method = (init?.method || 'GET').toUpperCase()
  const resolvedTimeout = timeoutMs ?? resolveRequestTimeoutMs(url, method)
  const signal = createTimeoutSignal(init?.signal ?? undefined, resolvedTimeout)
  return fetch(input, { ...init, signal })
}

export function isRequestTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false

  const err = error as {
    status?: string | number
    error?: string
    message?: string
    name?: string
    code?: string
  }

  if (err.status === 'TIMEOUT_ERROR') return true
  if (err.code === 'ECONNABORTED') return true
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true

  const message = (err.error || err.message || '').toLowerCase()
  return message.includes('timeout') || message.includes('abort')
}

export function getTimeoutErrorMessage(action = 'save'): string {
  return `Request timed out while trying to ${action}. Your data may already be saved — please check the list below before trying again.`
}
