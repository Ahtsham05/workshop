import { isApiUnreachable } from '@/lib/auth-cache'
import { fetchWithTimeout } from '@/lib/api-timeout'
import { getElectronAPI, isElectronApp } from '@/lib/sync/electron'

type OfflineRequestArgs = {
  url: string
  method?: string
  body?: unknown
}

function resolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.toString()
  return input.url
}

function buildRelativePath(url: string): string {
  const base = import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:3000/v1'
  if (url.startsWith(base)) {
    return url.slice(base.length) || '/'
  }
  try {
    const parsed = new URL(url)
    return `${parsed.pathname.replace(/^\/v1/, '')}${parsed.search}`
  } catch {
    return url
  }
}

function parseBody(init?: RequestInit): unknown {
  if (!init?.body) return undefined
  if (typeof init.body === 'string') {
    try {
      return JSON.parse(init.body)
    } catch {
      return init.body
    }
  }
  return undefined
}

async function cacheSuccessfulGet(url: string, method: string, response: Response) {
  const electron = getElectronAPI()
  if (!electron?.http?.cacheResponse || method !== 'GET' || !response.ok) return

  try {
    const cloned = response.clone()
    const data = await cloned.json()
    await electron.http.cacheResponse({
      method,
      path: buildRelativePath(url),
      status: response.status,
      data,
    })
  } catch {
    // ignore non-json responses
  }
}

function buildOfflineResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data ?? null), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export async function tryOfflineHttpRequest(args: OfflineRequestArgs): Promise<Response | null> {
  const electron = getElectronAPI()
  if (!electron?.http?.offlineRequest) return null

  const result = await electron.http.offlineRequest({
    method: args.method || 'GET',
    path: buildRelativePath(args.url),
    body: args.body,
  })

  return buildOfflineResponse(result.status || 200, result.data)
}

export async function offlineAwareFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (!isElectronApp()) {
    return fetchWithTimeout(input, init)
  }

  const url = resolveRequestUrl(input)
  const method = (init?.method || 'GET').toUpperCase()
  const body = parseBody(init)
  const electron = getElectronAPI()

  const isOffline = typeof navigator !== 'undefined' && !navigator.onLine

  if (!isOffline) {
    try {
      const response = await fetchWithTimeout(input, init)
      if (response.ok) {
        await cacheSuccessfulGet(url, method, response)

        if (method === 'GET' && electron?.http?.mergeResponse) {
          try {
            const cloned = response.clone()
            const data = await cloned.json()
            const merged = await electron.http.mergeResponse({
              method,
              path: buildRelativePath(url),
              data,
            })
            return buildOfflineResponse(response.status, merged)
          } catch {
            return response
          }
        }
      } else if (response.status >= 502 && method === 'GET') {
        const offlineResponse = await tryOfflineHttpRequest({ url, method, body })
        if (offlineResponse) return offlineResponse
      }
      return response
    } catch (error) {
      if (!isApiUnreachable(error)) throw error
    }
  }

  const offlineResponse = await tryOfflineHttpRequest({ url, method, body })
  if (offlineResponse) return offlineResponse

  throw new Error('Offline and no cached data available')
}

export async function tryOfflineAxiosFallback(config: {
  url?: string
  method?: string
  data?: unknown
  baseURL?: string
}): Promise<{ data: unknown; status: number; offline: boolean } | null> {
  if (!isElectronApp()) return null

  const base = config.baseURL || import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:3000/v1'
  const path = config.url || '/'
  const url = path.startsWith('http') ? path : `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`

  const response = await tryOfflineHttpRequest({
    url,
    method: (config.method || 'GET').toUpperCase(),
    body: config.data,
  })

  if (!response) return null
  const data = await response.json()
  return { data, status: response.status, offline: true }
}

export async function cacheAxiosGetResponse(config: {
  url?: string
  method?: string
  baseURL?: string
  status?: number
  data?: unknown
}) {
  const electron = getElectronAPI()
  if (!electron?.http?.cacheResponse) return
  if ((config.method || 'get').toUpperCase() !== 'GET') return
  if (!config.status || config.status < 200 || config.status >= 300) return

  const base = config.baseURL || import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:3000/v1'
  const path = config.url || '/'
  const url = path.startsWith('http') ? path : `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`

  await electron.http.cacheResponse({
    method: 'GET',
    path: buildRelativePath(url),
    status: config.status,
    data: config.data,
  })
}

export function shouldUseOfflineFallback(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  return isApiUnreachable(error)
}
